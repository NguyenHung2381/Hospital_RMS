const auditLogger = require('../config/auditLogger');
const { normalizeIp } = require('../utils/activityDescribe');

// Khoá nhạy cảm — so khớp theo mẫu, áp dụng ở MỌI cấp lồng nhau của body.
const SENSITIVE_KEY = /pass|token|secret|otp|authorization|cookie/i;
const MAX_BODY_LEN = 4000;
const MAX_DEPTH = 6;
const MAX_UA_LEN = 300;

// Mặc định: ghi lại MỌI request tới /api/v1 (GET, POST, PUT, PATCH, DELETE...).
// Muốn thu hẹp lại thì đặt AUDIT_LOG_METHODS, ví dụ:
//   AUDIT_LOG_METHODS=POST,PUT,PATCH,DELETE   -> chỉ ghi thao tác thay đổi dữ liệu
const ONLY_METHODS = new Set(
	(process.env.AUDIT_LOG_METHODS || '')
		.split(',')
		.map((m) => m.trim().toUpperCase())
		.filter(Boolean),
);

const redact = (value, depth = 0) => {
	if (value == null || typeof value !== 'object') return value;
	if (depth >= MAX_DEPTH) return '[…]';
	if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
	const clean = {};
	for (const [key, v] of Object.entries(value)) {
		clean[key] = SENSITIVE_KEY.test(key) ? '[hidden]' : redact(v, depth + 1);
	}
	return clean;
};

const sanitizeBody = (body) => {
	if (!body || typeof body !== 'object' || !Object.keys(body).length) return null;
	const json = JSON.stringify(redact(body));
	return json.length > MAX_BODY_LEN ? `${json.slice(0, MAX_BODY_LEN)}…` : json;
};

// Tên file người dùng tải lên (multer) — nội dung file không ghi.
const uploadedFiles = (req) => {
	const list = [];
	if (req.file) list.push(req.file);
	if (Array.isArray(req.files)) list.push(...req.files);
	else if (req.files && typeof req.files === 'object')
		for (const arr of Object.values(req.files)) if (Array.isArray(arr)) list.push(...arr);
	if (!list.length) return undefined;
	return list.slice(0, 20).map((f) => ({
		name: f.originalname,
		size: f.size,
		type: f.mimetype,
	}));
};

// Mẫu route Express đã khớp, vd /api/v1/topics/:id — gom thống kê theo endpoint
// thay vì theo từng URL cụ thể.
const routePattern = (req) =>
	req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : undefined;

// Ghi lại request tới /api/v1, kể cả /auth/login (chạy trước middleware
// authenticate nên req.user chưa có — dùng tạm req.body.username để vẫn nhận
// diện được ai đang cố đăng nhập).
//
// Mỗi request = 1 dòng JSON qua auditLogger (pino) → file. Việc ghi log không
// bao giờ được làm hỏng request chính nên không await, không throw.
const activityLogger = (req, res, next) => {
	if (ONLY_METHODS.size && !ONLY_METHODS.has(req.method)) return next();

	const startedAt = process.hrtime.bigint();

	// Bắt message lỗi (status >= 400) và id bản ghi vừa tạo từ JSON trả về —
	// không giữ cả response body để log không phình.
	let errorMessage;
	let resultId;
	const originalJson = res.json.bind(res);
	res.json = (payload) => {
		try {
			if (payload && typeof payload === 'object') {
				if (res.statusCode >= 400 && payload.message)
					errorMessage = String(payload.message).slice(0, 500);
				const d = payload.data;
				if (req.method === 'POST' && d && typeof d === 'object' && !Array.isArray(d)) {
					const id = d.id ?? d.ID ?? d.insertId;
					if (id != null && typeof id !== 'object') resultId = String(id);
				}
			}
		} catch {
			// bỏ qua — không ảnh hưởng response
		}
		return originalJson(payload);
	};

	// 'close' luôn bắn (cả khi client huỷ giữa chừng) → không sót request bị abort.
	res.on('close', () => {
		try {
			const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
			const aborted = !res.writableFinished;
			const len = Number(res.getHeader('content-length'));
			const params =
				req.params && Object.keys(req.params).length ? req.params : undefined;

			auditLogger.info(
				{
					actor_id: req.user?.id ?? null,
					actor_username: req.user?.username ?? req.body?.username ?? null,
					actor_name: req.user?.full_name ?? null,
					role_id: req.user?.role_id ?? null,
					method: req.method,
					path: req.originalUrl.slice(0, 500),
					route: routePattern(req),
					params,
					status_code: aborted ? 499 : res.statusCode,
					aborted: aborted || undefined,
					duration_ms: Math.round(durationMs * 10) / 10,
					response_bytes: Number.isFinite(len) ? len : undefined,
					ip: normalizeIp(req.ip),
					forwarded_for: req.headers['x-forwarded-for']
						? String(req.headers['x-forwarded-for'])
								.split(',')
								.map((s) => normalizeIp(s))
								.join(', ')
						: undefined,
					user_agent: (req.headers['user-agent'] || '').slice(0, MAX_UA_LEN) || undefined,
					referer: req.headers['referer'] || undefined,
					body: sanitizeBody(req.body),
					files: uploadedFiles(req),
					error: errorMessage,
					result_id: resultId,
				},
				'activity',
			);
		} catch {
			// ghi log hỏng không được làm sập tiến trình
		}
	});

	next();
};

module.exports = activityLogger;
