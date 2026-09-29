const crypto = require('crypto');
const { signToken, verifyToken } = require('./keys');
const { consumeOnce } = require('./oneTimeToken');
const { leadingZeroBits } = require('./loginShield');

// Chống bot cho cổng công khai (đăng ký khoá học / đề tài). 2 chế độ:
//
//  - Cloudflare Turnstile (khi đặt TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY):
//    thử thách chạy ngầm trên trình duyệt, server xác minh với Cloudflare. Cần
//    máy chủ gọi ra được https://challenges.cloudflare.com — không gọi được thì
//    từ chối đăng ký (fail-closed), không lặng lẽ bỏ kiểm tra.
//  - Proof-of-work (mặc định, chạy được trong mạng nội bộ không ra Internet):
//    cùng cơ chế lá chắn đăng nhập (utils/loginShield.js) — trình duyệt phải tìm
//    `nonce` sao cho SHA-256("<token>:<nonce>") có ≥ `bits` bit 0 ở đầu (~2^bits
//    phép hash, frontend tự giải ngầm trong Web Worker khi người dùng điền form),
//    server kiểm tra bằng 1 phép hash. Thay cho câu hỏi phép tính cũ: câu hỏi
//    nằm dạng chữ trong JSON nên bot đọc & giải tức thì, còn PoW bắt MỖI lượt
//    gửi trả phí CPU thật — spam hàng loạt trở nên đắt, người thật không phải
//    gõ gì. Thêm thời gian tối thiểu từ lúc cấp mã tới lúc gửi (bot điền form
//    ngay lập tức) — rate-limit + honeypot vẫn là các lớp chặn song song.
//
// Cả 2 chế độ: mỗi token chỉ dùng được MỘT lần (đúng hay sai đều tính).
const CAPTCHA_TTL_SEC = 10 * 60;
const POW_BITS = Math.min(Math.max(Number(process.env.CAPTCHA_POW_BITS) || 20, 12), 24);
// Gửi sớm hơn ngần này giây kể từ lúc cấp mã = bot (người thật không điền kịp)
const MIN_FILL_SEC = Number(process.env.CAPTCHA_MIN_FILL_SEC ?? 3);
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_TIMEOUT_MS = 5000;

const turnstileEnabled = () => !!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);

const generateCaptcha = () => {
	if (turnstileEnabled())
		return { provider: 'turnstile', site_key: process.env.TURNSTILE_SITE_KEY, action: TURNSTILE_ACTION };
	const token = signToken('captcha', { d: POW_BITS, jti: crypto.randomUUID() }, CAPTCHA_TTL_SEC);
	return { provider: 'pow', token, bits: POW_BITS, expires_in: CAPTCHA_TTL_SEC };
};

// action gắn vào widget (frontend TurnstileWidget) — token cấp cho widget/trang
// khác cùng site key sẽ bị từ chối.
const TURNSTILE_ACTION = 'public-form';
// Tuỳ chọn: chỉ nhận token sinh ra trên các tên miền này (vd rms.benhvien.vn)
const turnstileHostnames = () =>
	(process.env.TURNSTILE_HOSTNAMES || '')
		.split(',')
		.map((h) => h.trim().toLowerCase())
		.filter(Boolean);

const callSiteverify = async (token, ip) => {
	const res = await fetch(TURNSTILE_VERIFY_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			secret: process.env.TURNSTILE_SECRET_KEY,
			response: token,
			...(ip ? { remoteip: ip } : {}),
		}),
		signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
	});
	return res.json();
};

// Cloudflare tự bảo đảm mỗi token chỉ xác minh thành công 1 lần. Lỗi mạng thử
// lại 1 lần (token chưa bị tiêu nếu request chưa tới Cloudflare); vẫn lỗi thì
// từ chối (fail-closed).
const verifyTurnstile = async (token, ip) => {
	let json;
	try {
		json = await callSiteverify(token, ip);
	} catch {
		try {
			json = await callSiteverify(token, ip);
		} catch (err) {
			console.error('[captcha] Không gọi được Turnstile — từ chối yêu cầu:', err.message);
			return false;
		}
	}
	if (json.success !== true) {
		console.warn('[captcha] Turnstile từ chối:', (json['error-codes'] || []).join(','));
		return false;
	}
	// Khoá test của Cloudflare không trả action — chỉ so khi có
	if (json.action && json.action !== TURNSTILE_ACTION) {
		console.warn('[captcha] Turnstile sai action:', json.action);
		return false;
	}
	const hosts = turnstileHostnames();
	if (hosts.length && !hosts.includes(String(json.hostname || '').toLowerCase())) {
		console.warn('[captcha] Turnstile sai hostname:', json.hostname);
		return false;
	}
	return true;
};

const verifyPow = async (token, nonce) => {
	if (typeof nonce !== 'string' || !/^[0-9a-z]{1,24}$/i.test(nonce)) return false;
	let claims;
	try {
		claims = verifyToken('captcha', token);
	} catch {
		return false;
	}
	// Đánh dấu đã dùng TRƯỚC khi kiểm tra — sai thì cũng phải lấy mã mới
	if (!(await consumeOnce('captcha', claims.jti, CAPTCHA_TTL_SEC))) return false;
	if (!(claims.d >= POW_BITS)) return false; // mã cấp lúc độ khó còn thấp hơn cấu hình hiện tại
	if (Date.now() / 1000 - claims.iat < MIN_FILL_SEC) return false;
	const digest = crypto.createHash('sha256').update(`${token}:${nonce}`).digest();
	return leadingZeroBits(digest) >= claims.d;
};

const verifyCaptcha = async (token, answer, ip = null) => {
	if (!token || typeof token !== 'string' || token.length > 4096) return false;
	return turnstileEnabled() ? verifyTurnstile(token, ip) : verifyPow(token, answer);
};

module.exports = { generateCaptcha, verifyCaptcha, turnstileEnabled, POW_BITS, TURNSTILE_ACTION };
