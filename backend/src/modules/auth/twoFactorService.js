const { verifyToken } = require('../../utils/keys');
const crypto = require('crypto');
const otplib = require('otplib');
const { getPool, sql } = require('../../config/db');
const userStatusCache = require('../../permissions/userStatusCache');
const securityEvents = require('../audit/securityEventService');
const trustedDevices = require('./trustedDeviceService');
const secretBox = require('../../utils/secretBox');
const { consumeOnce } = require('../../utils/oneTimeToken');
const { httpError } = require('../../utils/httpError');
const logger = require('../../config/logger');
const {
	assertPassword,
	isLocked,
	lockedError,
	recordFailedLogin,
	resetFailedLogins,
} = require('./credentialService');
const { issueTokens } = require('./sessionTokenService');

// Token trung gian giữa bước 1 (mật khẩu đúng) và bước 2 (mã OTP) của tài
// khoản đã bật 2FA — KHÔNG phải access token thật, không mang quyền, chỉ xác
// nhận "đã qua bước mật khẩu cho user này", mirror captcha.js (ký JWT ngắn
// hạn, không cần lưu DB). Hết hạn nhanh (5 phút) vì người dùng nhập mã ngay.
const PRE_AUTH_2FA_TTL = '5m';

// epochTolerance=1 cho phép lệch đồng hồ ±1 bước (±30s) giữa app xác thực và
// server — người dùng thường không kịp nhập mã đúng khung 30s hiện tại.
const verifyTotp = (secret, token) =>
	/** @type {Promise<{ valid: boolean, timeStep?: number }>} */ (
		otplib.verify({ secret, token, strategy: 'totp', epochTolerance: 1 })
	);

// ─── 2FA: dùng chung ────────────────────────────────────────────────────────
// Secret TOTP lưu mã hoá (utils/secretBox.js). Giá trị cũ chưa mã hoá vẫn đọc
// được; lần dùng thành công kế tiếp sẽ mã hoá lại (reencryptIfLegacy).
// Giải mã lỗi = khoá (TOTP_ENC_KEY / secrets/totp.key) đã đổi so với lúc lưu
// secret: không sinh được mã nữa, người dùng phải được quản trị đặt lại 2FA.
const readSecret = (stored) => {
	try {
		return secretBox.decrypt(stored);
	} catch (err) {
		logger.error('❌ Không giải mã được secret 2FA — khoá mã hoá không khớp:', err.message);
		throw httpError(
			409,
			'Không đọc được cấu hình xác thực 2 lớp của tài khoản. Vui lòng liên hệ quản trị viên để đặt lại 2FA.',
		);
	}
};

const reencryptIfLegacy = async (pool, userId, stored) => {
	if (!stored || secretBox.isEncrypted(stored)) return;
	await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.input('secret', sql.NVarChar(255), secretBox.encrypt(stored))
		.query('UPDATE users SET totp_secret = @secret WHERE id = @id');
};

// Ghi nhận bước thời gian của mã vừa dùng — nguyên tử: chỉ thành công khi bước
// này MỚI HƠN bước đã dùng. Trả false = mã đã được dùng (bị nhìn trộm / chặn
// bắt rồi phát lại trong khung ±30 giây).
const claimTotpStep = async (pool, userId, step) => {
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.input('step', sql.BigInt, step).query(`
			-- OUTPUT ... INTO: bảng users có trigger audit, OUTPUT trần không được phép
			DECLARE @r TABLE (id VARCHAR(20));
			UPDATE users SET totp_last_step = @step
			OUTPUT INSERTED.id INTO @r
			WHERE id = @id AND (totp_last_step IS NULL OR totp_last_step < @step);
			SELECT COUNT(*) AS n FROM @r;
		`);
	return r.recordset[0].n === 1;
};

// Mã 6 số từ ứng dụng xác thực: đúng + chưa từng dùng.
const checkTotp = async (pool, user, code) => {
	if (!/^\d{6}$/.test(code)) return false;
	const { valid, timeStep } = await verifyTotp(readSecret(user.totp_secret), code);
	return valid && (await claimTotpStep(pool, user.id, timeStep));
};

// ── Mã khôi phục (khi mất điện thoại) ──
// 10 mã dạng "xxxx-xxxx" (~40 bit), mỗi mã dùng 1 lần, lưu HMAC có khoá ngoài DB.
const BACKUP_CODE_COUNT = 10;
const BACKUP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const normalizeBackupCode = (code) =>
	String(code)
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
const isBackupCodeShape = (code) => normalizeBackupCode(code).length === 8;

const generateBackupCodes = () =>
	Array.from({ length: BACKUP_CODE_COUNT }, () => {
		let s = '';
		for (let i = 0; i < 8; i++) s += BACKUP_ALPHABET[crypto.randomInt(BACKUP_ALPHABET.length)];
		return `${s.slice(0, 4)}-${s.slice(4)}`;
	});

// Thay toàn bộ mã khôi phục của user bằng bộ mới, trả mã gốc (hiển thị 1 lần).
const replaceBackupCodes = async (pool, userId) => {
	const codes = generateBackupCodes();
	const req = pool.request().input('user_id', sql.VarChar(20), userId);
	codes.forEach((c, i) =>
		req.input(`h${i}`, sql.Char(64), secretBox.keyedHash(normalizeBackupCode(c))),
	);
	await req.query(`
		DELETE FROM user_backup_codes WHERE user_id = @user_id;
		INSERT INTO user_backup_codes (user_id, code_hash)
		VALUES ${codes.map((_, i) => `(@user_id, @h${i})`).join(', ')};
	`);
	return codes;
};

// Dùng 1 mã khôi phục — nguyên tử (2 request cùng mã thì chỉ 1 thành công).
const consumeBackupCode = async (pool, userId, code) => {
	if (!isBackupCodeShape(code)) return false;
	const r = await pool
		.request()
		.input('user_id', sql.VarChar(20), userId)
		.input('hash', sql.Char(64), secretBox.keyedHash(normalizeBackupCode(code))).query(`
			UPDATE user_backup_codes SET used_at = SYSUTCDATETIME()
			OUTPUT INSERTED.id
			WHERE user_id = @user_id AND code_hash = @hash AND used_at IS NULL
		`);
	return r.recordset.length === 1;
};

const countBackupCodes = async (pool, userId) =>
	(
		await pool
			.request()
			.input('user_id', sql.VarChar(20), userId)
			.query(
				'SELECT COUNT(*) AS n FROM user_backup_codes WHERE user_id = @user_id AND used_at IS NULL',
			)
	).recordset[0].n;

// Bước 2 của đăng nhập 2FA: pre-auth token (bước 1, mật khẩu đúng) + mã OTP
// 6 số HOẶC 1 mã khôi phục. Pre-auth token chỉ dùng được cho 1 lần đăng nhập
// thành công (nhập sai mã thì vẫn thử lại được với token đó).
const verify2FALogin = async (
	preAuthToken,
	code,
	ip = null,
	userAgent = null,
	deviceToken = null,
) => {
	let decoded;
	try {
		decoded = verifyToken('pre-auth-2fa', preAuthToken);
	} catch {
		throw httpError(401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
	}

	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(20), decoded.id).query(`
      SELECT u.id, u.username, u.full_name, u.email, u.staff_number, u.role_id,
             u.department_id, u.account_expires_at, u.totp_secret, u.totp_enabled,
             u.failed_login_count, u.locked_until, u.password_changed_at,
             u.must_change_password, u.is_active,
             r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = @id
    `);
	const user = result.recordset[0];
	if (!user || !user.totp_enabled || !user.totp_secret)
		throw httpError(401, 'Tài khoản chưa bật xác thực 2 lớp');
	// Tài khoản có thể bị vô hiệu hoá trong 5 phút giữa bước mật khẩu và bước OTP
	if (!user.is_active) throw httpError(403, 'Tài khoản đã bị vô hiệu hóa hoặc hết hạn sử dụng');

	const device = await trustedDevices.verifyDeviceToken(deviceToken, user);
	if (!device && isLocked(user)) throw lockedError(user.locked_until);

	const input = String(code ?? '').trim();
	let usedBackupCode = false;
	let valid = await checkTotp(pool, user, input);
	if (!valid && (await consumeBackupCode(pool, user.id, input))) {
		valid = true;
		usedBackupCode = true;
	}
	if (!valid) {
		await securityEvents.log({
			eventType: 'login_2fa_failed',
			actorId: user.id,
			targetType: 'user',
			targetId: user.id,
			ip,
			detail: 'Sai (hoặc dùng lại) mã xác thực 2 lớp lúc đăng nhập',
		});
		// Sai OTP cũng tính vào bộ đếm khoá (của thiết bị quen, hoặc của tài
		// khoản với thiết bị lạ) — chặn dò mã 6 số từ nhiều IP.
		if (device) {
			await trustedDevices.recordDeviceFailure(device, user, ip, 'sai mã 2FA');
		} else {
			const lockedUntil = await recordFailedLogin(pool, user, ip, 'sai mã 2FA');
			if (lockedUntil) throw lockedError(lockedUntil);
		}
		throw httpError(401, 'Mã xác thực không đúng, đã hết hạn hoặc đã được sử dụng');
	}

	// Pre-auth token + mã đúng chỉ đổi lấy phiên đăng nhập đúng 1 lần
	if (!(await consumeOnce('pre-auth-2fa', decoded.jti, 10 * 60)))
		throw httpError(401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');

	if (usedBackupCode) {
		await securityEvents.log({
			eventType: '2fa_backup_code_used',
			actorId: user.id,
			targetType: 'user',
			targetId: user.id,
			ip,
			detail: `Đăng nhập bằng mã khôi phục — còn ${await countBackupCodes(pool, user.id)} mã`,
		});
	}
	await reencryptIfLegacy(pool, user.id, user.totp_secret);
	if (!device) await resetFailedLogins(pool, user);
	return issueTokens(pool, user, ip, userAgent, device, decoded.rm === 1);
};

// ─── 2FA: thiết lập / xác nhận / tắt (Hồ sơ cá nhân) ────────────────────────
// Sinh secret mới + lưu NGAY (mã hoá, totp_enabled vẫn = 0 — "đang chờ xác
// nhận"), tránh phải giữ secret ở phía client giữa 2 bước setup/verify-setup.
const setup2FA = async (userId) => {
	const pool = await getPool();
	const userRes = await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.query('SELECT username, totp_enabled FROM users WHERE id = @id');
	const user = userRes.recordset[0];
	if (!user) throw httpError(404, 'Người dùng không tồn tại');
	// Đang bật 2FA thì KHÔNG cho thiết lập lại: bước dưới đặt totp_enabled = 0,
	// tức là tắt 2FA — chỉ cần access token (không mật khẩu, không OTP) là kẻ
	// chiếm được phiên tắt được 2FA và gắn authenticator của chính họ. Muốn đổi
	// thiết bị xác thực thì tắt trước qua /2fa/disable (yêu cầu mật khẩu).
	if (user.totp_enabled)
		throw httpError(
			409,
			'Xác thực 2 lớp đang bật. Hãy tắt trước (cần nhập mật khẩu) rồi thiết lập lại.',
		);

	const secret = await otplib.generateSecret();
	await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.input('secret', sql.NVarChar(255), secretBox.encrypt(secret))
		.query(`UPDATE users SET totp_secret = @secret, totp_enabled = 0, totp_verified_at = NULL,
		          totp_last_step = NULL WHERE id = @id`);

	const otpauthUri = otplib.generateURI({
		issuer: 'RMS Hospital',
		label: user.username,
		secret,
		strategy: 'totp',
	});
	return { secret, otpauth_uri: otpauthUri };
};

// Xác nhận mã OTP đầu tiên sau setup2FA() → chính thức bật 2FA cho tài khoản.
// Trả về bộ mã khôi phục (chỉ hiển thị 1 lần này).
const confirm2FASetup = async (userId, code) => {
	const pool = await getPool();
	const userRes = await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.query('SELECT id, totp_secret, totp_enabled FROM users WHERE id = @id');
	const user = userRes.recordset[0];
	if (!user || !user.totp_secret)
		throw httpError(400, 'Chưa khởi tạo thiết lập 2FA, vui lòng bắt đầu lại');
	if (user.totp_enabled) throw httpError(409, 'Xác thực 2 lớp đã được bật');

	// Ghi nhận bước của mã này luôn: cùng mã không dùng lại được để đăng nhập
	if (!(await checkTotp(pool, user, String(code ?? '').trim())))
		throw httpError(400, 'Mã xác thực không đúng');

	await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.query('UPDATE users SET totp_enabled = 1, totp_verified_at = GETDATE() WHERE id = @id');
	// Middleware auth đọc totp_enabled qua cache — xoá để hết bị chặn / nhắc ngay
	userStatusCache.clear(userId);
	const backupCodes = await replaceBackupCodes(pool, userId);

	await securityEvents.log({
		eventType: '2fa_enabled',
		actorId: userId,
		targetType: 'user',
		targetId: userId,
	});
	return { backup_codes: backupCodes };
};

// Tạo lại bộ mã khôi phục (bộ cũ mất hiệu lực) — yêu cầu nhập lại mật khẩu.
const regenerateBackupCodes = async (userId, password) => {
	const pool = await getPool();
	await assertPassword(pool, userId, password);
	const enabled = (
		await pool
			.request()
			.input('id', sql.VarChar(20), userId)
			.query('SELECT totp_enabled FROM users WHERE id = @id')
	).recordset[0]?.totp_enabled;
	if (!enabled) throw httpError(400, 'Chưa bật xác thực 2 lớp');

	const backupCodes = await replaceBackupCodes(pool, userId);
	await securityEvents.log({
		eventType: '2fa_backup_codes_regenerated',
		actorId: userId,
		targetType: 'user',
		targetId: userId,
	});
	return { backup_codes: backupCodes };
};

// Tắt 2FA — yêu cầu nhập lại mật khẩu (hành động nhạy cảm, giống đổi mật khẩu).
const disable2FA = async (userId, password) => {
	const pool = await getPool();
	await assertPassword(pool, userId, password);

	await pool.request().input('id', sql.VarChar(20), userId)
		.query(`UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_verified_at = NULL,
		          totp_last_step = NULL WHERE id = @id;
		        DELETE FROM user_backup_codes WHERE user_id = @id;`);
	userStatusCache.clear(userId);

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
	const enabled = !!result.recordset[0]?.totp_enabled;
	return {
		enabled,
		backup_codes_remaining: enabled ? await countBackupCodes(pool, userId) : 0,
	};
};

module.exports = {
	verify2FALogin,
	setup2FA,
	confirm2FASetup,
	regenerateBackupCodes,
	disable2FA,
	get2FAStatus,
	PRE_AUTH_2FA_TTL,
};
