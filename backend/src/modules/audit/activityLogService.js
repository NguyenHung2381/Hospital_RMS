// Đọc activity log trực tiếp từ các file log xoay theo ngày.
// Việc GHI nằm ở middlewares/activityLogger.js (auditLogger -> pino-roll ->
// server/logs/audit-*.log). File này chỉ lo phần ĐỌC cho trang admin
// /activity-logs: danh sách (lọc + phân trang), thống kê và gom phiên truy cập.

const fsp = require('fs/promises');
const path = require('path');
const { describe, normalizeIp, ipKind, MODULE_LABELS } = require('../../utils/activityDescribe');

// Phải khớp CHÍNH XÁC với auditLogger.js: mặc định <server>/logs, neo theo mã
// nguồn để không lệ thuộc thư mục chạy server.
const LOG_DIR = process.env.LOG_DIR
	? path.resolve(process.env.LOG_DIR)
	: path.join(__dirname, '..', '..', '..', 'logs');

// Chặn quét lan man: không đọc quá ngần này file / dòng cho một lần truy vấn.
const MAX_FILES_SCANNED = 100;
const MAX_LINES_SCANNED = 300_000;

// Khoảng nghỉ tối đa giữa 2 request liên tiếp của cùng 1 người mà vẫn tính là
// cùng 1 phiên truy cập (mặc định 30 phút — giống cách GA/Matomo tính session).
const SESSION_GAP_MS =
	Math.max(1, parseInt(process.env.ACTIVITY_SESSION_GAP_MIN, 10) || 30) * 60_000;

// Chỉ nhận các file do auditLogger sinh ra: audit.log, audit.2026-08-27.log, ...
const isAuditName = (name) => /^audit([.-].*)?\.log$/i.test(name);

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
		.slice(0, MAX_FILES_SCANNED);
};

const toMs = (v) => {
	if (v == null || v === '') return undefined;
	const n = Number(v);
	if (Number.isFinite(n)) return n;
	const t = Date.parse(v);
	return Number.isNaN(t) ? undefined : t;
};

// Chuẩn hoá query string → bộ lọc. Dùng chung cho list / stats / sessions.
const parseFilters = (q = {}) => {
	const list = (v) =>
		v
			? String(v)
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
			: [];
	return {
		from: toMs(q.from),
		to: toMs(q.to),
		actor: q.actor ? String(q.actor).trim().toLowerCase() : undefined,
		actor_id: q.actor_id ? String(q.actor_id) : undefined,
		methods: list(q.method).map((m) => m.toUpperCase()),
		actions: list(q.action),
		modules: list(q.module),
		status: q.status || undefined, // 2xx | 3xx | 4xx | 5xx | error | mã cụ thể (404)
		actor_type: q.actor_type || undefined, // user | anonymous
		ip: q.ip ? String(q.ip).trim() : undefined,
		search: q.search ? String(q.search).trim().toLowerCase() : undefined,
		min_duration: toMs(q.min_duration),
		exclude_views: q.exclude_views === '1' || q.exclude_views === 'true',
	};
};

// Dòng log thô → object trả về cho client (kèm diễn giải nghiệp vụ).
const toRow = (o, ts) => {
	const ip = normalizeIp(o.ip);
	return {
		id: String(o.ts ?? o.time),
		actor_id: o.actor_id ?? null,
		actor_username: o.actor_username ?? null,
		actor_name: o.actor_name ?? null,
		role_id: o.role_id ?? null,
		method: o.method ?? null,
		path: o.path ?? null,
		route: o.route ?? null,
		params: o.params ?? null,
		status_code: o.status_code ?? null,
		aborted: !!o.aborted,
		duration_ms: typeof o.duration_ms === 'number' ? o.duration_ms : null,
		response_bytes: o.response_bytes ?? null,
		ip_address: ip,
		ip_kind: ipKind(ip),
		forwarded_for: o.forwarded_for ?? null,
		user_agent: o.user_agent ?? null,
		referer: o.referer ?? null,
		body: o.body ?? null,
		files: o.files ?? null,
		error: o.error ?? null,
		result_id: o.result_id ?? null,
		created_at: o.time ?? new Date(ts).toISOString(),
		...describe(o),
		_ts: ts,
	};
};

const statusMatches = (code, status) => {
	const c = Number(code) || 0;
	switch (status) {
		case '2xx':
			return c >= 200 && c < 300;
		case '3xx':
			return c >= 300 && c < 400;
		case '4xx':
			return c >= 400 && c < 500;
		case '5xx':
			return c >= 500;
		case 'error':
			return c >= 400;
		default:
			// Mã cụ thể, có thể nhiều mã: "401,403"
			return /^\d{3}(,\d{3})*$/.test(status) ? status.split(',').map(Number).includes(c) : true;
	}
};

const rowMatches = (r, f) => {
	if (f.from != null && r._ts < f.from) return false;
	if (f.to != null && r._ts > f.to) return false;
	if (f.methods.length && !f.methods.includes(String(r.method).toUpperCase())) return false;
	if (f.actions.length && !f.actions.includes(r.action)) return false;
	if (f.exclude_views && r.action === 'view') return false;
	if (f.modules.length && !f.modules.includes(r.module)) return false;
	if (f.status && !statusMatches(r.status_code, f.status)) return false;
	if (f.actor_type === 'user' && !r.actor_id) return false;
	if (f.actor_type === 'anonymous' && r.actor_id) return false;
	if (f.actor_id && String(r.actor_id ?? '') !== f.actor_id) return false;
	if (
		f.actor &&
		![r.actor_id, r.actor_username, r.actor_name].some((v) =>
			String(v ?? '')
				.toLowerCase()
				.includes(f.actor),
		)
	)
		return false;
	if (f.ip && !String(r.ip_address ?? '').includes(f.ip)) return false;
	if (f.min_duration != null && !((r.duration_ms ?? -1) >= f.min_duration)) return false;
	if (f.search) {
		const hay = `${r.path} ${r.summary} ${r.body ?? ''} ${r.error ?? ''}`.toLowerCase();
		if (!hay.includes(f.search)) return false;
	}
	return true;
};

// Duyệt log từ MỚI → CŨ, gọi onRow(row) cho mỗi dòng khớp bộ lọc có ts < before.
// onRow trả về true để dừng sớm. Trả về { truncated } nếu chạm giới hạn quét.
const scan = async (filters, { before = Infinity, onRow, stopAfterFile }) => {
	const files = await listLogFiles();
	let linesScanned = 0;

	for (const { full, mtime } of files) {
		// File sắp theo mtime giảm dần, nội dung file luôn cũ hơn mtime của nó →
		// gặp file cũ hơn mốc "từ ngày" là mọi file sau cũng vậy.
		if (filters.from != null && mtime < filters.from) break;

		let content;
		try {
			content = await fsp.readFile(full, 'utf8');
		} catch {
			continue;
		}
		const lines = content.split('\n');
		// Duyệt từ cuối file lên (dòng mới nằm cuối).
		for (let i = lines.length - 1; i >= 0; i--) {
			const line = lines[i].trim();
			if (!line) continue;
			if (++linesScanned > MAX_LINES_SCANNED) return { truncated: true };

			let o;
			try {
				o = JSON.parse(line);
			} catch {
				continue; // dòng hỏng / đang ghi dở
			}
			if (o.stream !== 'audit') continue;

			const ts = typeof o.ts === 'number' ? o.ts : Date.parse(o.time);
			if (Number.isNaN(ts) || ts >= before) continue;
			if (filters.from != null && ts < filters.from) continue;
			if (filters.to != null && ts > filters.to) continue;

			const row = toRow(o, ts);
			if (!rowMatches(row, filters)) continue;
			if (onRow(row)) return { truncated: false };
		}
		if (stopAfterFile?.()) break;
	}
	return { truncated: false };
};

const stripInternal = ({ _ts, ...row }) => row;

// 2 kiểu phân trang:
//   - ?page=N  → phân trang theo số trang, trả kèm total (trang admin dùng).
//     Phải quét hết các dòng khớp bộ lọc để đếm tổng, nhưng CHỈ GIỮ các dòng
//     của trang được hỏi (+ trang cuối, phòng khi page vượt quá tổng) — các
//     dòng khác đếm xong là bỏ, RAM không tăng theo số dòng log.
//     scan() duyệt file theo mtime giảm dần, mỗi file từ cuối lên → thứ tự
//     đã là mới → cũ nên vị trí thứ i khi duyệt chính là thứ hạng của dòng.
//   - ?cursor=ts → keyset cũ: lấy tiếp các dòng có ts NHỎ HƠN dòng cuối trang
//     trước. ts tăng đơn điệu nên không sót ở ranh giới trang.
const getAll = async (query = {}) => {
	const limit = Math.min(parseInt(query.limit, 10) || 20, 200);
	const filters = parseFilters(query);

	if (query.page != null && query.cursor == null) {
		const page = Math.max(1, parseInt(query.page, 10) || 1);
		const start = (page - 1) * limit;
		const end = start + limit;
		let total = 0;
		const wanted = [];
		let tail = []; // các dòng của "khối trang" đang duyệt — cuối cùng là trang cuối
		const { truncated } = await scan(filters, {
			onRow: (row) => {
				if (total >= start && total < end) wanted.push(row);
				if (total % limit === 0) tail = [];
				tail.push(row);
				total++;
				return false;
			},
		});
		const totalPages = Math.max(1, Math.ceil(total / limit));
		const safePage = Math.min(page, totalPages);
		const rows = safePage === page ? wanted : tail;
		rows.sort((a, b) => b._ts - a._ts);
		return {
			data: rows.map(stripInternal),
			total,
			page: safePage,
			limit,
			total_pages: totalPages,
			truncated,
		};
	}

	const cursor = toMs(query.cursor);
	const collected = [];

	await scan(filters, {
		before: cursor ?? Infinity,
		onRow: (row) => {
			collected.push(row);
			return false;
		},
		// Đủ dữ liệu cho trang hiện tại -> dừng sau khi xong file đang đọc.
		stopAfterFile: () => collected.length >= limit,
	});

	collected.sort((a, b) => b._ts - a._ts);
	const sliced = collected.slice(0, limit);
	const nextCursor = sliced.length === limit ? String(sliced[limit - 1]._ts) : null;

	return { data: sliced.map(stripInternal), next_cursor: nextCursor };
};

const percentile = (sorted, p) => {
	if (!sorted.length) return null;
	const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
	return sorted[Math.max(0, idx)];
};

const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

// Gom request theo người dùng thành các phiên: 2 request cách nhau > SESSION_GAP
// là 2 phiên khác nhau. Request ẩn danh (chưa đăng nhập) gom theo IP.
const buildSessions = (rows) => {
	const byKey = new Map();
	// rows đang MỚI → CŨ; đảo lại để duyệt theo thời gian.
	for (let i = rows.length - 1; i >= 0; i--) {
		const r = rows[i];
		const key = r.actor_id ? `u:${r.actor_id}` : `ip:${r.ip_address}`;
		let list = byKey.get(key);
		if (!list) byKey.set(key, (list = []));
		let s = list[list.length - 1];
		if (!s || r._ts - s._end > SESSION_GAP_MS) {
			s = {
				id: `${key}:${r._ts}`,
				actor_id: r.actor_id,
				actor_username: r.actor_username,
				actor_name: r.actor_name,
				started_at: r.created_at,
				ended_at: r.created_at,
				_start: r._ts,
				_end: r._ts,
				request_count: 0,
				write_count: 0,
				error_count: 0,
				login: false,
				logout: false,
				ips: new Set(),
				user_agents: new Set(),
				modules: new Map(),
				total_duration_ms: 0,
			};
			list.push(s);
		}
		s._end = r._ts;
		s.ended_at = r.created_at;
		s.request_count++;
		if (!['view', 'login', 'login_failed'].includes(r.action) && r.method !== 'GET')
			s.write_count++;
		if ((r.status_code ?? 0) >= 400) s.error_count++;
		if (r.action === 'login') s.login = true;
		if (r.action === 'logout') s.logout = true;
		if (r.actor_name && !s.actor_name) s.actor_name = r.actor_name;
		if (r.actor_username && !s.actor_username) s.actor_username = r.actor_username;
		if (r.ip_address) s.ips.add(r.ip_address);
		if (r.user_agent) s.user_agents.add(r.user_agent);
		if (r.module) s.modules.set(r.module_label, (s.modules.get(r.module_label) || 0) + 1);
		s.total_duration_ms += r.duration_ms ?? 0;
	}

	const all = [];
	for (const list of byKey.values()) all.push(...list);
	return all
		.sort((a, b) => b._end - a._end)
		.map(({ _start, _end, ips, user_agents, modules, ...s }) => ({
			...s,
			duration_ms: _end - _start,
			total_duration_ms: round1(s.total_duration_ms),
			ips: [...ips],
			user_agents: [...user_agents].slice(0, 5),
			top_modules: [...modules.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 5)
				.map(([label, count]) => ({ label, count })),
		}));
};

// Thống kê + phiên truy cập cho khoảng thời gian đang lọc.
const getStats = async (query = {}) => {
	const filters = parseFilters(query);
	// Không giới hạn khoảng thời gian thì mặc định 7 ngày gần nhất để không
	// quét toàn bộ 100 file log mỗi lần mở trang.
	if (filters.from == null && filters.to == null) filters.from = Date.now() - 7 * 86_400_000;

	// Chỉ giữ các trường thống kê/gom phiên cần tới (bỏ body, params, referer…)
	// và dùng chung 1 bản cho chuỗi lặp lại (User-Agent, tên, IP, mô tả…):
	// hàng trăm nghìn dòng mà mỗi dòng tự giữ 1 bản UA ~150 byte là tốn hàng
	// chục MB RAM vô ích.
	const pool = new Map();
	const intern = (s) => {
		if (s == null) return s;
		const hit = pool.get(s);
		if (hit !== undefined) return hit;
		pool.set(s, s);
		return s;
	};
	const rows = [];
	const { truncated } = await scan(filters, {
		onRow: (r) => {
			rows.push({
				_ts: r._ts,
				created_at: r.created_at,
				actor_id: intern(r.actor_id),
				actor_username: intern(r.actor_username),
				actor_name: intern(r.actor_name),
				method: intern(r.method),
				path: intern(r.path.split('?')[0]),
				route: intern(r.route),
				status_code: r.status_code,
				duration_ms: r.duration_ms,
				ip_address: intern(r.ip_address),
				user_agent: intern(r.user_agent),
				module: intern(r.module),
				module_label: intern(r.module_label),
				action: r.action,
				summary: intern(r.summary),
			});
			return false;
		},
	});
	pool.clear();

	const durations = [];
	const users = new Map();
	const endpoints = new Map();
	const byAction = {};
	const byModule = new Map();
	const byHour = Array(24).fill(0);
	const ips = new Set();
	let errors = 0;
	let serverErrors = 0;
	let writes = 0;
	let logins = 0;
	let failedLogins = 0;

	for (const r of rows) {
		const code = r.status_code ?? 0;
		if (code >= 400) errors++;
		if (code >= 500) serverErrors++;
		if (r.method !== 'GET' && r.action !== 'login' && r.action !== 'login_failed') writes++;
		if (r.action === 'login') logins++;
		if (r.action === 'login_failed') failedLogins++;
		if (r.duration_ms != null) durations.push(r.duration_ms);
		if (r.ip_address) ips.add(r.ip_address);
		byAction[r.action] = (byAction[r.action] || 0) + 1;

		const m = byModule.get(r.module) || {
			module: r.module,
			label: r.module_label,
			count: 0,
			writes: 0,
		};
		m.count++;
		if (r.action !== 'view') m.writes++;
		byModule.set(r.module, m);

		// Giờ theo múi Việt Nam (UTC+7).
		byHour[new Date(r._ts + 7 * 3_600_000).getUTCHours()]++;

		const uKey = r.actor_id || r.actor_username || `ip:${r.ip_address}`;
		const u = users.get(uKey) || {
			actor_id: r.actor_id,
			actor_username: r.actor_username,
			actor_name: r.actor_name,
			count: 0,
			writes: 0,
			errors: 0,
			last_at: r.created_at,
		};
		u.count++;
		if (r.action !== 'view') u.writes++;
		if (code >= 400) u.errors++;
		if (!u.actor_name && r.actor_name) u.actor_name = r.actor_name;
		users.set(uKey, u);

		const epKey = `${r.method} ${r.route || r.path.split('?')[0]}`;
		const ep = endpoints.get(epKey) || {
			endpoint: epKey,
			summary: r.summary,
			count: 0,
			errors: 0,
			durations: [],
		};
		ep.count++;
		if (code >= 400) ep.errors++;
		if (r.duration_ms != null) ep.durations.push(r.duration_ms);
		endpoints.set(epKey, ep);
	}

	durations.sort((a, b) => a - b);
	const epList = [...endpoints.values()].map(({ durations: d, ...ep }) => {
		d.sort((a, b) => a - b);
		return {
			...ep,
			avg_ms: d.length ? round1(d.reduce((s, x) => s + x, 0) / d.length) : null,
			p95_ms: round1(percentile(d, 95)),
			max_ms: round1(d[d.length - 1] ?? null),
		};
	});

	return {
		range: {
			from: filters.from != null ? new Date(filters.from).toISOString() : null,
			to: filters.to != null ? new Date(filters.to).toISOString() : null,
		},
		truncated,
		totals: {
			requests: rows.length,
			users: new Set(rows.filter((r) => r.actor_id).map((r) => r.actor_id)).size,
			ips: ips.size,
			writes,
			errors,
			server_errors: serverErrors,
			logins,
			failed_logins: failedLogins,
			avg_ms: durations.length
				? round1(durations.reduce((s, x) => s + x, 0) / durations.length)
				: null,
			p95_ms: round1(percentile(durations, 95)),
		},
		by_action: byAction,
		by_hour: byHour,
		top_modules: [...byModule.values()].sort((a, b) => b.count - a.count).slice(0, 12),
		top_users: [...users.values()].sort((a, b) => b.count - a.count).slice(0, 15),
		slowest_endpoints: epList
			.filter((e) => e.avg_ms != null)
			.sort((a, b) => b.p95_ms - a.p95_ms)
			.slice(0, 10),
		error_endpoints: epList
			.filter((e) => e.errors > 0)
			.sort((a, b) => b.errors - a.errors)
			.slice(0, 10),
		sessions: buildSessions(rows).slice(0, 300),
		session_gap_minutes: SESSION_GAP_MS / 60_000,
		module_options: MODULE_LABELS,
	};
};

module.exports = { getAll, getStats, LOG_DIR };
