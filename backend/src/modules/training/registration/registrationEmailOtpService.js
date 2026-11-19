// OTP xác minh email trước khi gửi form đăng ký khóa đào tạo liên tục (cổng công khai).
//
//   issue    → lưu mã 6 số (băm) ở registration_email_otps, gửi mail nền, trả challenge_id
//   verify   → đúng mã ⇒ email_token (JWT 30 phút, khóa ký riêng 'registration-email')
//   readToken → payload { eh: sha256(email), sid?: staff_user_id } để đối chiếu lúc đăng ký
//
// Bảng chỉ lưu băm email (không lưu email gốc); token cũng chỉ mang băm. Mô phỏng
// passwordResetService: mã băm có khóa, giữ chỗ lượt thử nguyên tử, giới hạn lượt
// thử mỗi mã, chờ giữa 2 lần xin mã, gửi mail không chờ (thời gian phản hồi không
// phụ thuộc SMTP). Ai được xin mã cho email nào do cổng công khai quyết định.
const crypto = require('crypto');
const {
	getPool,
	sql,
	utcNowSql,
	dateAdd,
	updateReturning,
	queryBatch,
} = require('../../../config/db');
const mailService = require('../../notifications/mailService');
const systemSettingService = require('../../settings/systemSettingService');
const secretBox = require('../../../utils/secretBox');
const { signToken, verifyToken } = require('../../../utils/keys');
const { maskEmail } = require('../../../utils/maskEmail');
const { httpError } = require('../../../utils/httpError');
const logger = require('../../../config/logger');

const OTP_TTL_MIN = 10;
const RESEND_COOLDOWN_SEC = 60;
const MAX_ATTEMPTS = 5; // mỗi mã
const TOKEN_TTL = '30m';
const TOKEN_PURPOSE = 'registration-email';

const normalizeEmail = (email) =>
	String(email ?? '')
		.trim()
		.toLowerCase();
// Khớp cột email_hash char(64): sha256 email chữ thường (không khóa — chỉ để so khớp)
const hashEmail = (email) =>
	crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex');

// Mặc định bật; Cấu hình hệ thống TRAINING_REGISTRATION_EMAIL_OTP = 'false' ⇒ tắt
const isRequired = async () =>
	(await systemSettingService.getValue('TRAINING_REGISTRATION_EMAIL_OTP')) !== 'false';

const invalidOtp = () =>
	httpError(400, 'Mã xác minh không đúng hoặc đã hết hạn. Vui lòng xin mã mới.');

const deliver = async (email, code) => {
	await mailService.send({
		to: email,
		subject: 'Mã xác minh email đăng ký khóa đào tạo',
		html: mailService.renderRegistrationOtpEmail({ code, ttlMin: OTP_TTL_MIN }),
		attachments: [mailService.LOGO_ATTACHMENT],
	});
	// Chỉ cho dev (giống quên mật khẩu): production không bao giờ ghi mã ra log
	if (process.env.NODE_ENV !== 'production' && !(await mailService.isEnabled()))
		logger.info(`[registration-otp] ${maskEmail(email) ?? '(email)'}: ${code}`);
};

/**
 * Cấp mã OTP cho 1 email. Phản hồi luôn cùng hình dạng; xin lại quá sớm ⇒ 429.
 * @param {{ email: string, staffUserId?: string | null }} target email nhận mã (nội viện:
 *   email trong hồ sơ nhân sự nếu có email thật — người gọi đã chọn)
 * @returns {Promise<{ challenge_id: string, to_masked: string | null, ttl_min: number }>}
 */
const issue = async ({ email, staffUserId = null }) => {
	const emailHash = hashEmail(email);
	const pool = await getPool();
	const recent = (
		await pool
			.request()
			.input('h', sql.Char(64), emailHash)
			.input('sec', sql.Int, RESEND_COOLDOWN_SEC)
			.query(
				`SELECT 1 AS x FROM registration_email_otps WHERE email_hash = @h AND created_at > ${dateAdd('SECOND', '-@sec', utcNowSql)}`,
			)
	).recordset[0];
	if (recent)
		throw httpError(
			429,
			`Vừa gửi mã tới email này. Vui lòng chờ ${RESEND_COOLDOWN_SEC} giây rồi xin lại.`,
		);

	const challengeId = crypto.randomBytes(16).toString('hex');
	const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
	// Mã cũ của email này bị thay — mỗi email chỉ 1 mã còn hiệu lực
	await queryBatch(
		pool
			.request()
			.input('id', sql.VarChar(32), challengeId)
			.input('h', sql.Char(64), emailHash)
			.input('sid', sql.VarChar(20), staffUserId || null)
			.input('code_hash', sql.Char(64), secretBox.keyedHash(code))
			.input('min', sql.Int, OTP_TTL_MIN),
		[
			'DELETE FROM registration_email_otps WHERE email_hash = @h',
			`INSERT INTO registration_email_otps (id, email_hash, staff_user_id, code_hash, expires_at)
			 VALUES (@id, @h, @sid, @code_hash, ${dateAdd('MINUTE', '@min', utcNowSql)})`,
		],
	);

	// Gửi nền, không chờ SMTP
	deliver(email, code).catch((err) =>
		logger.error('❌ Gửi mã xác minh email đăng ký thất bại:', err.message),
	);
	return { challenge_id: challengeId, to_masked: maskEmail(email), ttl_min: OTP_TTL_MIN };
};

/**
 * Đổi mã đúng lấy email_token. Sai mã / hết hạn / hết lượt / mã đã dùng ⇒ cùng 1 lỗi 400.
 * @param {string} challengeId
 * @param {string} code
 * @returns {Promise<{ email_token: string }>}
 */
const verify = async (challengeId, code) => {
	if (!/^[a-f0-9]{32}$/.test(String(challengeId ?? ''))) throw invalidOtp();
	const pool = await getPool();
	// Giữ chỗ 1 lượt thử NGUYÊN TỬ trước khi so mã (nhiều request cùng lúc không vượt MAX_ATTEMPTS)
	const row = (
		await pool
			.request()
			.input('id', sql.VarChar(32), challengeId)
			.input('max', sql.Int, MAX_ATTEMPTS)
			.query(
				updateReturning(
					'UPDATE registration_email_otps SET attempts = attempts + 1',
					`id = @id AND attempts < @max AND expires_at > ${utcNowSql}`,
					'id, email_hash, staff_user_id, code_hash',
				),
			)
	).recordset[0];
	if (!row) throw invalidOtp();

	const given = Buffer.from(secretBox.keyedHash(String(code ?? '')));
	const stored = Buffer.from(String(row.code_hash));
	if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) throw invalidOtp();

	// Mã chỉ dùng 1 lần
	await pool
		.request()
		.input('id', sql.VarChar(32), challengeId)
		.query('DELETE FROM registration_email_otps WHERE id = @id');

	const payload = { eh: row.email_hash, jti: crypto.randomBytes(8).toString('hex') };
	if (row.staff_user_id) payload.sid = row.staff_user_id;
	return { email_token: signToken(TOKEN_PURPOSE, payload, TOKEN_TTL) };
};

/**
 * @param {unknown} token
 * @returns {{ eh: string, sid: string | null } | null} null khi thiếu / sai chữ ký / hết hạn
 */
const readToken = (token) => {
	if (typeof token !== 'string' || !token || token.length > 2000) return null;
	try {
		const p = verifyToken(TOKEN_PURPOSE, token);
		if (typeof p.eh !== 'string' || !/^[a-f0-9]{64}$/.test(p.eh)) return null;
		return { eh: p.eh, sid: typeof p.sid === 'string' ? p.sid : null };
	} catch {
		return null;
	}
};

/** So băm email của token với 1 email (thời gian không phụ thuộc vị trí sai). */
const tokenMatchesEmail = (proof, email) => {
	if (!proof || !email) return false;
	const a = Buffer.from(proof.eh);
	const b = Buffer.from(hashEmail(email));
	return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Job dọn dữ liệu (accountMaintenanceJob): mã hết hạn mà không dùng thì nằm lại mãi.
// expires_at lưu giờ UTC ⇒ so với new Date() (driver gửi Date theo UTC).
const purgeExpired = async (pool) => {
	const r = await (pool || (await getPool()))
		.request()
		.input('now', sql.DateTime2, new Date())
		.query('DELETE FROM registration_email_otps WHERE expires_at < @now');
	return r.rowsAffected?.[0] ?? 0;
};

module.exports = {
	issue,
	verify,
	readToken,
	tokenMatchesEmail,
	hashEmail,
	normalizeEmail,
	isRequired,
	purgeExpired,
	OTP_TTL_MIN,
	RESEND_COOLDOWN_SEC,
	MAX_ATTEMPTS,
};
