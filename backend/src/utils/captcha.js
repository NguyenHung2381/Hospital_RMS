const crypto = require('crypto');
const { signToken, verifyToken } = require('./keys');
const { consumeOnce } = require('./oneTimeToken');
const { leadingZeroBits } = require('./loginShield');
const logger = require('../config/logger');
const systemSettingService = require('../modules/settings/systemSettingService');

// Chống bot cho cổng công khai (đăng ký khóa học / đề tài). 3 chế độ, server
// chọn theo khóa đã cấu hình (ưu tiên từ trên xuống):
//
//  - Cloudflare Turnstile (khi đặt TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY):
//    thử thách chạy ngầm trên trình duyệt, server xác minh với Cloudflare. Cần
//    máy chủ gọi ra được https://challenges.cloudflare.com — không gọi được thì
//    từ chối đăng ký (fail-closed), không lặng lẽ bỏ kiểm tra.
//  - Google reCAPTCHA v2 "Tôi không phải người máy" (khi đặt RECAPTCHA_SITE_KEY
//    + RECAPTCHA_SECRET_KEY): ô tích của Google, đôi khi bắt chọn ảnh. Server
//    xác minh với https://www.google.com/recaptcha/api/siteverify — cũng
//    fail-closed như Turnstile. Khóa đặt ở Cấu hình hệ thống → tab "Bảo mật &
//    Tài khoản" (áp dụng ngay, không cần khởi động lại); trống thì lấy .env.
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
// Mọi chế độ: mỗi token chỉ dùng được MỘT lần (đúng hay sai đều tính) —
// Cloudflare / Google tự bảo đảm điều này với token của họ.
const CAPTCHA_TTL_SEC = 10 * 60;
const POW_BITS = Math.min(Math.max(Number(process.env.CAPTCHA_POW_BITS) || 20, 12), 24);
// Gửi sớm hơn ngần này giây kể từ lúc cấp mã = bot (người thật không điền kịp)
const MIN_FILL_SEC = Number(process.env.CAPTCHA_MIN_FILL_SEC ?? 3);
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const VERIFY_TIMEOUT_MS = 5000;

const turnstileEnabled = () =>
	!!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);

const RECAPTCHA_KEYS = ['RECAPTCHA_SITE_KEY', 'RECAPTCHA_SECRET_KEY', 'RECAPTCHA_HOSTNAMES'];
// Khóa reCAPTCHA: Cấu hình hệ thống, từng key trống thì lấy .env (systemSettingService.getValue).
// Cắt khoảng trắng: khóa dán từ trang quản trị Google hay dính dấu cách / xuống dòng ở cuối —
// secret dính khoảng trắng thì Google trả invalid-input-secret, MỌI lượt gửi đều bị từ chối.
// Cắt cả lúc đọc để giá trị đã lưu trước bản sửa này (chưa cắt) cũng dùng được.
const recaptchaConfig = async () => {
	const [siteKey, secretKey, hostnames] = await Promise.all(
		RECAPTCHA_KEYS.map(async (k) => (await systemSettingService.getValue(k))?.trim() || undefined),
	);
	return { siteKey, secretKey, hostnames };
};

// Chuẩn hóa giá trị trước khi lưu (systemSettings.routes.js) — khớp với validateSetting,
// vốn kiểm tra trên chuỗi đã cắt. Chuỗi che (••••••) của secret giữ nguyên để service nhận ra.
const normalizeSetting = (key, value) =>
	RECAPTCHA_KEYS.includes(key) && typeof value === 'string' && !/^•+$/.test(value)
		? value.trim()
		: value;
const recaptchaEnabled = async () => {
	const c = await recaptchaConfig();
	return !!(c.siteKey && c.secretKey);
};

/** @returns {Promise<'turnstile' | 'recaptcha' | 'pow'>} */
const captchaProvider = async () =>
	turnstileEnabled() ? 'turnstile' : (await recaptchaEnabled()) ? 'recaptcha' : 'pow';

// Kiểm tra khi admin lưu cấu hình (systemSettings.routes.js) — null = hợp lệ
const KEY_RE = /^[A-Za-z0-9_-]{20,100}$/;
const HOST_RE =
	/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
const validateSetting = (key, value) => {
	if (value === null || value === '' || !RECAPTCHA_KEYS.includes(key)) return null;
	if (key === 'RECAPTCHA_HOSTNAMES') {
		const bad = parseHostnames(value).filter((h) => !HOST_RE.test(h));
		return bad.length ? `Tên miền không hợp lệ: ${bad.join(', ')}` : null;
	}
	// Khóa secret: UI gửi lại chuỗi che (••••••) khi không đổi — systemSettingService tự giữ nguyên
	if (key === 'RECAPTCHA_SECRET_KEY' && /^•+$/.test(value)) return null;
	return KEY_RE.test(value.trim())
		? null
		: 'Khóa reCAPTCHA không hợp lệ (chữ, số, "_" hoặc "-", 20–100 ký tự)';
};

// action gắn vào widget (frontend TurnstileWidget) — token cấp cho widget/trang
// khác cùng site key sẽ bị từ chối.
const TURNSTILE_ACTION = 'public-form';

const generateCaptcha = async () => {
	switch (await captchaProvider()) {
		case 'turnstile':
			return {
				provider: 'turnstile',
				site_key: process.env.TURNSTILE_SITE_KEY,
				action: TURNSTILE_ACTION,
			};
		case 'recaptcha':
			return { provider: 'recaptcha', site_key: (await recaptchaConfig()).siteKey };
		default: {
			const token = signToken(
				'captcha',
				{ d: POW_BITS, jti: crypto.randomUUID() },
				CAPTCHA_TTL_SEC,
			);
			// min_fill_sec: frontend chờ đủ ngần này giây kể từ lúc nhận mã mới cho gửi
			// (lời giải chỉ mất < 1 giây — gửi lại ngay sau 1 lần lỗi sẽ bị verifyPow từ chối)
			return {
				provider: 'pow',
				token,
				bits: POW_BITS,
				expires_in: CAPTCHA_TTL_SEC,
				min_fill_sec: MIN_FILL_SEC,
			};
		}
	}
};

// Tùy chọn: chỉ nhận token sinh ra trên các tên miền này (vd rms.benhvien.vn)
const parseHostnames = (value) =>
	(value || '')
		.split(',')
		.map((h) => h.trim().toLowerCase())
		.filter(Boolean);

// Lỗi mạng thử lại 1 lần (token chưa bị tiêu nếu request chưa tới nhà cung
// cấp); vẫn lỗi thì trả null để nơi gọi từ chối (fail-closed).
const callWithRetry = async (name, call) => {
	try {
		return await call();
	} catch {
		try {
			return await call();
		} catch (err) {
			logger.error(`[captcha] Không gọi được ${name} — từ chối yêu cầu:`, err.message);
			return null;
		}
	}
};

const hostnameAllowed = (name, hostsEnv, hostname) => {
	const hosts = parseHostnames(hostsEnv);
	if (!hosts.length || hosts.includes(String(hostname || '').toLowerCase())) return true;
	logger.warn(
		`[captcha] ${name} sai hostname: ${hostname} — không có trong danh sách tên miền cho phép (${hosts.join(', ')})`,
	);
	return false;
};

const verifyTurnstile = async (token, ip) => {
	/** @type {any} JSON trả về của Cloudflare Turnstile siteverify */
	const json = await callWithRetry('Turnstile', async () => {
		const res = await fetch(TURNSTILE_VERIFY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				secret: process.env.TURNSTILE_SECRET_KEY,
				response: token,
				...(ip ? { remoteip: ip } : {}),
			}),
			signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
		});
		return res.json();
	});
	if (!json) return false;
	if (json.success !== true) {
		logger.warn('[captcha] Turnstile từ chối:', (json['error-codes'] || []).join(','));
		return false;
	}
	// Khóa test của Cloudflare không trả action — chỉ so khi có
	if (json.action && json.action !== TURNSTILE_ACTION) {
		logger.warn('[captcha] Turnstile sai action:', json.action);
		return false;
	}
	return hostnameAllowed('Turnstile', process.env.TURNSTILE_HOSTNAMES, json.hostname);
};

// Người dùng chỉ thấy 1 câu chung — log ghi rõ lý do để admin sửa cấu hình
const RECAPTCHA_ERROR_HINTS = {
	'invalid-input-secret':
		'khóa bí mật sai hoặc không cùng cặp với site key (Cấu hình hệ thống → Bảo mật & Tài khoản)',
	'missing-input-secret': 'chưa có khóa bí mật',
	'invalid-input-response':
		'token không hợp lệ — thường do site key và khóa bí mật thuộc 2 cặp khóa khác nhau',
	'timeout-or-duplicate': 'token đã dùng hoặc quá 2 phút từ lúc tích ô',
	'bad-request': 'yêu cầu gửi Google bị lỗi',
};

// Cặp khóa TEST công khai của Google (developers.google.com/recaptcha/docs/faq): secret TEST
// nhận MỌI token và luôn trả hostname testkey.google.com ⇒ không chặn được bot, khóa thật thì
// không bao giờ được xác minh (Google Console báo "site is not verifying reCAPTCHA solutions"),
// và đặt "Chỉ nhận từ tên miền" thì mọi lượt đăng ký bị từ chối.
// Chỉ secret TEST mới trả hostname này ⇒ thấy nó là biết secret là khóa TEST. Không chép chuỗi
// khóa TEST nào vào code: gitleaks (generic-api-key) báo nhầm. Site key TEST thì người dùng tự
// nhận ra bằng dòng chữ đỏ Google vẽ trên ô tích.
const GOOGLE_TEST_HOSTNAME = 'testkey.google.com';

const testKeyMessage = () =>
	`Secret key đang là khóa TEST công khai của Google (xác minh luôn trả tên miền ${GOOGLE_TEST_HOSTNAME}): không chặn được bot, khóa thật không được dùng, và có đặt "Chỉ nhận từ tên miền" thì mọi lượt đăng ký bị từ chối. Thay CẢ Site key lẫn Secret key bằng cặp khóa thật của cùng 1 khóa (loại v2 "Tôi không phải người máy") ở trang quản trị reCAPTCHA. Ô tích có dòng chữ đỏ "for testing purposes only" nghĩa là Site key cũng đang là khóa TEST.`;

const recaptchaHints = (codes) =>
	codes
		.map((c) => RECAPTCHA_ERROR_HINTS[c])
		.filter(Boolean)
		.join('; ');

// Nút "Kiểm tra" ở Cấu hình hệ thống (systemSettings.routes.js), dùng khóa ĐÃ LƯU.
// token = token thật admin vừa tích trên trang cấu hình ⇒ thử trọn cặp khóa + tên miền.
// Không có token thì chỉ thử máy chủ gọi được Google: Google xét token trước khóa bí mật,
// token giả luôn ra invalid-input-response dù khóa đúng hay sai.
// Trả { ok, message } — ok = false: cấu hình / mạng đang làm mọi lượt đăng ký bị từ chối.
const testRecaptcha = async (token) => {
	const config = await recaptchaConfig();
	if (!config.siteKey || !config.secretKey)
		return { ok: false, message: 'Chưa đặt đủ Site key và Secret key.' };
	const note = turnstileEnabled()
		? ' Lưu ý: máy chủ đang đặt khóa Turnstile trong .env nên form công khai dùng Turnstile, không dùng reCAPTCHA.'
		: '';
	/** @type {any} */
	let json;
	try {
		const res = await fetch(RECAPTCHA_VERIFY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				secret: config.secretKey,
				response: token || 'kiem-tra',
			}).toString(),
			signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS * 2),
		});
		json = await res.json();
	} catch (err) {
		return {
			ok: false,
			message: `Máy chủ không gọi được www.google.com (${err.cause?.code || err.name}) nên mọi lượt đăng ký đang bị từ chối. Cần mở tường lửa / DNS, hoặc cấu hình proxy cho backend.${note}`,
		};
	}
	if (!token)
		return {
			ok: true,
			message: `Máy chủ gọi được Google. Tích ô "Tôi không phải người máy" rồi bấm Kiểm tra để thử cả cặp khóa.${note}`,
		};
	if (json.success !== true) {
		const codes = json['error-codes'] || [];
		const hints = recaptchaHints(codes);
		return {
			ok: false,
			message: `Google từ chối (${codes.join(', ') || 'không rõ lý do'})${hints ? `: ${hints}` : ''}.${note}`,
		};
	}
	const hosts = parseHostnames(config.hostnames);
	const hostname = String(json.hostname || '').toLowerCase();
	if (hostname === GOOGLE_TEST_HOSTNAME) return { ok: false, message: testKeyMessage() + note };
	if (hosts.length && !hosts.includes(hostname))
		return {
			ok: false,
			message: `Cặp khóa đúng, nhưng tên miền "${hostname}" không có trong "Chỉ nhận từ tên miền" (${hosts.join(', ')}): người dùng mở trang ở tên miền này sẽ bị từ chối.${note}`,
		};
	return { ok: true, message: `Cặp khóa hoạt động bình thường (tên miền ${hostname}).${note}` };
};

// Google chỉ nhận body dạng form (application/x-www-form-urlencoded), không nhận JSON.
const verifyRecaptcha = async (token, ip) => {
	const config = await recaptchaConfig();
	/** @type {any} JSON trả về của Google reCAPTCHA siteverify */
	const json = await callWithRetry('reCAPTCHA', async () => {
		const body = new URLSearchParams({
			secret: config.secretKey || '',
			response: token,
		});
		if (ip) body.set('remoteip', ip);
		const res = await fetch(RECAPTCHA_VERIFY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString(),
			signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
		});
		return res.json();
	});
	if (!json) return false;
	if (json.success !== true) {
		const codes = json['error-codes'] || [];
		const hints = recaptchaHints(codes);
		logger.warn('[captcha] reCAPTCHA từ chối:', codes.join(','), hints ? `— ${hints}` : '');
		return false;
	}
	if (json.hostname === GOOGLE_TEST_HOSTNAME) logger.warn(`[captcha] ${testKeyMessage()}`);
	return hostnameAllowed('reCAPTCHA', config.hostnames, json.hostname);
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
	switch (await captchaProvider()) {
		case 'turnstile':
			return verifyTurnstile(token, ip);
		case 'recaptcha':
			return verifyRecaptcha(token, ip);
		default:
			return verifyPow(token, answer);
	}
};

module.exports = {
	generateCaptcha,
	verifyCaptcha,
	captchaProvider,
	validateSetting,
	normalizeSetting,
	testRecaptcha,
};
