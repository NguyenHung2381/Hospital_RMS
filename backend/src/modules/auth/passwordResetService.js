// @ts-nocheck — còn lỗi kiểu khi bật checkJs; sửa xong thì xoá dòng này (xem README, Kiểm tra chất lượng)
const crypto = require('crypto');
const { getPool, sql } = require('../../config/db');
const mailService = require('../notifications/mailService');
const secretBox = require('../../utils/secretBox');
const authService = require('./authService');
const systemSettingService = require('../settings/systemSettingService');
const { bumpTokenVersion } = require('./sessionVersion');
const { checkPassword } = require('../../utils/passwordPolicy');
const { httpError } = require('../../utils/httpError');
const logger = require('../../config/logger');

const OTP_TTL_MIN = 10;
const RESEND_COOLDOWN_SEC = 60;
const MAX_ATTEMPTS = 5;

// Admin tắt ở Cấu hình hệ thống → khoá cả xin mã lẫn đặt lại (mặc định bật).
const assertEnabled = async () => {
	if ((await systemSettingService.getValue('PASSWORD_RESET_ENABLED')) === 'false') {
		throw httpError(403, 'Chức năng quên mật khẩu đang tắt, vui lòng liên hệ quản trị viên');
	}
};

const invalidOtp = () => ({ statusCode: 400, message: 'Mã OTP không đúng hoặc đã hết hạn' });

// `login` là username hoặc email (có "@"), giống ô đăng nhập. users.email chưa
// UNIQUE: email dùng chung nhiều tài khoản thì không biết là ai → coi như không có.
const findActiveUser = async (pool, login) => {
	const rows = (
		await pool.request().input('login', sql.VarChar(100), login)
			.query(`SELECT TOP 2 id, username, full_name, email FROM users
				WHERE ${login.includes('@') ? 'email' : 'username'} = @login AND is_active = 1`)
	).recordset;
	return rows.length === 1 ? rows[0] : null;
};

// Luôn trả thành công dù tài khoản/email không tồn tại — không để dò username.
// Mail tắt (MAIL_ENABLED != true) thì mã chỉ có trong log server (dev).
const requestOtp = async (login) => {
	await assertEnabled();
	const pool = await getPool();
	const user = await findActiveUser(pool, login);
	if (!user?.email) return;

	// Chống spam mail: chỉ cấp mã mới sau RESEND_COOLDOWN_SEC giây
	const recent = (
		await pool
			.request()
			.input('id', sql.VarChar(20), user.id)
			.input('sec', sql.Int, RESEND_COOLDOWN_SEC)
			.query(
				`SELECT 1 AS x FROM password_reset_otps WHERE user_id = @id AND created_at > DATEADD(SECOND, -@sec, SYSUTCDATETIME())`,
			)
	).recordset[0];
	if (recent) return;

	const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
	await pool
		.request()
		.input('id', sql.VarChar(20), user.id)
		.input('hash', sql.Char(64), secretBox.keyedHash(code))
		.input('min', sql.Int, OTP_TTL_MIN).query(`
			DELETE FROM password_reset_otps WHERE user_id = @id;
			INSERT INTO password_reset_otps (user_id, code_hash, expires_at)
			VALUES (@id, @hash, DATEADD(MINUTE, @min, SYSUTCDATETIME()));
		`);

	// Link chỉ mang tên đăng nhập, KHÔNG mang OTP (kể cả khi xin mã bằng email)
	const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
	const resetUrl = `${appUrl}/quen-mat-khau?u=${encodeURIComponent(user.username)}`;
	await mailService.send({
		to: user.email,
		subject: 'Mã xác nhận đặt lại mật khẩu',
		html: mailService.renderOtpEmail({
			fullName: user.full_name,
			code,
			ttlMin: OTP_TTL_MIN,
			resetUrl,
		}),
		attachments: [mailService.LOGO_ATTACHMENT],
	});
	if (!(await mailService.isEnabled())) logger.info(`[reset-otp] ${user.username}: ${code}`);
};

const resetPassword = async (login, code, newPassword) => {
	await assertEnabled();
	const pool = await getPool();
	const user = await findActiveUser(pool, login);
	const row =
		user &&
		(
			await pool.request().input('id', sql.VarChar(20), user.id).query(`
					SELECT user_id AS id, code_hash, attempts, expires_at,
					       CASE WHEN expires_at > SYSUTCDATETIME() THEN 1 ELSE 0 END AS alive
					FROM password_reset_otps WHERE user_id = @id`)
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

	// Route chỉ so mật khẩu với chuỗi người dùng gõ (có thể là email) → so lại với username thật.
	// Kiểm tra SAU khi OTP đúng để không lộ username cho người chưa có mã.
	const policyError = checkPassword(newPassword, { username: user.username });
	if (policyError) throw httpError(400, policyError);

	const hashed = await authService.hashPassword(newPassword);
	await pool
		.request()
		.input('id', sql.VarChar(20), row.id)
		.input('password', sql.VarChar(255), hashed).query(`
			UPDATE users SET password = @password, password_changed_at = GETDATE(), must_change_password = 0,
			       failed_login_count = 0, locked_until = NULL, updated_at = GETDATE(), updated_by = @id
			WHERE id = @id;
			DELETE FROM password_reset_otps WHERE user_id = @id;
			DELETE FROM refresh_tokens WHERE user_id = @id;
		`);
	await bumpTokenVersion(row.id, pool);
};

module.exports = { requestOtp, resetPassword };
