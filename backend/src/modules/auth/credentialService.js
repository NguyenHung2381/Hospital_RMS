const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { sql } = require('../../config/db');
const redis = require('../../config/redis');
const securityEvents = require('../audit/securityEventService');
const { passwordGate, BUSY_ERROR } = require('../../utils/cpuGate');
const { httpError } = require('../../utils/httpError');

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

// Khóa tạm tài khoản sau N lần sai mật khẩu / mã 2FA liên tiếp — chống dò
// mật khẩu theo TÀI KHOẢN (bổ sung cho rate-limit theo IP đã có ở
// modules/auth/auth.routes.js, vốn không chặn được kẻ tấn công rải request qua nhiều IP).
// Chỉ áp dụng cho thiết bị LẠ — thiết bị quen xem trustedDeviceService.js.
// Chỉ chặn đăng nhập MỚI, không đá phiên đang mở (xem middlewares/auth.js).
const MAX_FAILED_LOGIN_ATTEMPTS = 5;

// Thời gian khóa tăng dần theo số lần đã bị khóa trong 24h qua (đếm event
// 'login_locked' ở security_events — không cần thêm cột): 5 → 15 → 30 → 60 phút.
const LOCK_MINUTES_BY_LEVEL = [5, 15, 30, 60];

const lockMinutesFor = async (pool, userId) => {
	const result = await pool.request().input('id', sql.VarChar(50), userId).query(`
			SELECT COUNT(*) AS locks FROM security_events
			WHERE event_type = 'login_locked' AND target_id = @id
				AND created_at > DATEADD(HOUR, -24, GETDATE())
		`);
	const level = Math.min(result.recordset[0].locks, LOCK_MINUTES_BY_LEVEL.length - 1);
	return LOCK_MINUTES_BY_LEVEL[level];
};

// Tăng bộ đếm atomically trong DB (tránh 2 request song song cùng đọc 1 giá
// trị cũ) — đủ ngưỡng thì khóa và reset bộ đếm. Trả về locked_until nếu lần
// sai này làm tài khoản bị khóa, ngược lại null.
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
		detail: `Khóa ${minutes} phút (thiết bị lạ) sau ${MAX_FAILED_LOGIN_ATTEMPTS} lần ${reason} liên tiếp`,
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
// khóa. Chỉ giữ HMAC (khóa ngẫu nhiên theo tiến trình, không lưu DB) của vài
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
	const secondsLeft = Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000));
	return {
		statusCode: 403,
		message: `Tài khoản tạm khóa do đăng nhập sai nhiều lần. Thử lại sau ${Math.ceil(secondsLeft / 60)} phút.`,
		retryAfterSeconds: secondsLeft,
	};
};

// ── Mỗi tài khoản chỉ 1 lượt so mật khẩu / mã tại 1 thời điểm ───────────────
// Trạng thái khóa (locked_until) đọc lúc đầu request: N request gửi CÙNG LÚC
// đều thấy "chưa khóa" và mỗi request được thử 1 lần — loạt request song song
// vượt qua ngưỡng MAX_FAILED_LOGIN_ATTEMPTS. Giữ khóa lượt thử theo tài khoản
// (Redis SET NX, dùng chung giữa các worker; Redis lỗi thì bộ nhớ tiến trình),
// rồi mới đọc lại trạng thái khóa (refreshLockState): lượt sau luôn thấy kết
// quả của lượt trước. Lượt đến sau CHỜ chứ không bị từ chối ngay — trả lỗi khác
// đi sẽ để lộ username nào tồn tại (username bịa cũng đi qua khóa này, xem login()).
const ATTEMPT_GUARD_TTL_MS = 15_000; // trần an toàn nếu tiến trình chết khi đang giữ
const ATTEMPT_WAIT_MS = 5_000; // chờ quá lâu = đang bị dội → 503 như passwordGate
const ATTEMPT_POLL_MS = 25;
const RELEASE_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0`;
const guardMemory = new Map(); // key → { token, expiresAt }

const acquireGuard = async (key, token) => {
	try {
		return (await redis.set(key, token, 'PX', ATTEMPT_GUARD_TTL_MS, 'NX')) === 'OK';
	} catch {
		const now = Date.now();
		const held = guardMemory.get(key);
		if (held && held.expiresAt > now) return false;
		guardMemory.set(key, { token, expiresAt: now + ATTEMPT_GUARD_TTL_MS });
		return true;
	}
};

const releaseGuard = async (key, token) => {
	if (guardMemory.get(key)?.token === token) guardMemory.delete(key);
	try {
		await redis.eval(RELEASE_SCRIPT, 1, key, token);
	} catch {
		// Redis lỗi: khóa trên Redis (nếu có) tự hết hạn sau ATTEMPT_GUARD_TTL_MS
	}
};

const withAttemptGuard = async (key, fn) => {
	const fullKey = `guard:auth-attempt:${key}`;
	const token = crypto.randomUUID();
	const deadline = Date.now() + ATTEMPT_WAIT_MS;
	while (!(await acquireGuard(fullKey, token))) {
		if (Date.now() >= deadline) throw BUSY_ERROR;
		await new Promise((resolve) => setTimeout(resolve, ATTEMPT_POLL_MS));
	}
	try {
		return await fn();
	} finally {
		await releaseGuard(fullKey, token);
	}
};

// Khóa lượt thử theo tài khoản / theo chuỗi đăng nhập (username bịa — login()).
const userAttemptKey = (userId) => `user:${userId}`;
const loginAttemptKey = (login) =>
	`login:${crypto
		.createHash('sha256')
		.update(String(login ?? '').trim().toLowerCase())
		.digest('hex')}`;

// Đọc lại bộ đếm / trạng thái khóa mới nhất — gọi SAU khi đã giữ khóa lượt thử.
const refreshLockState = async (pool, user) => {
	const row = (
		await pool
			.request()
			.input('id', sql.VarChar(20), user.id)
			.query('SELECT failed_login_count, locked_until FROM users WHERE id = @id')
	).recordset[0];
	if (row) {
		user.failed_login_count = row.failed_login_count;
		user.locked_until = row.locked_until;
	}
	return user;
};

// Xác nhận lại mật khẩu cho thao tác nhạy cảm trên phiên đã đăng nhập (đổi mật
// khẩu, tắt 2FA, tạo lại mã khôi phục). Lần sai tính chung vào bộ đếm khóa của
// tài khoản và tài khoản đang khóa thì không được thử — nếu không, ai chiếm được
// phiên dò được mật khẩu qua các API này mà không bao giờ bị khóa.
const assertPassword = async (
	pool,
	userId,
	password,
	{ ip = null, message = 'Mật khẩu không đúng' } = {},
) =>
	withAttemptGuard(userAttemptKey(userId), async () => {
		const user = (
			await pool
				.request()
				.input('id', sql.VarChar(20), userId)
				.query(
					'SELECT id, username, password, failed_login_count, locked_until FROM users WHERE id = @id',
				)
		).recordset[0];
		if (!user) throw httpError(404, 'Người dùng không tồn tại');
		if (isLocked(user)) throw lockedError(user.locked_until);

		const plain = String(password ?? '');
		if (await comparePassword(plain, user.password)) return;
		if (!isRepeatedWrongPassword(user.id, plain)) {
			const lockedUntil = await recordFailedLogin(pool, user, ip, 'sai mật khẩu xác nhận lại');
			if (lockedUntil) throw lockedError(lockedUntil);
		}
		throw httpError(400, message);
	});

module.exports = {
	hashPassword,
	fakeCompareDelay,
	INVALID_CREDENTIALS,
	isLocked,
	lockedError,
	comparePassword,
	isRepeatedWrongPassword,
	recordFailedLogin,
	resetFailedLogins,
	withAttemptGuard,
	userAttemptKey,
	loginAttemptKey,
	refreshLockState,
	assertPassword,
};
