// Đọc activity log trực tiếp từ các file log xoay theo ngày.
// Việc GHI nằm ở middlewares/activityLogger.js (auditLogger -> pino-roll ->
// server/logs/audit-*.log). File này chỉ lo phần ĐỌC cho trang admin
// /activity-logs. Không còn phụ thuộc SQL Server hay dịch vụ ngoài nào.

const fsp = require('fs/promises');
const path = require('path');

// Phải khớp CHÍNH XÁC với auditLogger.js: mặc định <server>/logs, neo theo mã
// nguồn để không lệ thuộc thư mục chạy server.
const LOG_DIR = process.env.LOG_DIR
	? path.resolve(process.env.LOG_DIR)
	: path.join(__dirname, '..', '..', 'logs');

// Chặn quét lan man: không đọc quá ngần này file / dòng cho một lần truy vấn.
const MAX_FILES_SCANNED = 100;
const MAX_LINES_SCANNED = 200_000;

// Chỉ nhận các file do auditLogger sinh ra: audit.log, audit.2026-08-27.log, ...
const isAuditName = (name) => /^audit([.\-].*)?\.log$/i.test(name);

// Liệt kê file log, mới nhất trước (theo mtime — file đang ghi có mtime mới nhất).
const listLogFiles = async () => {
	let names;
	try {
		names = await fsp.readdir(LOG_DIR);
	} catch (err) {
		if (err.code === 'ENOENT') return []; // chưa có log nào
		throw err;
	}
	const stats = await Promise.all(
		names.filter(isAuditName).map(async (name) => {
			const full = path.join(LOG_DIR, name);
			try {
				const st = await fsp.stat(full);
				return st.isFile() ? { full, mtime: st.mtimeMs } : null;
			} catch {
				return null;
			}
		}),
	);
	return stats
		.filter(Boolean)
		.sort((a, b) => b.mtime - a.mtime)
		.slice(0, MAX_FILES_SCANNED)
		.map((s) => s.full);
};

const rowMatches = (o, { actor_id, method, search }) => {
	if (method && String(o.method || '').toUpperCase() !== method.toUpperCase())
		return false;
	if (actor_id && String(o.actor_id ?? '') !== String(actor_id)) return false;
	if (
		search &&
		!String(o.path || '').toLowerCase().includes(search.toLowerCase())
	)
		return false;
	return true;
};

// Con trỏ = trường `ts` (epoch ms có phần thập phân) của dòng cuối trang trước;
// lấy tiếp các dòng có ts NHỎ HƠN. ts tăng đơn điệu nên không sót ở ranh giới trang.
const getAll = async ({ limit = 50, cursor, actor_id, method, search } = {}) => {
	const beforeTs = cursor != null && cursor !== '' ? Number(cursor) : Infinity;
	const cutoff = Number.isNaN(beforeTs) ? Infinity : beforeTs;

	const files = await listLogFiles();
	const collected = [];
	let linesScanned = 0;
	let stop = false;

	for (const file of files) {
		let content;
		try {
			content = await fsp.readFile(file, 'utf8');
		} catch {
			continue;
		}
		const lines = content.split('\n');
		// Duyệt từ cuối file lên (dòng mới nằm cuối).
		for (let i = lines.length - 1; i >= 0; i--) {
			const line = lines[i].trim();
			if (!line) continue;
			if (++linesScanned > MAX_LINES_SCANNED) {
				stop = true;
				break;
			}

			let o;
			try {
				o = JSON.parse(line);
			} catch {
				continue; // dòng hỏng / đang ghi dở
			}
			if (o.stream !== 'audit') continue;

			const ts = typeof o.ts === 'number' ? o.ts : Date.parse(o.time);
			if (Number.isNaN(ts) || ts >= cutoff) continue;
			if (!rowMatches(o, { actor_id, method, search })) continue;

			collected.push({
				id: String(o.ts ?? o.time),
				actor_id: o.actor_id ?? null,
				actor_username: o.actor_username ?? null,
				method: o.method ?? null,
				path: o.path ?? null,
				status_code: o.status_code ?? null,
				ip_address: o.ip ?? null,
				created_at: o.time ?? new Date(ts).toISOString(),
				_ts: ts,
			});
		}
		if (stop) break;
		// Đủ dữ liệu cho trang hiện tại + phần lớn file đã ở sau con trỏ -> dừng.
		if (collected.length >= limit) break;
	}

	collected.sort((a, b) => b._ts - a._ts);
	const sliced = collected.slice(0, limit).map(({ _ts, ...row }) => row);
	const nextCursor =
		sliced.length === limit
			? String(collected[limit - 1]._ts)
			: null;

	return { data: sliced, next_cursor: nextCursor };
};

module.exports = { getAll, LOG_DIR };
