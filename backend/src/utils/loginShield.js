const crypto = require('crypto');
const redis = require('../config/redis');
const { signToken, verifyToken } = require('./keys');
const { consumeOnce } = require('./oneTimeToken');

// ─── Lá chắn đăng nhập: thử thách proof-of-work tự thích ứng ─────────────────
// Mỗi lượt đăng nhập sai tốn server ~200ms CPU (bcrypt). Rate-limit theo IP
// (modules/auth/auth.routes.js, nginx) không chặn được kẻ tấn công dùng nhiều IP, còn khoá
// tài khoản chỉ bảo vệ từng tài khoản riêng lẻ — rải 1 mật khẩu lên hàng nghìn
// tài khoản (password spraying) vẫn bắt server chạy bcrypt cho mỗi lượt.
//
// Khi có dấu hiệu dò (IP hoặc username sai nhiều lần, hay toàn hệ thống đang
// sai dồn dập), server đòi trình duyệt giải 1 bài toán hash: tìm `nonce` sao cho
// SHA-256("<token>:<nonce>") có ít nhất `d` bit 0 ở đầu. Trình duyệt tốn
// ~2^d phép hash (d=18: ~0,1–0,3s), server kiểm tra chỉ bằng 1 phép hash —
// TRƯỚC khi đụng tới DB hay bcrypt. Lượt thử nào cũng phải trả "phí" CPU phía
// kẻ tấn công, còn người dùng thật gần như không nhận ra (frontend tự giải).
// Không cần Internet (khác Turnstile) — chạy được trong mạng nội bộ bệnh viện.
//
// Bộ đếm nằm trên Redis (dùng chung giữa các worker); Redis lỗi thì đếm trong
// bộ nhớ tiến trình — không bao giờ tắt lá chắn vì mất Redis.

const WINDOW_SEC = 15 * 60;
// Sai từ ngần này lần (theo IP hoặc theo username, trong WINDOW_SEC) thì bắt giải
const SUSPECT_FAILS = Number(process.env.LOGIN_POW_AFTER_FAILS) || 3;
const BASE_BITS = Number(process.env.LOGIN_POW_BITS) || 18;
const ATTACK_BITS = Number(process.env.LOGIN_POW_ATTACK_BITS) || 20;
const MAX_BITS = 22; // ~4 triệu hash — trần để người dùng thật vẫn đăng nhập được
// Tổng số lần sai / phút trên toàn hệ thống vượt ngưỡng = đang bị dội → MỌI lượt
// đăng nhập đều phải giải (kể cả IP/username chưa sai lần nào).
const ATTACK_PER_MIN = Number(process.env.LOGIN_ATTACK_THRESHOLD) || 60;
const CHALLENGE_TTL_SEC = 120;

const hashKey = (v) => crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 32);
const userKey = (username) =>
	hashKey(
		String(username ?? '')
			.trim()
			.toLowerCase(),
	);
const minuteOf = (ms) => Math.floor(ms / 60_000);

// ─── Bộ đếm (Redis, dự phòng bộ nhớ) ─────────────────────────────────────────
const memory = new Map(); // key → { count, expiresAt }
const MAX_MEMORY_KEYS = 50_000;

const memGet = (k) => {
	const e = memory.get(k);
	if (!e) return 0;
	if (e.expiresAt <= Date.now()) {
		memory.delete(k);
		return 0;
	}
	return e.count;
};
const memIncr = (k, ttlSec) => {
	if (memory.size >= MAX_MEMORY_KEYS) memory.clear();
	const now = Date.now();
	const e = memory.get(k);
	if (!e || e.expiresAt <= now) memory.set(k, { count: 1, expiresAt: now + ttlSec * 1000 });
	else e.count += 1;
};

const readCounts = async (keys) => {
	try {
		const values = await redis.mget(...keys);
		return values.map((v) => Number(v) || 0);
	} catch {
		return keys.map(memGet);
	}
};

const incr = async (k, ttlSec) => {
	try {
		const [[err, n]] = await redis.multi().incr(k).expire(k, ttlSec).exec();
		if (err) throw err;
		return n;
	} catch {
		memIncr(k, ttlSec);
		return memGet(k);
	}
};

const del = async (k) => {
	memory.delete(k);
	try {
		await redis.del(k);
	} catch {
		/* đã xoá bản dự phòng ở trên */
	}
};

const keysFor = (ip, username, now = Date.now()) => ({
	ip: `ls:ip:${hashKey(ip)}`,
	user: `ls:user:${userKey(username)}`,
	globalCur: `ls:g:${minuteOf(now)}`,
	globalPrev: `ls:g:${minuteOf(now) - 1}`,
});

// Số lần sai toàn hệ thống trong 60s gần nhất (cửa sổ trượt ước lượng từ 2 phút)
const globalRate = (cur, prev, now = Date.now()) => {
	const elapsed = (now % 60_000) / 60_000;
	return cur + prev * (1 - elapsed);
};

// ─── Đánh giá mức nghi ngờ ───────────────────────────────────────────────────
// Trả số bit bài toán cần giải (0 = không cần) và có đang ở chế độ tấn công.
const assess = async ({ ip, username }) => {
	const now = Date.now();
	const k = keysFor(ip, username, now);
	const [ipFails, userFails, gCur, gPrev] = await readCounts([
		k.ip,
		k.user,
		k.globalCur,
		k.globalPrev,
	]);
	const attack = globalRate(gCur, gPrev, now) >= ATTACK_PER_MIN;
	const worst = Math.max(ipFails, userFails);

	let bits = 0;
	if (worst >= SUSPECT_FAILS) {
		// Càng sai nhiều càng khó: +1 bit (x2 thời gian giải) mỗi 10 lần sai thêm
		bits = BASE_BITS + Math.floor((worst - SUSPECT_FAILS) / 10);
	}
	if (attack) bits = Math.max(bits, ATTACK_BITS);
	return { bits: Math.min(bits, MAX_BITS), attack };
};

// ─── Thử thách ───────────────────────────────────────────────────────────────
// Token gắn với username (không dùng lời giải của tài khoản này cho tài khoản
// khác) và chỉ dùng được 1 lần (jti). Khoá ký riêng 'login-pow' (utils/keys.js).
const issueChallenge = ({ username, bits }) => ({
	token: signToken(
		'login-pow',
		{ u: userKey(username), d: bits, jti: crypto.randomUUID() },
		CHALLENGE_TTL_SEC,
	),
	bits,
});

const leadingZeroBits = (buf) => {
	let bits = 0;
	for (const byte of buf) {
		if (byte === 0) {
			bits += 8;
			continue;
		}
		return bits + Math.clz32(byte) - 24;
	}
	return bits;
};

// true nếu lời giải hợp lệ cho `username` với độ khó ≥ requiredBits.
const verifyChallenge = async ({ token, nonce, username, requiredBits }) => {
	if (typeof token !== 'string' || token.length > 2048) return false;
	if (typeof nonce !== 'string' || !/^[0-9a-z]{1,24}$/i.test(nonce)) return false;
	let claims;
	try {
		claims = verifyToken('login-pow', token);
	} catch {
		return false;
	}
	if (claims.u !== userKey(username) || !(claims.d >= requiredBits)) return false;
	const digest = crypto.createHash('sha256').update(`${token}:${nonce}`).digest();
	if (leadingZeroBits(digest) < claims.d) return false;
	// Đánh dấu đã dùng SAU khi kiểm tra hash (rẻ) — lời giải sai không tốn Redis
	return consumeOnce('login-pow', claims.jti, CHALLENGE_TTL_SEC);
};

// ─── Ghi nhận kết quả ────────────────────────────────────────────────────────
let attackLoggedAt = 0;
const ATTACK_LOG_EVERY_MS = 10 * 60 * 1000;

const recordFailure = async ({ ip, username, userAgent }) => {
	const now = Date.now();
	const k = keysFor(ip, username, now);
	const [, , gCur] = await Promise.all([
		incr(k.ip, WINDOW_SEC),
		incr(k.user, WINDOW_SEC),
		incr(k.globalCur, 180),
	]);
	// Vừa vượt ngưỡng tấn công: ghi sự kiện bảo mật (kèm email cảnh báo) tối đa
	// 1 lần / 10 phút cho cả cụm worker.
	if (gCur >= ATTACK_PER_MIN && now - attackLoggedAt > ATTACK_LOG_EVERY_MS) {
		attackLoggedAt = now;
		const first = await consumeOnce(
			'login-attack-log',
			String(Math.floor(now / ATTACK_LOG_EVERY_MS)),
			600,
		);
		if (first) {
			require('../modules/audit/securityEventService').log({
				eventType: 'login_attack_mode',
				ip,
				userAgent,
				detail: `≥ ${ATTACK_PER_MIN} lần đăng nhập sai/phút trên toàn hệ thống — mọi lượt đăng nhập phải giải thử thách ${ATTACK_BITS} bit.`,
			});
		}
	}
};

// Đăng nhập đúng: xoá bộ đếm của username (chủ tài khoản không bị làm khó vì
// người khác đã đoán sai trước đó). Bộ đếm theo IP GIỮ NGUYÊN — nếu không, kẻ
// tấn công có 1 tài khoản thật chỉ cần đăng nhập đúng xen kẽ là "tẩy" được IP.
const recordSuccess = async ({ username }) => {
	await del(`ls:user:${userKey(username)}`);
};

module.exports = {
	assess,
	issueChallenge,
	verifyChallenge,
	recordFailure,
	recordSuccess,
	leadingZeroBits,
	_memory: memory,
};
