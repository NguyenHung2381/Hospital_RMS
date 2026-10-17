const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getPool, sql } = require('../../config/db');
const securityEvents = require('../audit/securityEventService');

// "Thiết bị quen" (OWASP — device cookie): trình duyệt đã đăng nhập thành công
// vào 1 tài khoản được cấp device token (client giữ trong localStorage, gửi
// kèm lúc đăng nhập). Khoá tạm tài khoản do sai mật khẩu chỉ chặn thiết bị
// LẠ — kẻ tấn công cố tình nhập sai để khoá tài khoản sẽ không chặn được chủ
// tài khoản đăng nhập trên máy quen. Thiết bị quen có bộ đếm sai riêng: sai
// quá ngưỡng thì bị thu hồi, các lần sai sau tính như thiết bị lạ.
// Không dùng MAC/IP: trình duyệt không đọc được MAC, còn IP/MAC đều giả được.
//
// Token là JWT tự chứa (không cần bảng mới): gắn mốc password_changed_at nên
// đổi/đặt lại mật khẩu là mọi device token cũ mất hiệu lực. Thu hồi do sai quá
// ngưỡng lưu ở security_events (event 'device_untrusted', target_id = did).
const DEVICE_TOKEN_TTL_DAYS = 180;
const DEVICE_TOKEN_PURPOSE = 'trusted_device';
const MAX_DEVICE_FAILED_ATTEMPTS = 10;
const MAX_TRACKED_DEVICES = 10000;

// Ký bằng khoá dẫn xuất riêng (không phải JWT_SECRET) — device token không
// bao giờ dùng được làm access token và ngược lại.
let _deviceKey = null;
const deviceKey = () => {
	if (!_deviceKey)
		_deviceKey = crypto
			.createHmac('sha256', process.env.JWT_SECRET)
			.update('rms-trusted-device')
			.digest();
	return _deviceKey;
};

const passwordStamp = (user) =>
	user.password_changed_at ? new Date(user.password_changed_at).getTime() : 0;

const failedCounts = new Map(); // did → số lần sai liên tiếp (bộ nhớ)
const revokedCache = new Set(); // did đã thu hồi (cache của security_events)

const isRevoked = async (did) => {
	if (revokedCache.has(did)) return true;
	const pool = await getPool();
	const result = await pool
		.request()
		.input('did', sql.VarChar(50), did)
		.input('days', sql.Int, DEVICE_TOKEN_TTL_DAYS + 1).query(`
			SELECT TOP 1 1 AS revoked FROM security_events
			WHERE event_type = 'device_untrusted' AND target_type = 'device'
				AND target_id = @did AND created_at > DATEADD(DAY, -@days, GETDATE())
		`);
	if (!result.recordset.length) return false;
	if (revokedCache.size >= MAX_TRACKED_DEVICES) revokedCache.clear();
	revokedCache.add(did);
	return true;
};

// Trả về { did } nếu token là thiết bị quen hợp lệ của đúng user này, ngược
// lại null (thiết bị lạ). Không bao giờ throw.
const verifyDeviceToken = async (token, user) => {
	if (typeof token !== 'string' || !token || token.length > 1000) return null;
	let decoded;
	try {
		decoded = jwt.verify(token, deviceKey(), { algorithms: ['HS256'] });
	} catch {
		return null;
	}
	if (
		decoded.purpose !== DEVICE_TOKEN_PURPOSE ||
		decoded.sub !== String(user.id) ||
		decoded.pcs !== passwordStamp(user) ||
		typeof decoded.did !== 'string'
	)
		return null;
	try {
		if (await isRevoked(decoded.did)) return null;
	} catch (err) {
		console.error('❌ trusted device revoke check failed:', err.message);
		return null;
	}
	return { did: decoded.did };
};

// Cấp (hoặc gia hạn, giữ nguyên did) device token sau khi đăng nhập thành công.
const issueDeviceToken = (user, device = null) => {
	const did = device?.did || uuidv4();
	failedCounts.delete(did);
	return jwt.sign(
		{ sub: String(user.id), did, pcs: passwordStamp(user), purpose: DEVICE_TOKEN_PURPOSE },
		deviceKey(),
		{ algorithm: 'HS256', expiresIn: `${DEVICE_TOKEN_TTL_DAYS}d` },
	);
};

// Sai mật khẩu / mã 2FA trên thiết bị quen: tăng bộ đếm của riêng thiết bị,
// đủ ngưỡng thì thu hồi (không khoá tài khoản).
const recordDeviceFailure = async (device, user, ip, reason) => {
	const count = (failedCounts.get(device.did) || 0) + 1;
	if (count < MAX_DEVICE_FAILED_ATTEMPTS) {
		if (!failedCounts.has(device.did) && failedCounts.size >= MAX_TRACKED_DEVICES)
			failedCounts.clear();
		failedCounts.set(device.did, count);
		return;
	}
	failedCounts.delete(device.did);
	revokedCache.add(device.did);
	await securityEvents.log({
		eventType: 'device_untrusted',
		actorId: user.id,
		targetType: 'device',
		targetId: device.did,
		ip,
		detail: `Thu hồi thiết bị quen của ${user.username} sau ${MAX_DEVICE_FAILED_ATTEMPTS} lần ${reason} liên tiếp`,
	});
};

module.exports = {
	MAX_DEVICE_FAILED_ATTEMPTS,
	verifyDeviceToken,
	issueDeviceToken,
	recordDeviceFailure,
};
