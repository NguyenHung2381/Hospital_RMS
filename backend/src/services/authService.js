const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const otplib = require('otplib');
const { getPool, sql } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const securityEvents = require('./securityEventService');

// Token trung gian giữa bước 1 (mật khẩu đúng) và bước 2 (mã OTP) của tài
// khoản đã bật 2FA — KHÔNG phải access token thật, không mang quyền, chỉ xác
// nhận "đã qua bước mật khẩu cho user này", mirror captcha.js (ký JWT ngắn
// hạn, không cần lưu DB). Hết hạn nhanh (5 phút) vì người dùng nhập mã ngay.
const PRE_AUTH_2FA_TTL = '5m';
const PRE_AUTH_2FA_PURPOSE = '2fa_pre_auth';

// epochTolerance=1 cho phép lệch đồng hồ ±1 bước (±30s) giữa app xác thực và
// server — người dùng thường không kịp nhập mã đúng khung 30s hiện tại.
const verifyTotp = (secret, token) =>
	otplib.verify({ secret, token, type: 'totp', epochTolerance: 1 });

// refresh_tokens.token lưu HASH, không lưu JWT gốc — nếu DB bị lộ (backup,
// SQL injection, insider) thì token đọc được từ đó không dùng lại được ngay
// (khác với password, hash không cần salt/cost cao vì refresh token đã có
// entropy lớn sẵn, sha256 là đủ và tra cứu được bằng WHERE = trực tiếp).
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Khoá tạm tài khoản sau N lần sai mật khẩu liên tiếp — chống dò mật khẩu
// theo TÀI KHOẢN (bổ sung cho rate-limit theo IP đã có ở routes/auth.js,
// vốn không chặn được kẻ tấn công rải request qua nhiều IP).
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

const recordFailedLogin = async (pool, user, ip) => {
	const attempts = (user.failed_login_count || 0) + 1;
	const locked = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;
	const lockedUntil = locked
		? new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000)
		: null;

	await pool
		.request()
		.input('id', sql.VarChar(20), user.id)
		.input('failed_login_count', sql.Int, locked ? 0 : attempts)
		.input('locked_until', sql.DateTime, lockedUntil)
		.query(`
			UPDATE users
			SET failed_login_count = @failed_login_count, locked_until = @locked_until
			WHERE id = @id
		`);

	if (locked) {
		await securityEvents.log({
			eventType: 'login_locked',
			actorId: user.id,
			targetType: 'user',
			targetId: user.id,
			ip,
			detail: `Khoá ${LOCK_DURATION_MINUTES} phút sau ${attempts} lần sai mật khẩu liên tiếp`,
		});
	}
};

const login = async (username, password, ip = null, userAgent = null) => {
	const pool = await getPool();

	const result = await pool
		.request()
		.input('username', sql.VarChar(50), username).query(`
      SELECT u.id, u.username, u.password, u.full_name, u.email, u.staff_number,
             u.role_id, u.is_active, u.department_id,
             u.account_expires_at, u.failed_login_count, u.locked_until,
             u.totp_enabled,
             r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.username = @username
    `);

	const user = result.recordset[0];
	if (!user)
		throw {
			statusCode: 401,
			message: 'Tên đăng nhập hoặc mật khẩu không đúng',
		};
	// is_active = 0 bao gồm cả TK bị vô hiệu hóa thủ công lẫn TK hết hạn
	// (sp_deactivate_expired_accounts set is_active=0 mỗi đêm)
	if (!user.is_active)
		throw {
			statusCode: 403,
			message: 'Tài khoản đã bị vô hiệu hóa hoặc hết hạn sử dụng',
		};

	if (user.locked_until && new Date(user.locked_until) > new Date()) {
		const minutesLeft = Math.ceil(
			(new Date(user.locked_until) - new Date()) / 60000,
		);
		throw {
			statusCode: 403,
			message: `Tài khoản tạm khoá do đăng nhập sai nhiều lần. Thử lại sau ${minutesLeft} phút.`,
		};
	}

	const isMatch = await bcrypt.compare(password, user.password);
	if (!isMatch) {
		await recordFailedLogin(pool, user, ip);
		throw {
			statusCode: 401,
			message: 'Tên đăng nhập hoặc mật khẩu không đúng',
		};
	}

	if (user.failed_login_count > 0 || user.locked_until) {
		await pool
			.request()
			.input('id', sql.VarChar(20), user.id)
			.query(
				`UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = @id`,
			);
	}

	// Tài khoản đã bật 2FA: dừng lại ở đây, KHÔNG phát token thật — chỉ trả 1
	// pre-auth token ngắn hạn để client gọi tiếp /auth/2fa/verify kèm mã OTP.
	if (user.totp_enabled) {
		const preAuthToken = jwt.sign(
			{ id: user.id, purpose: PRE_AUTH_2FA_PURPOSE },
			process.env.JWT_SECRET,
			{ expiresIn: PRE_AUTH_2FA_TTL },
		);
		return { requires_2fa: true, pre_auth_token: preAuthToken };
	}

	return issueTokens(pool, user, ip, userAgent);
};

// Phát access/refresh token thật + trả về profile đầy đủ — dùng chung cho
// login() thường và verify2FALogin() (bước 2 sau khi xác minh mã OTP).
const issueTokens = async (pool, user, ip, userAgent) => {
	const permissions = await loadPermissions(pool, user.role_id);

	const payload = {
		id: user.id,
		username: user.username,
		full_name: user.full_name,
		staff_number: user.staff_number ? String(user.staff_number) : null,
		role_id: user.role_id,
		department_id: user.department_id,
		account_expires_at: user.account_expires_at
			? new Date(user.account_expires_at).toISOString().split('T')[0]
			: null,
	};

	const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
		expiresIn: process.env.JWT_EXPIRES_IN || '8h',
	});

	// jti ngẫu nhiên: payload chỉ có {id} + JWT iat chỉ chính xác tới giây, nên
	// 2 lần sign trong cùng 1 giây (không hiếm với round-trip DB nhanh) cho ra
	// CHUỖI TOKEN GIỐNG NHAU — phá vỡ bảo đảm "token cũ sau rotate bị từ chối".
	const refreshToken = jwt.sign(
		{ id: user.id, jti: uuidv4() },
		process.env.JWT_REFRESH_SECRET,
		{
			expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
		},
	);

	// Store refresh token via SP (handles id generation + remember_me)
	await pool
		.request()
		.input('user_id', sql.VarChar(20), user.id)
		.input('token', sql.VarChar(64), hashToken(refreshToken))
		.input('remember_me', sql.Bit, 0)
		.execute('sp_create_refresh_token');

	await tagRefreshTokenSession(pool, hashToken(refreshToken), ip, userAgent);

	return {
		user: {
			id: user.id,
			username: user.username,
			staff_number: user.staff_number ? String(user.staff_number) : null,
			full_name: user.full_name,
			email: user.email,
			role: user.role_name,
			role_id: user.role_id,
			department_id: user.department_id,
			permissions,
		},
		access_token: accessToken,
		refresh_token: refreshToken,
	};
};

// Bước 2 của đăng nhập 2FA: tiêu thụ pre-auth token (bước 1, mật khẩu đúng) +
// xác minh mã OTP, phát token thật nếu khớp.
const verify2FALogin = async (preAuthToken, code, ip = null, userAgent = null) => {
	let decoded;
	try {
		decoded = jwt.verify(preAuthToken, process.env.JWT_SECRET);
	} catch {
		throw { statusCode: 401, message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' };
	}
	if (decoded.purpose !== PRE_AUTH_2FA_PURPOSE)
		throw { statusCode: 401, message: 'Token không hợp lệ' };

	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), decoded.id).query(`
      SELECT u.id, u.username, u.full_name, u.email, u.staff_number, u.role_id,
             u.department_id, u.account_expires_at, u.totp_secret, u.totp_enabled,
             r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = @id
    `);
	const user = result.recordset[0];
	if (!user || !user.totp_enabled || !user.totp_secret)
		throw { statusCode: 401, message: 'Tài khoản chưa bật xác thực 2 lớp' };

	const { valid } = await verifyTotp(user.totp_secret, code);
	if (!valid) {
		await securityEvents.log({
			eventType: 'login_2fa_failed',
			actorId: user.id,
			targetType: 'user',
			targetId: user.id,
			ip,
			detail: 'Sai mã xác thực 2 lớp lúc đăng nhập',
		});
		throw { statusCode: 401, message: 'Mã xác thực không đúng hoặc đã hết hạn' };
	}

	return issueTokens(pool, user, ip, userAgent);
};

// ─── 2FA: thiết lập / xác nhận / tắt (Hồ sơ cá nhân) ────────────────────────
// Sinh secret mới + lưu NGAY (totp_enabled vẫn = 0 — "đang chờ xác nhận"),
// tránh phải giữ secret ở phía client giữa 2 bước setup/verify-setup.
const setup2FA = async (userId) => {
	const pool = await getPool();
	const userRes = await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.query('SELECT username FROM users WHERE id = @id');
	const user = userRes.recordset[0];
	if (!user) throw { statusCode: 404, message: 'Người dùng không tồn tại' };

	const secret = await otplib.generateSecret();
	await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.input('secret', sql.NVarChar(255), secret)
		.query('UPDATE users SET totp_secret = @secret, totp_enabled = 0, totp_verified_at = NULL WHERE id = @id');

	const otpauthUri = otplib.generateURI({
		issuer: 'RMS Hospital',
		label: user.username,
		secret,
		type: 'totp',
	});
	return { secret, otpauth_uri: otpauthUri };
};

// Xác nhận mã OTP đầu tiên sau setup2FA() → chính thức bật 2FA cho tài khoản.
const confirm2FASetup = async (userId, code) => {
	const pool = await getPool();
	const userRes = await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.query('SELECT totp_secret FROM users WHERE id = @id');
	const user = userRes.recordset[0];
	if (!user || !user.totp_secret)
		throw { statusCode: 400, message: 'Chưa khởi tạo thiết lập 2FA, vui lòng bắt đầu lại' };

	const { valid } = await verifyTotp(user.totp_secret, code);
	if (!valid) throw { statusCode: 400, message: 'Mã xác thực không đúng' };

	await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.query('UPDATE users SET totp_enabled = 1, totp_verified_at = GETDATE() WHERE id = @id');

	await securityEvents.log({
		eventType: '2fa_enabled',
		actorId: userId,
		targetType: 'user',
		targetId: userId,
	});
};

// Tắt 2FA — yêu cầu nhập lại mật khẩu (hành động nhạy cảm, giống đổi mật khẩu).
const disable2FA = async (userId, password) => {
	const pool = await getPool();
	const userRes = await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.query('SELECT password FROM users WHERE id = @id');
	const user = userRes.recordset[0];
	if (!user) throw { statusCode: 404, message: 'Người dùng không tồn tại' };

	const isMatch = await bcrypt.compare(password, user.password);
	if (!isMatch) throw { statusCode: 400, message: 'Mật khẩu không đúng' };

	await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.query('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_verified_at = NULL WHERE id = @id');

	await securityEvents.log({
		eventType: '2fa_disabled',
		actorId: userId,
		targetType: 'user',
		targetId: userId,
	});
};

const get2FAStatus = async (userId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.query('SELECT totp_enabled FROM users WHERE id = @id');
	return { enabled: !!result.recordset[0]?.totp_enabled };
};

// Gắn IP/thiết bị vào dòng refresh_tokens vừa tạo — làm ở bước riêng (UPDATE
// sau INSERT) thay vì sửa sp_create_refresh_token, vì body của stored proc đó
// không nằm trong repo (thuộc schema nền chưa có migration gốc) nên không an
// toàn để CREATE OR ALTER lại mà không biết nó đang làm gì bên trong.
// `tokenHash` = hashToken(token gốc) — refresh_tokens.token lưu hash (xem hashToken).
const tagRefreshTokenSession = async (pool, tokenHash, ip, userAgent) => {
	try {
		await pool
			.request()
			.input('token', sql.VarChar(64), tokenHash)
			.input('ip_address', sql.VarChar(64), ip)
			.input('user_agent', sql.NVarChar(255), userAgent ? String(userAgent).slice(0, 255) : null)
			.query(
				`UPDATE refresh_tokens SET ip_address = @ip_address, user_agent = @user_agent WHERE token = @token`,
			);
	} catch (err) {
		console.error('❌ tagRefreshTokenSession failed:', err.message);
	}
};

// Danh sách quyền "resource:action" của một vai trò — trả về cho client để
// điều hướng / ẩn hiện menu. Backend vẫn tự kiểm tra qua permissionCache.
const loadPermissions = async (pool, roleId) => {
	if (!roleId) return [];
	const res = await pool.request().input('role_id', sql.VarChar(20), roleId)
		.query(`
      SELECT p.resource, p.action
      FROM permissions p
      INNER JOIN role_permissions rp ON rp.permission_id = p.id
      WHERE rp.role_id = @role_id
    `);
	return res.recordset.map((r) => `${r.resource}:${r.action}`);
};

// Xoay refresh token ở mỗi lần làm mới: phát hành token mới, xoá ngay token
// cũ. Trước đây 1 refresh token sống nguyên tới khi hết hạn (mặc định 7
// ngày) hoặc logout thủ công — lộ token là lộ quyền truy cập suốt 7 ngày.
// Rotate xong, token cũ dùng lại sẽ bị từ chối ngay ở bước SELECT bên dưới.
const refreshAccessToken = async (refreshToken, ip = null, userAgent = null) => {
	let decoded;
	try {
		decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
	} catch {
		throw {
			statusCode: 401,
			message: 'Refresh token không hợp lệ hoặc đã hết hạn',
		};
	}

	const pool = await getPool();
	const tokenHash = hashToken(refreshToken);
	const rt = await pool
		.request()
		.input('token', sql.VarChar(64), tokenHash)
		.query(
			`SELECT * FROM refresh_tokens WHERE token = @token AND expires_at > GETDATE()`,
		);

	const existing = rt.recordset[0];
	if (!existing)
		throw { statusCode: 401, message: 'Refresh token không hợp lệ' };

	const userResult = await pool
		.request()
		.input('id', sql.VarChar(20), decoded.id)
		.query(
			`SELECT u.*, r.name AS role_name FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.id=@id`,
		);

	const user = userResult.recordset[0];
	if (!user) throw { statusCode: 401, message: 'Người dùng không tồn tại' };
	const payload = {
		id: user.id,
		username: user.username,
		full_name: user.full_name,
		staff_number: user.staff_number ? String(user.staff_number) : null,
		role_id: user.role_id,
		department_id: user.department_id,
	};
	const newAccessToken = jwt.sign(payload, process.env.JWT_SECRET, {
		expiresIn: process.env.JWT_EXPIRES_IN || '8h',
	});

	const newRefreshToken = jwt.sign(
		{ id: user.id, jti: uuidv4() }, // xem ghi chú jti ở login()
		process.env.JWT_REFRESH_SECRET,
		{
			expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
		},
	);

	await pool
		.request()
		.input('user_id', sql.VarChar(20), user.id)
		.input('token', sql.VarChar(64), hashToken(newRefreshToken))
		.input('remember_me', sql.Bit, existing.remember_me ?? 0)
		.execute('sp_create_refresh_token');
	await tagRefreshTokenSession(pool, hashToken(newRefreshToken), ip, userAgent);

	await pool
		.request()
		.input('token', sql.VarChar(64), tokenHash)
		.query(`DELETE FROM refresh_tokens WHERE token = @token`);

	return { access_token: newAccessToken, refresh_token: newRefreshToken };
};

const logout = async (refreshToken) => {
	const pool = await getPool();
	await pool
		.request()
		.input('token', sql.VarChar(64), hashToken(refreshToken))
		.query(`DELETE FROM refresh_tokens WHERE token = @token`);
};

// Đăng xuất khỏi mọi thiết bị: xoá toàn bộ refresh token của người dùng
// (mỗi access token đang lưu hành vẫn sống tới khi tự hết hạn — tối đa
// JWT_EXPIRES_IN, mặc định 8h — vì kiến trúc hiện tại không có bảng
// blacklist access token; đây là đánh đổi chấp nhận được với thời hạn ngắn).
const logoutAll = async (userId, actorIp = null) => {
	const pool = await getPool();
	await pool
		.request()
		.input('user_id', sql.VarChar(20), userId)
		.query(`DELETE FROM refresh_tokens WHERE user_id = @user_id`);

	await securityEvents.log({
		eventType: 'logout_all_sessions',
		actorId: userId,
		targetType: 'user',
		targetId: userId,
		ip: actorIp,
	});
};

// Liệt kê phiên đăng nhập đang hoạt động (mỗi refresh token còn hạn = 1 phiên).
// Dùng SELECT * + lọc lại field ở tầng JS: bảng refresh_tokens thuộc schema
// nền không có trong repo (không migration gốc) nên không chắc có cột nào
// ngoài token/expires_at/remember_me — tránh tham chiếu cột chưa xác nhận
// (vd created_at) để không vỡ query nếu cột đó không tồn tại.
const listSessions = async (userId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('user_id', sql.VarChar(20), userId)
		.query(`
			SELECT *
			FROM refresh_tokens
			WHERE user_id = @user_id AND expires_at > GETDATE()
			ORDER BY expires_at DESC
		`);
	return result.recordset.map((r) => ({
		id: r.id,
		ip_address: r.ip_address ?? null,
		user_agent: r.user_agent ?? null,
		created_at: r.created_at ?? null,
		expires_at: r.expires_at,
	}));
};

const changePassword = async (userId, oldPassword, newPassword) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.query(`SELECT password FROM users WHERE id = @id`);

	const user = result.recordset[0];
	if (!user) throw { statusCode: 404, message: 'Người dùng không tồn tại' };

	const isMatch = await bcrypt.compare(oldPassword, user.password);
	if (!isMatch) throw { statusCode: 400, message: 'Mật khẩu cũ không đúng' };

	const hashed = await bcrypt.hash(newPassword, 12);
	await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.input('password', sql.VarChar(255), hashed)
		.query(
			`UPDATE users SET password = @password, password_changed_at = GETDATE(), updated_at = GETDATE(), updated_by = @id WHERE id = @id`,
		);

	// Thu hồi mọi refresh token hiện có: đổi mật khẩu thường vì nghi lộ, nên
	// không để token cũ (nếu đã bị đánh cắp trước đó) tiếp tục dùng được.
	await pool
		.request()
		.input('user_id', sql.VarChar(20), userId)
		.query(`DELETE FROM refresh_tokens WHERE user_id = @user_id`);
};

module.exports = {
	login,
	refreshAccessToken,
	logout,
	logoutAll,
	listSessions,
	changePassword,
	verify2FALogin,
	setup2FA,
	confirm2FASetup,
	disable2FA,
	get2FAStatus,
};
