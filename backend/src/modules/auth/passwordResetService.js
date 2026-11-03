const crypto = require('crypto');
const { getPool, sql } = require('../../config/db');
const mailService = require('../notifications/mailService');
const secretBox = require('../../utils/secretBox');
const credentialService = require('./credentialService');
const systemSettingService = require('../settings/systemSettingService');
const { bumpTokenVersion } = require('./sessionVersion');
const { checkPassword } = require('../../utils/passwordPolicy');
const { httpError } = require('../../utils/httpError');
const logger = require('../../config/logger');

const securityEvents = require('../audit/securityEventService');

const OTP_TTL_MIN = 10;
const RESEND_COOLDOWN_SEC = 60;
const MAX_ATTEMPTS = 5; // mỗi mã
// Tổng số lần nhập sai (mọi mã) của 1 tài khoản trong 24h. Chỉ giới hạn theo
// mã là không đủ: cứ RESEND_COOLDOWN_SEC giây là xin được mã mới với bộ đếm về
// 0 — rải qua nhiều IP thì dò được ~7.200 mã/ngày (≈0,7% trúng/ngày). Đếm event
// 'password_reset_failed' ở security_events (giống lockMinutesFor), đủ ngưỡng
// thì ngừng cấp mã và ngừng nhận mã cho tới khi cửa sổ 24h trôi qua.
const MAX_DAILY_FAILURES = 10;
const FAILURE_EVENT = 'password_reset_failed';

const recentFailures = async (pool, userId) =>
	(
		await pool
			.request()
			.input('type', sql.VarChar(50), FAILURE_EVENT)
			.input('id', sql.VarChar(50), userId).query(`
				SELECT COUNT(*) AS n FROM security_events
				WHERE event_type = @type AND target_id = @id
					AND created_at > DATEADD(HOUR, -24, GETDATE())
			`)
	).recordset[0].n;

// Admin tắt ở Cấu hình hệ thống → khóa cả xin mã lẫn đặt lại (mặc định bật).
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
				WHERE ${login.includes('@') ? 'email' : 'username'} = @login AND is_active = 'true'`)
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
	if ((await recentFailures(pool, user.id)) >= MAX_DAILY_FAILURES) return;

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

	// Gửi nền, KHÔNG chờ: SMTP mất hàng trăm ms – vài giây và chỉ chạy khi tài
	// khoản có thật — chờ thì thời gian phản hồi để lộ username nào tồn tại.
	deliverOtp(user, code).catch((err) =>
		logger.error('❌ Gửi mã đặt lại mật khẩu thất bại:', err.message),
	);
};

const deliverOtp = async (user, code) => {
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
	// Chỉ cho dev: ở production ai đọc được log là đặt lại được mật khẩu người khác
	if (process.env.NODE_ENV !== 'production' && !(await mailService.isEnabled()))
		logger.info(`[reset-otp] ${user.username}: ${code}`);
};

const resetPassword = async (login, code, newPassword, ip = null) => {
	await assertEnabled();
	const pool = await getPool();
	const user = await findActiveUser(pool, login);
	if (!user || (await recentFailures(pool, user.id)) >= MAX_DAILY_FAILURES) throw invalidOtp();

	// Giữ chỗ 1 lượt thử NGUYÊN TỬ trước khi so mã — đọc attempts rồi mới tăng
	// thì nhiều request cùng lúc đều thấy attempts = 0 và vượt MAX_ATTEMPTS.
	const row = (
		await pool.request().input('id', sql.VarChar(20), user.id).input('max', sql.Int, MAX_ATTEMPTS)
			.query(`
				UPDATE password_reset_otps SET attempts = attempts + 1
				OUTPUT INSERTED.user_id AS id, INSERTED.code_hash
				WHERE user_id = @id AND attempts < @max AND expires_at > SYSUTCDATETIME()
			`)
	).recordset[0];
	if (!row) throw invalidOtp();

	const given = Buffer.from(secretBox.keyedHash(String(code)));
	const stored = Buffer.from(row.code_hash);
	if (!crypto.timingSafeEqual(given, stored)) {
		await securityEvents.log({
			eventType: FAILURE_EVENT,
			targetType: 'user',
			targetId: user.id,
			ip,
			detail: 'Sai mã OTP đặt lại mật khẩu',
		});
		throw invalidOtp();
	}

	// Route chỉ so mật khẩu với chuỗi người dùng gõ (có thể là email) → so lại với username thật.
	// Kiểm tra SAU khi OTP đúng để không lộ username cho người chưa có mã.
	const policyError = checkPassword(newPassword, { username: user.username });
	if (policyError) throw httpError(400, policyError);

	const hashed = await credentialService.hashPassword(newPassword);
	await pool
		.request()
		.input('id', sql.VarChar(20), row.id)
		.input('password', sql.VarChar(255), hashed).query(`
			UPDATE users SET password = @password, password_changed_at = GETDATE(), must_change_password = 'false',
			       temp_password_issued_at = NULL, failed_login_count = 0, locked_until = NULL,
			       updated_at = GETDATE(), updated_by = @id
			WHERE id = @id;
			DELETE FROM password_reset_otps WHERE user_id = @id;
			DELETE FROM refresh_tokens WHERE user_id = @id;
		`);
	await bumpTokenVersion(row.id, pool);
};

module.exports = { requestOtp, resetPassword };
