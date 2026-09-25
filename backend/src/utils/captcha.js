const crypto = require('crypto');
const { signToken, verifyToken } = require('./keys');
const { consumeOnce } = require('./oneTimeToken');

// Chống bot cho cổng công khai (đăng ký khoá học / đề tài). 2 chế độ:
//
//  - Cloudflare Turnstile (khi đặt TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY):
//    thử thách chạy ngầm trên trình duyệt, server xác minh với Cloudflare. Cần
//    máy chủ gọi ra được https://challenges.cloudflare.com — không gọi được thì
//    từ chối đăng ký (fail-closed), không lặng lẽ bỏ kiểm tra.
//  - Phép tính (mặc định, chạy được trong mạng nội bộ không ra Internet): đáp
//    án được ký (khoá riêng, utils/keys.js) kèm hạn 5 phút vào token trả về.
//    Chỉ là rào cản cho bot đơn giản — chặn chính vẫn là rate-limit.
//
// Cả 2 chế độ: mỗi token chỉ dùng được MỘT lần (đúng hay sai đều tính).
const CAPTCHA_TTL_SEC = 5 * 60;
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_TIMEOUT_MS = 5000;

const turnstileEnabled = () => !!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);

const generateCaptcha = () => {
	if (turnstileEnabled()) return { provider: 'turnstile', site_key: process.env.TURNSTILE_SITE_KEY };
	const a = crypto.randomInt(11, 50);
	const b = crypto.randomInt(2, 10);
	const token = signToken('captcha', { answer: a + b, jti: crypto.randomUUID() }, CAPTCHA_TTL_SEC);
	return { provider: 'math', token, question: `${a} + ${b} = ?` };
};

// Cloudflare tự bảo đảm mỗi token chỉ xác minh thành công 1 lần.
const verifyTurnstile = async (token, ip) => {
	try {
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
		const json = await res.json();
		if (!json.success) console.warn('[captcha] Turnstile từ chối:', (json['error-codes'] || []).join(','));
		return json.success === true;
	} catch (err) {
		console.error('[captcha] Không gọi được Turnstile — từ chối yêu cầu:', err.message);
		return false;
	}
};

const verifyMath = async (token, answer) => {
	if (answer === undefined || answer === null || answer === '') return false;
	let decoded;
	try {
		decoded = verifyToken('captcha', token);
	} catch {
		return false;
	}
	// Đánh dấu đã dùng TRƯỚC khi so đáp án — sai thì cũng phải lấy captcha mới
	if (!(await consumeOnce('captcha', decoded.jti, CAPTCHA_TTL_SEC))) return false;
	return Number(decoded.answer) === Number(answer);
};

const verifyCaptcha = async (token, answer, ip = null) => {
	if (!token || typeof token !== 'string' || token.length > 4096) return false;
	return turnstileEnabled() ? verifyTurnstile(token, ip) : verifyMath(token, answer);
};

module.exports = { generateCaptcha, verifyCaptcha, turnstileEnabled };
