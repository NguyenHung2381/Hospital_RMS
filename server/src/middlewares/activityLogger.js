const svc = require('../services/activityLogService');

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
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const sanitizeBody = (body) => {
	if (!body || typeof body !== 'object' || !Object.keys(body).length) return null;
	const clean = {};
	for (const [key, value] of Object.entries(body)) {
		clean[key] = SENSITIVE_KEYS.has(key) ? '[hidden]' : value;
	}
	const json = JSON.stringify(clean);
	return json.length > MAX_BODY_LEN ? json.slice(0, MAX_BODY_LEN) : json;
};

// Ghi lại mọi request làm thay đổi dữ liệu (POST/PUT/PATCH/DELETE), kể cả
// /auth/login (chạy trước middleware authenticate nên req.user chưa có —
// dùng tạm req.body.username để vẫn nhận diện được ai đang cố đăng nhập).
const activityLogger = (req, res, next) => {
	if (!MUTATING_METHODS.has(req.method)) return next();

	res.on('finish', () => {
		svc.enqueue({
			actor_id: req.user?.id ?? null,
			actor_username: req.user?.username ?? req.body?.username ?? null,
			method: req.method,
			path: req.originalUrl.slice(0, 255),
			status_code: res.statusCode,
			ip: req.ip,
			body: sanitizeBody(req.body),
		});
	});

	next();
};

module.exports = activityLogger;
