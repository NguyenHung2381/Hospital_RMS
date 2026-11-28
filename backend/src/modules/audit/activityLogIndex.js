// Chỉ mục trong RAM của các file audit log, dùng cho activityLogService (trang
// /activity-logs). Mỗi file log 1 mảng "dòng gọn" — thời điểm, vị trí byte trong file
// và các trường dùng để lọc / thống kê (chuỗi lặp lại dùng chung 1 bản). File log chỉ
// được NỐI THÊM: lần sau chỉ đọc phần mới ghi của file đang ghi, file đã xoay không đọc
// lại. Bản đầy đủ của 1 dòng (body, params…) đọc lại từ file theo vị trí khi cần.

const fsp = require('fs/promises');
const path = require('path');
const { describe, normalizeIp, ipKind } = require('../../utils/activityDescribe');

// Không xét quá ngần này file (mới nhất trước) cho một lần truy vấn.
const MAX_FILES_SCANNED = 100;

// Trần chỉ mục (số dòng giữ trong RAM, mỗi worker; ~150 byte / dòng): vượt thì bỏ file
// lâu không dùng tới nhất. Không ai mở trang nhật ký trong CACHE_IDLE_MS thì bỏ hết.
const CACHE_MAX_LINES = Math.max(
	10_000,
	parseInt(process.env.ACTIVITY_LOG_CACHE_LINES, 10) || 400_000,
);
const CACHE_IDLE_MS = 10 * 60_000;

// Chỉ nhận các file do auditLogger sinh ra: audit.log, audit.2026-08-27.log, ...
const isAuditName = (name) => /^audit([.-].*)?\.log$/i.test(name);

// ── Chỉ mục theo file ─────────────────────────────────────────────────────────
// fileIndex: đường dẫn → { id, bytes, rows, strs, lastUsed, pending }
//   id     inode + thời điểm tạo: file khác trùng tên (xoá rồi tạo lại) ⇒ dựng lại
//   bytes  đã đọc tới byte này (luôn ngay sau 1 ký tự xuống dòng)
//   rows   dòng gọn theo thứ tự trong file (cũ → mới)
//   strs   bảng chuỗi dùng chung của file (UA, tên, đường dẫn, mô tả… lặp lại rất nhiều)
const fileIndex = new Map();
let indexedLines = 0;
let idleTimer = null;

const dropEntry = (full) => {
	const e = fileIndex.get(full);
	if (!e) return;
	indexedLines -= e.rows.length;
	fileIndex.delete(full);
};

const clearIndex = () => {
	fileIndex.clear();
	indexedLines = 0;
};

const touchIndex = () => {
	clearTimeout(idleTimer);
	idleTimer = setTimeout(clearIndex, CACHE_IDLE_MS);
	idleTimer.unref?.();
};

// Bỏ file lâu không dùng nhất tới khi về dưới trần (giữ ít nhất 1 file)
const evict = () => {
	while (indexedLines > CACHE_MAX_LINES && fileIndex.size > 1) {
		let oldest = null;
		for (const [full, e] of fileIndex)
			if (!oldest || e.lastUsed < oldest[1].lastUsed) oldest = [full, e];
		dropEntry(oldest[0]);
	}
};

// Dòng log → dòng gọn: đủ cho rowMatches (trừ search), thống kê và gom phiên; giá trị
// giống hệt toRow (cùng describe / normalizeIp). _off / _len: vị trí dòng trong file để
// đọc lại bản đầy đủ khi trả về client.
const lightRow = (o, ts, full, off, len, intern) => {
	const d = describe(o);
	return {
		_ts: ts,
		_file: full,
		_off: off,
		_len: len,
		method: intern(o.method ?? null),
		path: intern(o.path ?? null),
		route: intern(o.route ?? null),
		status_code: o.status_code ?? null,
		duration_ms: typeof o.duration_ms === 'number' ? o.duration_ms : null,
		ip_address: intern(normalizeIp(o.ip)),
		user_agent: intern(o.user_agent ?? null),
		actor_id: intern(o.actor_id ?? null),
		actor_username: intern(o.actor_username ?? null),
		actor_name: intern(o.actor_name ?? null),
		module: intern(d.module),
		module_label: intern(d.module_label),
		action: intern(d.action),
		summary: intern(d.summary),
	};
};

const tsOf = (o) => (typeof o.ts === 'number' ? o.ts : Date.parse(o.time));

// Đọc byte [start, end) của file
const readRange = async (full, start, end) => {
	const fh = await fsp.open(full, 'r');
	try {
		const buf = Buffer.allocUnsafe(end - start);
		let pos = 0;
		while (pos < buf.length) {
			const { bytesRead } = await fh.read(buf, pos, buf.length - pos, start + pos);
			if (!bytesRead) break;
			pos += bytesRead;
		}
		return buf.subarray(0, pos);
	} finally {
		await fh.close();
	}
};

// Thêm các dòng ĐỦ (kết thúc bằng \n) trong buf (bắt đầu ở byte `base` của file) vào
// chỉ mục; dòng cuối đang ghi dở để lần sau. Byte \n không bao giờ nằm giữa 1 ký tự UTF-8
// nhiều byte nên cắt theo \n an toàn. Trả số byte đã dùng.
const appendLines = (e, full, buf, base) => {
	const end = buf.lastIndexOf(10);
	if (end < 0) return 0;
	const intern = (s) => {
		if (s == null) return s;
		const hit = e.strs.get(s);
		if (hit !== undefined) return hit;
		e.strs.set(s, s);
		return s;
	};
	for (let s = 0; s <= end;) {
		const nl = buf.indexOf(10, s);
		const line = buf.toString('utf8', s, nl).trim();
		const off = base + s;
		const len = nl - s;
		s = nl + 1;
		if (!line) continue;
		let o;
		try {
			o = JSON.parse(line);
		} catch {
			continue; // dòng hỏng
		}
		if (o.stream !== 'audit') continue;
		const ts = tsOf(o);
		if (Number.isNaN(ts)) continue;
		e.rows.push(lightRow(o, ts, full, off, len, intern));
	}
	return end + 1;
};

// Chỉ mục của 1 file, đã cập nhật tới cỡ file hiện tại. File nhỏ đi hoặc là file khác
// trùng tên ⇒ dựng lại từ đầu. Không đọc được (vừa bị xoá) ⇒ null.
const loadEntry = async ({ full, size, id }) => {
	let e = fileIndex.get(full);
	if (e && (e.id !== id || size < e.bytes)) {
		dropEntry(full);
		e = undefined;
	}
	if (!e) {
		e = { id, bytes: 0, rows: [], strs: new Map(), lastUsed: 0, pending: null };
		fileIndex.set(full, e);
	}
	e.lastUsed = Date.now();
	if (size > e.bytes) {
		const entry = e;
		// 2 request cùng lúc: request sau chờ lượt đọc đang chạy, không đọc trùng
		entry.pending ??= (async () => {
			const buf = await readRange(full, entry.bytes, size);
			const before = entry.rows.length;
			entry.bytes += appendLines(entry, full, buf, entry.bytes);
			indexedLines += entry.rows.length - before;
		})().finally(() => {
			entry.pending = null;
		});
		try {
			await entry.pending;
		} catch {
			dropEntry(full);
			return null;
		}
	}
	return e;
};

// Bản đầy đủ (toFull(o, ts) — toRow của service) của các dòng gọn: đọc lại đúng các dòng đó, mỗi file mở 1 lần.
// File đã mất / đổi (xoay vòng giữa chừng) ⇒ dùng dòng gọn, thiếu body / params…
const hydrate = async (rows, toFull) => {
	const byFile = new Map();
	for (const r of rows) {
		let list = byFile.get(r._file);
		if (!list) byFile.set(r._file, (list = []));
		list.push(r);
	}
	const full = new Map();
	for (const [file, list] of byFile) {
		let fh;
		try {
			fh = await fsp.open(file, 'r');
			for (const r of list) {
				const buf = Buffer.allocUnsafe(r._len);
				await fh.read(buf, 0, r._len, r._off);
				const o = JSON.parse(buf.toString('utf8').trim());
				if (tsOf(o) === r._ts) full.set(r, toFull(o, r._ts));
			}
		} catch {
			/* dùng dòng gọn bên dưới */
		} finally {
			await fh?.close();
		}
	}
	return rows.map((r) => full.get(r) ?? fallbackRow(r));
};

const fallbackRow = (r) => {
	const { _file, _off, _len, ...rest } = r;
	return {
		id: String(r._ts),
		params: null,
		aborted: false,
		response_bytes: null,
		ip_kind: ipKind(r.ip_address),
		forwarded_for: null,
		referer: null,
		body: null,
		files: null,
		error: null,
		result_id: null,
		role_id: null,
		created_at: new Date(r._ts).toISOString(),
		action_label: null,
		target_id: null,
		...rest,
	};
};

// Liệt kê file log trong `dir`, mới nhất trước (theo mtime — file đang ghi có mtime mới
// nhất), kèm cỡ file + định danh để cập nhật chỉ mục.
const listLogFiles = async (dir) => {
	let names;
	try {
		names = await fsp.readdir(dir);
	} catch (err) {
		if (err.code === 'ENOENT') return []; // chưa có log nào
		throw err;
	}
	const stats = await Promise.all(
		names.filter(isAuditName).map(async (name) => {
			const full = path.join(dir, name);
			try {
				const st = await fsp.stat(full);
				return st.isFile()
					? { full, mtime: st.mtimeMs, size: st.size, id: `${st.ino}:${st.birthtimeMs}` }
					: null;
			} catch {
				return null;
			}
		}),
	);
	const files = stats.filter(Boolean);
	// File đã bị xoá (pino-roll giữ tối đa N file) → bỏ chỉ mục của nó
	const alive = new Set(files.map((f) => f.full));
	for (const full of fileIndex.keys()) if (!alive.has(full)) dropEntry(full);
	return files.sort((a, b) => b.mtime - a.mtime).slice(0, MAX_FILES_SCANNED);
};

module.exports = {
	listLogFiles,
	loadEntry,
	readRange,
	hydrate,
	evict,
	touchIndex,
	clearIndex,
	CACHE_MAX_LINES,
};
