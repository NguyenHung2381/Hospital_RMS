const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { signToken, verifyToken, ISSUER } = require('../utils/keys');
const crypto = require('crypto');
const otplib = require('otplib');
const { getPool, sql } = require('../config/db');
const permCache = require('../middlewares/permissionCache');
const userStatusCache = require('../middlewares/userStatusCache');
const { twoFactorState } = require('../permissions/twoFactorPolicy');
const { currentTokenVersion, bumpTokenVersion } = require('./sessionVersion');
const { v4: uuidv4 } = require('uuid');
const securityEvents = require('./securityEventService');
const trustedDevices = require('./trustedDeviceService');
const secretBox = require('../utils/secretBox');
const { consumeOnce } = require('../utils/oneTimeToken');
const { passwordGate, BUSY_ERROR } = require('../utils/cpuGate');

// Mọi lần so / băm mật khẩu theo yêu cầu của người dùng đi qua passwordGate
// (utils/cpuGate.js) — giới hạn số bcrypt chạy cùng lúc, quá tải trả 503.
const hashPassword = (plain) => passwordGate.run(() => bcrypt.hash(plain, 12));

// Thời gian trung bình (EWMA) của 1 lần so mật khẩu THẬT, tính cả thời gian chờ
// trong passwordGate — để phản hồi cho username không tồn tại kéo dài đúng
// bằng như vậy (chống dò tài khoản qua thời gian phản hồi) mà KHÔNG chạy bcrypt:
// trước đây mỗi username bịa ra tốn ~200ms CPU cho 1 bcrypt giả, dội username
// ngẫu nhiên là đủ đánh sập server.
let compareMsAvg = 250;
const EWMA_WEIGHT = 0.1;

const comparePassword = async (plain, hash) => {
	const start = performance.now();
	try {
		return await passwordGate.run(() => bcrypt.compare(plain, hash));
	} finally {
		compareMsAvg += (performance.now() - start - compareMsAvg) * EWMA_WEIGHT;
	}
};

// Chờ như 1 lần so mật khẩu thật (±15% ngẫu nhiên), không tốn CPU. Cổng đang
// đầy thì trả 503 giống hệt comparePassword — không để lộ username tồn tại.
const fakeCompareDelay = () => {
	if (passwordGate.saturated()) return Promise.reject(BUSY_ERROR);
	return new Promise((resolve) => setTimeout(resolve, compareMsAvg * (0.85 + Math.random() * 0.3)));
};

// Token trung gian giữa bước 1 (mật khẩu đúng) và bước 2 (mã OTP) của tài
// khoản đã bật 2FA — KHÔNG phải access token thật, không mang quyền, chỉ xác
// nhận "đã qua bước mật khẩu cho user này", mirror captcha.js (ký JWT ngắn
// hạn, không cần lưu DB). Hết hạn nhanh (5 phút) vì người dùng nhập mã ngay.
const PRE_AUTH_2FA_TTL = '5m';

// epochTolerance=1 cho phép lệch đồng hồ ±1 bước (±30s) giữa app xác thực và
// server — người dùng thường không kịp nhập mã đúng khung 30s hiện tại.
const verifyTotp = (secret, token) =>
	otplib.verify({ secret, token, type: 'totp', epochTolerance: 1 });

// refresh_tokens.token lưu HASH, không lưu JWT gốc — nếu DB bị lộ (backup,
// SQL injection, insider) thì token đọc được từ đó không dùng lại được ngay
// (khác với password, hash không cần salt/cost cao vì refresh token đã có
// entropy lớn sẵn, sha256 là đủ và tra cứu được bằng WHERE = trực tiếp).
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Khoá tạm tài khoản sau N lần sai mật khẩu / mã 2FA liên tiếp — chống dò
// mật khẩu theo TÀI KHOẢN (bổ sung cho rate-limit theo IP đã có ở
// routes/auth.js, vốn không chặn được kẻ tấn công rải request qua nhiều IP).
// Chỉ áp dụng cho thiết bị LẠ — thiết bị quen xem trustedDeviceService.js.
// Chỉ chặn đăng nhập MỚI, không đá phiên đang mở (xem middlewares/auth.js).
const MAX_FAILED_LOGIN_ATTEMPTS = 5;

// Thời gian khoá tăng dần theo số lần đã bị khoá trong 24h qua (đếm event
// 'login_locked' ở security_events — không cần thêm cột): 5 → 15 → 30 → 60 phút.
const LOCK_MINUTES_BY_LEVEL = [5, 15, 30, 60];

const lockMinutesFor = async (pool, userId) => {
	const result = await pool
		.request()
		.input('id', sql.VarChar(50), userId).query(`
			SELECT COUNT(*) AS locks FROM security_events
			WHERE event_type = 'login_locked' AND target_id = @id
				AND created_at > DATEADD(HOUR, -24, GETDATE())
		`);
	const level = Math.min(result.recordset[0].locks, LOCK_MINUTES_BY_LEVEL.length - 1);
	return LOCK_MINUTES_BY_LEVEL[level];
};

// Tăng bộ đếm atomically trong DB (tránh 2 request song song cùng đọc 1 giá
// trị cũ) — đủ ngưỡng thì khoá và reset bộ đếm. Trả về locked_until nếu lần
// sai này làm tài khoản bị khoá, ngược lại null.
const recordFailedLogin = async (pool, user, ip, reason = 'sai mật khẩu') => {
	const minutes = await lockMinutesFor(pool, user.id);
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), user.id)
		.input('max', sql.Int, MAX_FAILED_LOGIN_ATTEMPTS)
		.input('minutes', sql.Int, minutes).query(`
			-- OUTPUT ... INTO: bảng users có trigger audit (trg_users_audit), OUTPUT
			-- trần không được phép khi trigger đang bật.
			-- locked_until lưu giờ UTC (driver mssql useUTC mặc định, JS so sánh
			-- theo UTC) — dùng GETUTCDATE(), KHÔNG dùng GETDATE() (giờ địa phương).
			DECLARE @r TABLE (prev_count INT, locked_until DATETIME);
			UPDATE users SET
				locked_until = CASE WHEN failed_login_count + 1 >= @max
					THEN DATEADD(MINUTE, @minutes, GETUTCDATE()) ELSE locked_until END,
				failed_login_count = CASE WHEN failed_login_count + 1 >= @max
					THEN 0 ELSE failed_login_count + 1 END
			OUTPUT DELETED.failed_login_count, INSERTED.locked_until INTO @r
			WHERE id = @id;
			SELECT prev_count, locked_until FROM @r;
		`);
	const row = result.recordset[0];
	if (!row || row.prev_count + 1 < MAX_FAILED_LOGIN_ATTEMPTS) return null;

	await securityEvents.log({
		eventType: 'login_locked',
		actorId: user.id,
		targetType: 'user',
		targetId: user.id,
		ip,
		detail: `Khoá ${minutes} phút (thiết bị lạ) sau ${MAX_FAILED_LOGIN_ATTEMPTS} lần ${reason} liên tiếp`,
	});
	return row.locked_until;
};

const resetFailedLogins = async (pool, user) => {
	if (!(user.failed_login_count > 0 || user.locked_until)) return;
	await pool
		.request()
		.input('id', sql.VarChar(20), user.id)
		.query(`UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = @id`);
};

const isLocked = (user) => !!user.locked_until && new Date(user.locked_until) > new Date();

// ── Bỏ qua mật khẩu sai lặp lại ─────────────────────────────────
// Cùng 1 mật khẩu sai nhập lại (gõ lại, trình duyệt còn lưu mật khẩu cũ tự
// thử) không cho kẻ tấn công thêm thông tin gì, nên không cộng vào bộ đếm
// khoá. Chỉ giữ HMAC (khoá ngẫu nhiên theo tiến trình, không lưu DB) của vài
// mật khẩu sai gần nhất, trong thời gian ngắn.
const RECENT_WRONG_TTL_MS = 60 * 60 * 1000;
const RECENT_WRONG_PER_USER = 5;
const RECENT_WRONG_MAX_USERS = 10000;
const recentWrongKey = crypto.randomBytes(32);
const recentWrong = new Map(); // user id → [{ digest, at }]

const isRepeatedWrongPassword = (userId, password) => {
	const now = Date.now();
	const digest = crypto.createHmac('sha256', recentWrongKey).update(password).digest('base64');
	const list = (recentWrong.get(userId) || []).filter((e) => now - e.at < RECENT_WRONG_TTL_MS);
	if (list.some((e) => e.digest === digest)) {
		recentWrong.set(userId, list);
		return true;
	}
	list.push({ digest, at: now });
	if (list.length > RECENT_WRONG_PER_USER) list.shift();
	if (!recentWrong.has(userId) && recentWrong.size >= RECENT_WRONG_MAX_USERS) recentWrong.clear();
	recentWrong.set(userId, list);
	return false;
};

// ── Chống dò tài khoản (user enumeration) ───────────────────────
// Sai username / sai mật khẩu phải trả CÙNG thông báo và CÙNG thời gian xử lý
// — nếu không, kẻ tấn công lọc được danh sách username thật (vốn đoán được:
// chữ cái đầu + mã NV) rồi mới rải mật khẩu. Username không tồn tại thì chờ
// bằng thời gian 1 lần so mật khẩu thật (fakeCompareDelay) — không chạy bcrypt.
const INVALID_CREDENTIALS = {
	statusCode: 401,
	message: 'Tên đăng nhập hoặc mật khẩu không đúng',
};

const lockedError = (lockedUntil) => {
	const secondsLeft = Math.max(
		1,
		Math.ceil((new Date(lockedUntil) - new Date()) / 1000),
	);
	return {
		statusCode: 403,
		message: `Tài khoản tạm khoá do đăng nhập sai nhiều lần. Thử lại sau ${Math.ceil(secondsLeft / 60)} phút.`,
		retryAfterSeconds: secondsLeft,
	};
};

// remember = "Ghi nhớ đăng nhập": refresh token sống 30 ngày thay vì 7 ngày
// (sp_create_refresh_token) và cookie tồn tại qua lần đóng trình duyệt.
const login = async (
	username,
	password,
	ip = null,
	userAgent = null,
	deviceToken = null,
	remember = false,
) => {
	const pool = await getPool();

	// Có "@" → đăng nhập bằng email (username không bao giờ chứa "@"). users.email
	// chưa UNIQUE nên lấy 2 dòng: email dùng chung cho nhiều tài khoản thì không
	// biết là ai → coi như sai thông tin, người dùng phải đăng nhập bằng username.
	const byEmail = String(username).includes('@');
	const result = await pool
		.request()
		.input('login', sql.VarChar(100), String(username).trim()).query(`
      SELECT TOP 2 u.id, u.username, u.password, u.full_name, u.email, u.staff_number,
             u.role_id, u.is_active, u.department_id,
             u.account_expires_at, u.failed_login_count, u.locked_until,
             u.totp_enabled, u.password_changed_at, u.must_change_password, u.twofa_required_since,
             r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE ${byEmail ? 'u.email' : 'u.username'} = @login
    `);

	const user = result.recordset.length === 1 ? result.recordset[0] : null;
	if (!user) {
		await fakeCompareDelay();
		throw INVALID_CREDENTIALS;
	}

	// Thiết bị quen không bị khoá tạm tài khoản chặn — kẻ tấn công cố tình nhập
	// sai từ máy khác không khoá được chủ tài khoản trên máy của họ.
	const device = await trustedDevices.verifyDeviceToken(deviceToken, user);

	// Báo khoá TRƯỚC khi so mật khẩu (đánh đổi có chủ đích): nếu chỉ báo khoá khi
	// mật khẩu đúng, kẻ tấn công vẫn dò tiếp được trong thời gian khoá và nhận
	// ra mật khẩu đúng qua thông báo khác đi. Cái giá: lộ việc tài khoản tồn tại
	// — chỉ với tài khoản đang bị khoá.
	if (!device && isLocked(user)) {
		throw lockedError(user.locked_until);
	}

	const isMatch = await comparePassword(password, user.password);
	if (!isMatch) {
		if (!isRepeatedWrongPassword(user.id, password)) {
			if (device) {
				await trustedDevices.recordDeviceFailure(device, user, ip, 'sai mật khẩu');
			} else {
				const lockedUntil = await recordFailedLogin(pool, user, ip);
				// Lần sai làm khoá tài khoản → báo khoá ngay, không để người dùng
				// thử thêm lần nữa mới biết.
				if (lockedUntil) throw lockedError(lockedUntil);
			}
		}
		throw INVALID_CREDENTIALS;
	}

	// is_active = 0 bao gồm cả TK bị vô hiệu hóa thủ công lẫn TK hết hạn
	// (sp_deactivate_expired_accounts set is_active=0 mỗi đêm). Chỉ báo SAU khi
	// mật khẩu đúng — người không biết mật khẩu không phân biệt được tài khoản
	// bị vô hiệu hoá với tài khoản không tồn tại.
	if (!user.is_active)
		throw {
			statusCode: 403,
			message: 'Tài khoản đã bị vô hiệu hóa hoặc hết hạn sử dụng',
		};

	// Đăng nhập đúng trên thiết bị quen không xoá bộ đếm/khoá của thiết bị lạ
	// — nếu không, kẻ tấn công được làm lại từ đầu mỗi khi chủ tài khoản đăng
	// nhập. Bộ đếm của thiết bị quen được reset trong issueDeviceToken().
	if (!device) await resetFailedLogins(pool, user);

	// Tài khoản đã bật 2FA: dừng lại ở đây, KHÔNG phát token thật — chỉ trả 1
	// pre-auth token ngắn hạn để client gọi tiếp /auth/2fa/verify kèm mã OTP.
	if (user.totp_enabled) {
		// Khoá riêng 'pre-auth-2fa' (utils/keys.js): token này không bao giờ được
		// chấp nhận như access token. `rm` giữ lựa chọn "ghi nhớ" sang bước 2.
		const preAuthToken = signToken(
			'pre-auth-2fa',
			{ id: user.id, rm: remember ? 1 : 0, jti: uuidv4() },
			PRE_AUTH_2FA_TTL,
		);
		return { requires_2fa: true, pre_auth_token: preAuthToken };
	}

	return issueTokens(pool, user, ip, userAgent, device, remember);
};

// Access token sống ngắn (mặc định 15 phút, trước đây 8 giờ): lộ ra (XSS, log,
// máy dùng chung) thì chỉ dùng được ít phút; client tự làm mới bằng refresh
// token nằm trong cookie HttpOnly (utils/authCookie.js).
const ACCESS_TOKEN_TTL = () => process.env.JWT_EXPIRES_IN || '15m';

const signAccessToken = (user, tv) =>
	signToken(
		'access',
		{
			id: user.id,
			username: user.username,
			full_name: user.full_name,
			staff_number: user.staff_number ? String(user.staff_number) : null,
			role_id: user.role_id,
			department_id: user.department_id,
			account_expires_at: user.account_expires_at
				? new Date(user.account_expires_at).toISOString().split('T')[0]
				: null,
			tv,
		},
		ACCESS_TOKEN_TTL(),
	);

// Ký cặp access + refresh token và lưu refresh token (hash). Access token mang
// `tv` = users.token_version hiện tại (xem sessionVersion.js).
//   familyId: "họ" token — mọi refresh token sinh ra từ cùng 1 lần đăng nhập
//     (qua các lần xoay) cùng họ; phát hiện dùng lại thì thu hồi cả họ.
//     Không truyền = phiên mới (họ mới).
const signSession = async (pool, user, ip, userAgent, { remember = false, familyId = null } = {}) => {
	const accessToken = signAccessToken(user, await currentTokenVersion(user.id, pool));

	// jti ngẫu nhiên: payload chỉ có {id} + JWT iat chỉ chính xác tới giây, nên
	// 2 lần sign trong cùng 1 giây (không hiếm với round-trip DB nhanh) cho ra
	// CHUỖI TOKEN GIỐNG NHAU — phá vỡ bảo đảm "token cũ sau rotate bị từ chối".
	// Hạn JWT khớp hạn trong DB (sp_create_refresh_token: 30 ngày nếu ghi nhớ).
	const refreshToken = jwt.sign(
		{ id: user.id, jti: uuidv4() },
		process.env.JWT_REFRESH_SECRET,
		{
			algorithm: 'HS256',
			expiresIn: remember ? '30d' : process.env.JWT_REFRESH_EXPIRES_IN || '7d',
			issuer: ISSUER,
			audience: 'refresh',
		},
	);

	// Store refresh token via SP (handles id generation + remember_me)
	const created = await pool
		.request()
		.input('user_id', sql.VarChar(20), user.id)
		.input('token', sql.VarChar(64), hashToken(refreshToken))
		.input('remember_me', sql.Bit, remember ? 1 : 0)
		.execute('sp_create_refresh_token');

	await tagRefreshTokenSession(
		pool,
		hashToken(refreshToken),
		ip,
		userAgent,
		familyId || created.recordset?.[0]?.id || uuidv4(),
	);
	return { accessToken, refreshToken, remember: !!remember };
};

// Phát access/refresh token thật + device token (thiết bị quen) + trả về
// profile đầy đủ — dùng chung cho login() thường và verify2FALogin() (bước 2
// sau khi xác minh mã OTP). refresh_token + remember KHÔNG gửi cho client trong
// body — controller chuyển vào cookie HttpOnly.
const issueTokens = async (pool, user, ip, userAgent, device = null, remember = false) => {
	const { permissions, permission_scopes } = await loadPermissions(user.role_id);
	const { accessToken, refreshToken } = await signSession(pool, user, ip, userAgent, { remember });
	// Tài khoản quản trị chưa bật 2FA: 'grace' (nhắc, kèm hạn) hoặc 'required'
	// (quá hạn — client chuyển thẳng tới màn bật 2FA; server tự chặn API khác).
	const twoFa = await twoFactorState(
		{ userId: user.id, totpEnabled: !!user.totp_enabled, requiredSince: user.twofa_required_since },
		new Set(permissions),
	);

	return {
		user: {
			twofa_state: twoFa.state,
			twofa_deadline: twoFa.deadline ? twoFa.deadline.toISOString() : null,
			id: user.id,
			username: user.username,
			staff_number: user.staff_number ? String(user.staff_number) : null,
			full_name: user.full_name,
			email: user.email,
			role: user.role_name,
			role_id: user.role_id,
			department_id: user.department_id,
			permissions,
			permission_scopes,
			// Client chuyển thẳng tới màn đổi mật khẩu; server vẫn tự chặn
			// (middlewares/auth.js) nên cờ này chỉ để điều hướng.
			must_change_password: !!user.must_change_password,
		},
		access_token: accessToken,
		refresh_token: refreshToken,
		remember: !!remember,
		device_token: trustedDevices.issueDeviceToken(user, device),
	};
};

// ─── 2FA: dùng chung ────────────────────────────────────────────────────────
// Secret TOTP lưu mã hoá (utils/secretBox.js). Giá trị cũ chưa mã hoá vẫn đọc
// được; lần dùng thành công kế tiếp sẽ mã hoá lại (reencryptIfLegacy).
// Giải mã lỗi = khoá (TOTP_ENC_KEY / secrets/totp.key) đã đổi so với lúc lưu
// secret: không sinh được mã nữa, người dùng phải được quản trị đặt lại 2FA.
const readSecret = (stored) => {
	try {
		return secretBox.decrypt(stored);
	} catch (err) {
		console.error('❌ Không giải mã được secret 2FA — khoá mã hoá không khớp:', err.message);
		throw {
			statusCode: 409,
			message: 'Không đọc được cấu hình xác thực 2 lớp của tài khoản. Vui lòng liên hệ quản trị viên để đặt lại 2FA.',
		};
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
const normalizeBackupCode = (code) => String(code).toLowerCase().replace(/[^a-z0-9]/g, '');
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
	codes.forEach((c, i) => req.input(`h${i}`, sql.Char(64), secretBox.keyedHash(normalizeBackupCode(c))));
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
			.query('SELECT COUNT(*) AS n FROM user_backup_codes WHERE user_id = @user_id AND used_at IS NULL')
	).recordset[0].n;

const assertPassword = async (pool, userId, password) => {
	const user = (
		await pool.request().input('id', sql.VarChar(20), userId).query('SELECT password FROM users WHERE id = @id')
	).recordset[0];
	if (!user) throw { statusCode: 404, message: 'Người dùng không tồn tại' };
	if (!(await comparePassword(String(password ?? ''), user.password)))
		throw { statusCode: 400, message: 'Mật khẩu không đúng' };
};

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
		throw { statusCode: 401, message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' };
	}

	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), decoded.id).query(`
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
		throw { statusCode: 401, message: 'Tài khoản chưa bật xác thực 2 lớp' };
	// Tài khoản có thể bị vô hiệu hoá trong 5 phút giữa bước mật khẩu và bước OTP
	if (!user.is_active)
		throw { statusCode: 403, message: 'Tài khoản đã bị vô hiệu hóa hoặc hết hạn sử dụng' };

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
		throw { statusCode: 401, message: 'Mã xác thực không đúng, đã hết hạn hoặc đã được sử dụng' };
	}

	// Pre-auth token + mã đúng chỉ đổi lấy phiên đăng nhập đúng 1 lần
	if (!(await consumeOnce('pre-auth-2fa', decoded.jti, 10 * 60)))
		throw { statusCode: 401, message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' };

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
	if (!user) throw { statusCode: 404, message: 'Người dùng không tồn tại' };
	// Đang bật 2FA thì KHÔNG cho thiết lập lại: bước dưới đặt totp_enabled = 0,
	// tức là tắt 2FA — chỉ cần access token (không mật khẩu, không OTP) là kẻ
	// chiếm được phiên tắt được 2FA và gắn authenticator của chính họ. Muốn đổi
	// thiết bị xác thực thì tắt trước qua /2fa/disable (yêu cầu mật khẩu).
	if (user.totp_enabled)
		throw {
			statusCode: 409,
			message: 'Xác thực 2 lớp đang bật. Hãy tắt trước (cần nhập mật khẩu) rồi thiết lập lại.',
		};

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
		type: 'totp',
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
		throw { statusCode: 400, message: 'Chưa khởi tạo thiết lập 2FA, vui lòng bắt đầu lại' };
	if (user.totp_enabled) throw { statusCode: 409, message: 'Xác thực 2 lớp đã được bật' };

	// Ghi nhận bước của mã này luôn: cùng mã không dùng lại được để đăng nhập
	if (!(await checkTotp(pool, user, String(code ?? '').trim())))
		throw { statusCode: 400, message: 'Mã xác thực không đúng' };

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
		await pool.request().input('id', sql.VarChar(20), userId).query('SELECT totp_enabled FROM users WHERE id = @id')
	).recordset[0]?.totp_enabled;
	if (!enabled) throw { statusCode: 400, message: 'Chưa bật xác thực 2 lớp' };

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

	await pool
		.request()
		.input('id', sql.VarChar(20), userId)
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

// Gắn IP/thiết bị vào dòng refresh_tokens vừa tạo — làm ở bước riêng (UPDATE
// sau INSERT) thay vì sửa sp_create_refresh_token, vì body của stored proc đó
// không nằm trong repo (thuộc schema nền chưa có migration gốc) nên không an
// toàn để CREATE OR ALTER lại mà không biết nó đang làm gì bên trong.
// `tokenHash` = hashToken(token gốc) — refresh_tokens.token lưu hash (xem hashToken).
// Lỗi ở đây chỉ ghi log: dòng thiếu family_id vẫn hoạt động (lúc xoay, id của
// chính dòng đó được dùng làm họ — xem refreshAccessToken).
const tagRefreshTokenSession = async (pool, tokenHash, ip, userAgent, familyId) => {
	try {
		await pool
			.request()
			.input('token', sql.VarChar(64), tokenHash)
			.input('ip_address', sql.VarChar(64), ip)
			.input('user_agent', sql.NVarChar(255), userAgent ? String(userAgent).slice(0, 255) : null)
			.input('family_id', sql.VarChar(60), familyId)
			.query(
				`UPDATE refresh_tokens SET ip_address = @ip_address, user_agent = @user_agent,
				   family_id = @family_id WHERE token = @token`,
			);
	} catch (err) {
		console.error('❌ tagRefreshTokenSession failed:', err.message);
	}
};

// Quyền "resource:action" + phạm vi dữ liệu của một vai trò — trả về cho
// client để điều hướng / ẩn hiện menu. Backend vẫn tự kiểm tra qua permissionCache.
const loadPermissions = async (roleId) => {
	if (!roleId) return { permissions: [], permission_scopes: {} };
	const perms = await permCache.load(roleId);
	return {
		permissions: [...perms.keys],
		permission_scopes: Object.fromEntries(perms.scopes),
	};
};

// ─── Xoay refresh token + phát hiện dùng lại ────────────────────────────────
// Mỗi lần làm mới: token đang dùng bị đánh dấu thu hồi (revoked_at, KHÔNG xoá)
// và được thay bằng token mới cùng họ (family_id). Bước "nhận" token là 1 câu
// UPDATE nguyên tử — 2 request cùng mang 1 token thì chỉ 1 bên thắng (trước
// đây SELECT rồi mới DELETE nên cả 2 cùng qua được).
//
// Token ĐÃ thu hồi mà vẫn được dùng lại:
//   - trong REFRESH_RACE_GRACE_MS: gần như chắc chắn là 2 tab cùng làm mới —
//     báo REFRESH_RACE, client thử lại (cookie đã là token mới của tab kia);
//   - quá thời gian đó: token đã bị sao chép (đánh cắp) — kẻ tấn công hoặc chủ
//     tài khoản đang dùng bản cũ. Thu hồi cả họ token + mọi access token đang
//     lưu hành (token_version); thiết bị khác của người dùng (họ token khác)
//     tự làm mới lại được, còn kẻ tấn công mất phiên.
const REFRESH_RACE_GRACE_MS = 30 * 1000;

const invalidRefresh = () => ({
	statusCode: 401,
	message: 'Refresh token không hợp lệ hoặc đã hết hạn',
});

const refreshAccessToken = async (refreshToken, ip = null, userAgent = null) => {
	let decoded;
	try {
		// Chưa bắt buộc iss/aud: refresh token phát hành trước bản này không có
		// 2 claim đó (sống tới 30 ngày). Bảo đảm chính là dòng hash trong DB.
		decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
	} catch {
		throw invalidRefresh();
	}

	const pool = await getPool();
	const tokenHash = hashToken(refreshToken);
	const claimed = (
		await pool
			.request()
			.input('token', sql.VarChar(64), tokenHash)
			.query(`
				UPDATE refresh_tokens SET revoked_at = SYSUTCDATETIME()
				OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.family_id, INSERTED.remember_me
				WHERE token = @token AND revoked_at IS NULL AND expires_at > GETDATE()
			`)
	).recordset[0];

	if (!claimed) {
		const prior = (
			await pool
				.request()
				.input('token', sql.VarChar(64), tokenHash)
				.query('SELECT id, user_id, family_id, revoked_at FROM refresh_tokens WHERE token = @token')
		).recordset[0];
		if (prior?.revoked_at) {
			if (Date.now() - new Date(prior.revoked_at).getTime() < REFRESH_RACE_GRACE_MS) {
				throw {
					statusCode: 401,
					code: 'REFRESH_RACE',
					message: 'Phiên đang được làm mới ở tab khác, vui lòng thử lại',
				};
			}
			await revokeFamily(pool, prior.family_id || prior.id, prior.user_id, ip);
		}
		throw invalidRefresh();
	}

	const userResult = await pool
		.request()
		.input('id', sql.VarChar(20), claimed.user_id)
		.query(
			`SELECT u.*, r.name AS role_name FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.id=@id`,
		);

	const user = userResult.recordset[0];
	if (!user || user.id !== decoded.id) throw invalidRefresh();

	// Cùng điều kiện với login(): tài khoản bị vô hiệu hoá / hết hạn không được
	// làm mới phiên — token vừa bị thu hồi ở bước trên nên không thử lại được.
	const accountExpiresAt = user.account_expires_at
		? new Date(user.account_expires_at).toISOString().split('T')[0]
		: null;
	if (!user.is_active || (accountExpiresAt && new Date(accountExpiresAt) < new Date())) {
		throw {
			statusCode: 401,
			message: 'Tài khoản đã bị vô hiệu hóa hoặc hết hạn sử dụng',
		};
	}

	const remember = !!claimed.remember_me;
	const { accessToken, refreshToken: newRefreshToken } = await signSession(pool, user, ip, userAgent, {
		remember,
		// Dòng tạo trước khi có cột family_id: lấy id của chính nó làm họ
		familyId: claimed.family_id || claimed.id,
	});

	return { access_token: accessToken, refresh_token: newRefreshToken, remember };
};

// Refresh token bị dùng lại sau khi đã xoay ⇒ coi như bị đánh cắp.
const revokeFamily = async (pool, familyId, userId, ip) => {
	await pool
		.request()
		.input('family', sql.VarChar(60), familyId)
		.query('DELETE FROM refresh_tokens WHERE family_id = @family OR id = @family');
	await bumpTokenVersion(userId, pool);
	await securityEvents.log({
		eventType: 'refresh_token_reuse',
		actorId: userId,
		targetType: 'user',
		targetId: userId,
		ip,
		detail: 'Refresh token đã thu hồi bị dùng lại — thu hồi cả phiên đăng nhập và mọi access token',
	});
};

// Đăng xuất phiên hiện tại: xoá cả họ token của phiên (kể cả các token đã xoay
// trước đó), không đụng tới phiên trên thiết bị khác.
const logout = async (refreshToken) => {
	if (!refreshToken) return;
	const pool = await getPool();
	await pool
		.request()
		.input('token', sql.VarChar(64), hashToken(refreshToken))
		.query(`
			DECLARE @family VARCHAR(60) =
				(SELECT TOP 1 ISNULL(family_id, id) FROM refresh_tokens WHERE token = @token);
			DELETE FROM refresh_tokens WHERE token = @token OR family_id = @family OR id = @family;
		`);
};

// "Ghi nhớ đăng nhập" của phiên đang giữ refresh token này (để phiên cấp lại sau
// khi đổi mật khẩu giữ nguyên lựa chọn). Không tìm thấy = không ghi nhớ.
const isRememberedSession = async (refreshToken) => {
	if (!refreshToken) return false;
	const pool = await getPool();
	const row = (
		await pool
			.request()
			.input('token', sql.VarChar(64), hashToken(refreshToken))
			.query('SELECT remember_me FROM refresh_tokens WHERE token = @token')
	).recordset[0];
	return !!row?.remember_me;
};

// Đăng xuất khỏi mọi thiết bị: xoá toàn bộ refresh token của người dùng và
// tăng users.token_version để mọi access token đang lưu hành hết hiệu lực ngay.
const logoutAll = async (userId, actorIp = null) => {
	const pool = await getPool();
	await pool
		.request()
		.input('user_id', sql.VarChar(20), userId)
		.query(`DELETE FROM refresh_tokens WHERE user_id = @user_id`);
	// ...và thu hồi ngay mọi access token đang lưu hành (users.token_version)
	await bumpTokenVersion(userId, pool);

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
			WHERE user_id = @user_id AND expires_at > GETDATE() AND revoked_at IS NULL
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

// Tự đổi mật khẩu: đăng xuất MỌI phiên khác (thu hồi refresh token + tăng
// token_version), rồi cấp cặp token mới cho chính phiên đang đổi để người
// dùng không bị đá ra. Trả về { access_token, refresh_token } cho client lưu lại.
const changePassword = async (
	userId,
	oldPassword,
	newPassword,
	ip = null,
	userAgent = null,
	remember = false,
) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.query(`SELECT password FROM users WHERE id = @id`);

	const user = result.recordset[0];
	if (!user) throw { statusCode: 404, message: 'Người dùng không tồn tại' };

	const isMatch = await comparePassword(oldPassword, user.password);
	if (!isMatch) throw { statusCode: 400, message: 'Mật khẩu cũ không đúng' };
	// Mật khẩu tạm do quản trị cấp phải được thay thật sự, không "đổi" sang chính nó
	if (oldPassword === newPassword)
		throw { statusCode: 400, message: 'Mật khẩu mới phải khác mật khẩu hiện tại' };

	const hashed = await hashPassword(newPassword);
	await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.input('password', sql.VarChar(255), hashed)
		.query(
			`UPDATE users SET password = @password, password_changed_at = GETDATE(), must_change_password = 0,
			 updated_at = GETDATE(), updated_by = @id WHERE id = @id`,
		);

	// Thu hồi mọi refresh token hiện có: đổi mật khẩu thường vì nghi lộ, nên
	// không để token cũ (nếu đã bị đánh cắp trước đó) tiếp tục dùng được.
	await pool
		.request()
		.input('user_id', sql.VarChar(20), userId)
		.query(`DELETE FROM refresh_tokens WHERE user_id = @user_id`);
	await bumpTokenVersion(userId, pool);

	const fresh = (
		await pool.request().input('id', sql.VarChar(20), userId).query('SELECT * FROM users WHERE id = @id')
	).recordset[0];
	const { accessToken, refreshToken } = await signSession(pool, fresh, ip, userAgent, { remember });
	return { access_token: accessToken, refresh_token: refreshToken, remember };
};

module.exports = {
	login,
	refreshAccessToken,
	logout,
	logoutAll,
	listSessions,
	changePassword,
	hashPassword,
	isRememberedSession,
	verify2FALogin,
	setup2FA,
	confirm2FASetup,
	regenerateBackupCodes,
	disable2FA,
	get2FAStatus,
};
