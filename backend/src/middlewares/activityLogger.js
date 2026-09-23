const auditLogger = require('../config/auditLogger');

const SENSITIVE_KEYS = new Set([
	'password',
	'old_password',
	'new_password',
	'token',
	'refresh_token',
	'accessToken',
	'refreshToken',
]);
const MAX_BODY_LEN = 1000;

// Mặc định: ghi lại MỌI request tới /api/v1 (GET, POST, PUT, PATCH, DELETE...).
// Muốn thu hẹp lại thì đặt AUDIT_LOG_METHODS, ví dụ:
//   AUDIT_LOG_METHODS=POST,PUT,PATCH,DELETE   -> chỉ ghi thao tác thay đổi dữ liệu
const ONLY_METHODS = new Set(
	(process.env.AUDIT_LOG_METHODS || '')
		.split(',')
		.map((m) => m.trim().toUpperCase())
		.filter(Boolean),
);

const sanitizeBody = (body) => {
	if (!body || typeof body !== 'object' || !Object.keys(body).length) return null;
	const clean = {};
	for (const [key, value] of Object.entries(body)) {
		clean[key] = SENSITIVE_KEYS.has(key) ? '[hidden]' : value;
	}
	const json = JSON.stringify(clean);
	return json.length > MAX_BODY_LEN ? json.slice(0, MAX_BODY_LEN) : json;
};

// Ghi lại request tới /api/v1, kể cả /auth/login (chạy trước middleware
// authenticate nên req.user chưa có — dùng tạm req.body.username để vẫn nhận
// diện được ai đang cố đăng nhập).
//
// Trước đây enqueue vào buffer rồi INSERT batch xuống SQL Server; nay chỉ ghi
// 1 dòng JSON qua auditLogger (pino) → file. Việc ghi log không bao giờ được
// làm hỏng request chính nên không await, không throw.
const activityLogger = (req, res, next) => {
	if (ONLY_METHODS.size && !ONLY_METHODS.has(req.method)) return next();

	res.on('finish', () => {
		auditLogger.info(
			{
				actor_id: req.user?.id ?? null,
				actor_username: req.user?.username ?? req.body?.username ?? null,
				method: req.method,
				path: req.originalUrl.slice(0, 255),
				status_code: res.statusCode,
				ip: req.ip,
				body: sanitizeBody(req.body),
			},
			'activity',
		);
	});

	next();
};

module.exports = activityLogger;
