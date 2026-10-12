const crypto = require('crypto');
const { getPool, sql } = require('../config/db');
const mailService = require('./mailService');
const secretBox = require('../utils/secretBox');
const authService = require('./authService');
const systemSettingService = require('./systemSettingService');
const { bumpTokenVersion } = require('./sessionVersion');

const OTP_TTL_MIN = 10;
const RESEND_COOLDOWN_SEC = 60;
const MAX_ATTEMPTS = 5;

// Admin tắt ở Cấu hình hệ thống → khoá cả xin mã lẫn đặt lại (mặc định bật).
const assertEnabled = async () => {
	if ((await systemSettingService.getValue('PASSWORD_RESET_ENABLED')) === 'false') {
		throw { statusCode: 403, message: 'Chức năng quên mật khẩu đang tắt, vui lòng liên hệ quản trị viên' };
	}
};

const invalidOtp = () => ({ statusCode: 400, message: 'Mã OTP không đúng hoặc đã hết hạn' });

// Luôn trả thành công dù tài khoản/email không tồn tại — không để dò username.
// Mail tắt (MAIL_ENABLED != true) thì mã chỉ có trong log server (dev).
const requestOtp = async (username) => {
	await assertEnabled();
	const pool = await getPool();
	const user = (
		await pool
			.request()
			.input('username', sql.VarChar(50), username)
			.query(`SELECT id, full_name, email FROM users WHERE username = @username AND is_active = 1`)
	).recordset[0];
	if (!user?.email) return;

	// Chống spam mail: chỉ cấp mã mới sau RESEND_COOLDOWN_SEC giây
	const recent = (
		await pool
			.request()
			.input('id', sql.VarChar(20), user.id)
			.input('sec', sql.Int, RESEND_COOLDOWN_SEC)
			.query(`SELECT 1 AS x FROM password_reset_otps WHERE user_id = @id AND created_at > DATEADD(SECOND, -@sec, SYSUTCDATETIME())`)
	).recordset[0];
	if (recent) return;

	const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
	await pool
		.request()
		.input('id', sql.VarChar(20), user.id)
		.input('hash', sql.Char(64), secretBox.keyedHash(code))
		.input('min', sql.Int, OTP_TTL_MIN)
		.query(`
			DELETE FROM password_reset_otps WHERE user_id = @id;
			INSERT INTO password_reset_otps (user_id, code_hash, expires_at)
			VALUES (@id, @hash, DATEADD(MINUTE, @min, SYSUTCDATETIME()));
		`);

	// Link chỉ mang tên đăng nhập, KHÔNG mang OTP
	const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
	const resetUrl = `${appUrl}/quen-mat-khau?u=${encodeURIComponent(username)}`;
	await mailService.send({
		to: user.email,
		subject: 'Mã xác nhận đặt lại mật khẩu',
		html: mailService.renderOtpEmail({ fullName: user.full_name, code, ttlMin: OTP_TTL_MIN, resetUrl }),
		attachments: [mailService.LOGO_ATTACHMENT],
	});
	if (!(await mailService.isEnabled())) console.log(`[reset-otp] ${username}: ${code}`);
};

const resetPassword = async (username, code, newPassword) => {
	await assertEnabled();
	const pool = await getPool();
	const row = (
		await pool
			.request()
			.input('username', sql.VarChar(50), username)
			.query(`
				SELECT u.id, o.code_hash, o.attempts, o.expires_at,
				       CASE WHEN o.expires_at > SYSUTCDATETIME() THEN 1 ELSE 0 END AS alive
				FROM users u JOIN password_reset_otps o ON o.user_id = u.id
				WHERE u.username = @username AND u.is_active = 1`)
	).recordset[0];
	if (!row || !row.alive || row.attempts >= MAX_ATTEMPTS) throw invalidOtp();

	const given = Buffer.from(secretBox.keyedHash(String(code)));
	const stored = Buffer.from(row.code_hash);
	if (!crypto.timingSafeEqual(given, stored)) {
		await pool
			.request()
			.input('id', sql.VarChar(20), row.id)
			.query(`UPDATE password_reset_otps SET attempts = attempts + 1 WHERE user_id = @id`);
		throw invalidOtp();
	}

	const hashed = await authService.hashPassword(newPassword);
	await pool
		.request()
		.input('id', sql.VarChar(20), row.id)
		.input('password', sql.VarChar(255), hashed)
		.query(`
			UPDATE users SET password = @password, password_changed_at = GETDATE(), must_change_password = 0,
			       failed_login_count = 0, locked_until = NULL, updated_at = GETDATE(), updated_by = @id
			WHERE id = @id;
			DELETE FROM password_reset_otps WHERE user_id = @id;
			DELETE FROM refresh_tokens WHERE user_id = @id;
		`);
	await bumpTokenVersion(row.id, pool);
};

module.exports = { requestOtp, resetPassword };
