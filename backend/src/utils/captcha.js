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
//  - Google reCAPTCHA "Tôi không phải người máy": ô tích của Google, đôi khi bắt
//    chọn ảnh — cũng fail-closed như Turnstile. 2 cách xác minh:
//      · Google Cloud (khuyến nghị — cloud.google.com/recaptcha/docs/using-features
//        #migrate-backend): RECAPTCHA_SITE_KEY + RECAPTCHA_PROJECT_ID +
//        RECAPTCHA_API_KEY → tạo "assessment" qua recaptchaenterprise.googleapis.com,
//        frontend tải enterprise.js. Khóa tạo mới trên Google Cloud không có secret key.
//      · Cũ (legacy): RECAPTCHA_SITE_KEY + RECAPTCHA_SECRET_KEY → siteverify.
//    Đặt Project ID là dùng cách Google Cloud (secret key bỏ qua). Khóa đặt ở Cấu
//    hình hệ thống → tab "Bảo mật & Tài khoản" (áp dụng ngay); trống thì lấy .env.
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
const RECAPTCHA_ASSESS_URL = (projectId) =>
	`https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/assessments`;
const VERIFY_TIMEOUT_MS = 5000;

const turnstileEnabled = () =>
	!!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);

const RECAPTCHA_KEYS = [
	'RECAPTCHA_SITE_KEY',
	'RECAPTCHA_SECRET_KEY',
	'RECAPTCHA_HOSTNAMES',
	'RECAPTCHA_PROJECT_ID',
	'RECAPTCHA_API_KEY',
];
// Khóa reCAPTCHA: Cấu hình hệ thống, từng key trống thì lấy .env (systemSettingService.getValue).
// Cắt khoảng trắng: khóa dán từ trang quản trị Google hay dính dấu cách / xuống dòng ở cuối —
// secret dính khoảng trắng thì Google trả invalid-input-secret, MỌI lượt gửi đều bị từ chối.
// Cắt cả lúc đọc để giá trị đã lưu trước bản sửa này (chưa cắt) cũng dùng được.
const recaptchaConfig = async () => {
	const [siteKey, secretKey, hostnames, projectId, apiKey] = await Promise.all(
		RECAPTCHA_KEYS.map(async (k) => (await systemSettingService.getValue(k))?.trim() || undefined),
	);
	// Có Project ID ⇒ xác minh qua Google Cloud (assessment), không dùng secret key
	return { siteKey, secretKey, hostnames, projectId, apiKey, enterprise: !!projectId };
};

// Chuẩn hóa giá trị trước khi lưu (systemSettings.routes.js) — khớp với validateSetting,
// vốn kiểm tra trên chuỗi đã cắt. Chuỗi che (••••••) của secret giữ nguyên để service nhận ra.
const normalizeSetting = (key, value) =>
	RECAPTCHA_KEYS.includes(key) && typeof value === 'string' && !/^•+$/.test(value)
		? value.trim()
		: value;
const recaptchaReady = (c) => !!(c.siteKey && (c.enterprise ? c.apiKey : c.secretKey));
const recaptchaEnabled = async () => recaptchaReady(await recaptchaConfig());

/** @returns {Promise<'turnstile' | 'recaptcha' | 'pow'>} */
const captchaProvider = async () =>
	turnstileEnabled() ? 'turnstile' : (await recaptchaEnabled()) ? 'recaptcha' : 'pow';

// Kiểm tra khi admin lưu cấu hình (systemSettings.routes.js) — null = hợp lệ
const KEY_RE = /^[A-Za-z0-9_-]{20,100}$/;
// Project ID của Google Cloud: 6–30 ký tự, chữ thường/số/"-", bắt đầu bằng chữ
const PROJECT_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const HOST_RE =
	/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
const validateSetting = (key, value) => {
	if (value === null || value === '' || !RECAPTCHA_KEYS.includes(key)) return null;
	if (key === 'RECAPTCHA_HOSTNAMES') {
		const bad = parseHostnames(value).filter((h) => !HOST_RE.test(h));
		return bad.length ? `Tên miền không hợp lệ: ${bad.join(', ')}` : null;
	}
	if (key === 'RECAPTCHA_PROJECT_ID')
		return PROJECT_RE.test(value.trim())
			? null
			: 'Project ID không hợp lệ (vd rms-benhvien — chữ thường, số, "-", 6–30 ký tự; là ID, không phải tên dự án)';
	// Khóa secret: UI gửi lại chuỗi che (••••••) khi không đổi — systemSettingService tự giữ nguyên
	if ((key === 'RECAPTCHA_SECRET_KEY' || key === 'RECAPTCHA_API_KEY') && /^•+$/.test(value))
		return null;
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
		case 'recaptcha': {
			const c = await recaptchaConfig();
			// enterprise: frontend tải enterprise.js thay cho api.js (cùng khóa Google Cloud)
			return {
				provider: 'recaptcha',
				site_key: c.siteKey,
				...(c.enterprise ? { enterprise: true } : {}),
			};
		}
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

// tokenProperties.invalidReason của assessment (Google Cloud)
const INVALID_REASON_HINTS = {
	MALFORMED: 'token hỏng hoặc không phải token reCAPTCHA',
	EXPIRED: 'token quá 2 phút từ lúc tích ô',
	DUPE: 'token đã được xác minh trước đó (mỗi token chỉ dùng 1 lần)',
	SITE_MISMATCH:
		'token sinh từ site key khác — Site key không khớp, hoặc không thuộc Project ID đã đặt',
	MISSING: 'không có token',
	BROWSER_ERROR:
		'trình duyệt gặp lỗi khi lấy token (mạng chập chờn, script Google bị chặn) — tích lại ô',
};

// Lỗi API Google Cloud ({ error: { code, status, message } }) — thường do cấu hình
const assessErrorHint = (err) => {
	const msg = String(err?.message || '');
	if (/api key not valid|API_KEY_INVALID/i.test(msg)) return 'API key sai';
	if (/SERVICE_DISABLED|has not been used|is disabled/i.test(msg))
		return 'chưa bật "reCAPTCHA Enterprise API" cho dự án (Google Cloud → APIs & Services)';
	if (/API_KEY_.*BLOCKED|blocked/i.test(msg))
		return 'API key bị giới hạn — cho phép API "reCAPTCHA Enterprise API" và bỏ giới hạn website/IP không khớp máy chủ';
	if (err?.code === 404 || err?.status === 'NOT_FOUND')
		return 'Project ID sai hoặc Site key không thuộc dự án này';
	if (err?.code === 403 || err?.status === 'PERMISSION_DENIED')
		return 'API key không có quyền với Project ID này (khóa của dự án khác?)';
	if (err?.code === 429 || err?.status === 'RESOURCE_EXHAUSTED')
		return 'vượt hạn mức gọi API (miễn phí 10.000 lượt/tháng — cần bật thanh toán)';
	return '';
};

// Gọi Google, trả JSON thô — ném lỗi khi lỗi mạng (callWithRetry thử lại)
const callRecaptcha = async (config, token, ip, timeoutMs) => {
	if (config.enterprise) {
		// projects.assessments.create — API key gửi qua header, không để lộ trên URL / log proxy
		const res = await fetch(RECAPTCHA_ASSESS_URL(config.projectId), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': config.apiKey || '' },
			body: JSON.stringify({
				event: { token, siteKey: config.siteKey, ...(ip ? { userIpAddress: ip } : {}) },
			}),
			signal: AbortSignal.timeout(timeoutMs),
		});
		return res.json();
	}
	// siteverify chỉ nhận body dạng form (application/x-www-form-urlencoded), không nhận JSON
	const body = new URLSearchParams({ secret: config.secretKey || '', response: token });
	if (ip) body.set('remoteip', ip);
	const res = await fetch(RECAPTCHA_VERIFY_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString(),
		signal: AbortSignal.timeout(timeoutMs),
	});
	return res.json();
};

/**
 * Đọc kết quả của 2 kiểu API về 1 dạng.
 * @returns {{ valid: boolean, hostname?: string, config?: boolean, problem?: string }}
 * config = true: lỗi cấu hình (khóa / dự án / API) — mọi lượt đều sẽ bị từ chối.
 */
const readRecaptcha = (config, json) => {
	if (config.enterprise) {
		if (json?.error) {
			const hint = assessErrorHint(json.error);
			const what = [json.error.code, json.error.status].filter(Boolean).join(' ');
			return {
				valid: false,
				config: true,
				problem: `${what || 'lỗi'}${hint ? `: ${hint}` : ''} — ${json.error.message || ''}`.trim(),
			};
		}
		const tp = json?.tokenProperties || {};
		if (tp.valid !== true) {
			const reason = tp.invalidReason || 'không rõ lý do';
			const hint = INVALID_REASON_HINTS[reason];
			return {
				valid: false,
				config: reason === 'SITE_MISMATCH',
				problem: `${reason}${hint ? `: ${hint}` : ''}`,
			};
		}
		return { valid: true, hostname: String(tp.hostname || '').toLowerCase() };
	}
	if (json?.success !== true) {
		const codes = json?.['error-codes'] || [];
		const hints = recaptchaHints(codes);
		return {
			valid: false,
			config: codes.some((c) => c.includes('secret')),
			problem: `${codes.join(', ') || 'không rõ lý do'}${hints ? `: ${hints}` : ''}`,
		};
	}
	return { valid: true, hostname: String(json.hostname || '').toLowerCase() };
};

// Nút "Kiểm tra" ở Cấu hình hệ thống (systemSettings.routes.js), dùng khóa ĐÃ LƯU.
// token = token thật admin vừa tích trên trang cấu hình ⇒ thử trọn bộ khóa + tên miền.
// Không có token: siteverify (cũ) xét token trước khóa bí mật — token giả luôn ra
// invalid-input-response, nên chỉ thử được kết nối; assessment (Google Cloud) thì vẫn báo
// lỗi Project ID / API key / API chưa bật dù token giả.
// Trả { ok, message } — ok = false: cấu hình / mạng đang làm mọi lượt đăng ký bị từ chối.
const testRecaptcha = async (token) => {
	const config = await recaptchaConfig();
	if (!recaptchaReady(config))
		return {
			ok: false,
			message: config.enterprise
				? 'Chưa đặt đủ Site key, Project ID và API key.'
				: 'Chưa đặt đủ Site key và Secret key (hoặc Site key + Project ID + API key của Google Cloud).',
		};
	const note = turnstileEnabled()
		? ' Lưu ý: máy chủ đang đặt khóa Turnstile trong .env nên form công khai dùng Turnstile, không dùng reCAPTCHA.'
		: '';
	const host = config.enterprise ? 'recaptchaenterprise.googleapis.com' : 'www.google.com';
	/** @type {any} */
	let json;
	try {
		json = await callRecaptcha(config, token || 'kiem-tra', null, VERIFY_TIMEOUT_MS * 2);
	} catch (err) {
		return {
			ok: false,
			message: `Máy chủ không gọi được ${host} (${err.cause?.code || err.name}) nên mọi lượt đăng ký đang bị từ chối. Cần mở tường lửa / DNS, hoặc cấu hình proxy cho backend.${note}`,
		};
	}
	const r = readRecaptcha(config, json);
	if (!token) {
		if (!r.valid && r.config)
			return { ok: false, message: `Google từ chối — ${r.problem}.${note}` };
		return {
			ok: true,
			message: config.enterprise
				? `Máy chủ gọi được Google Cloud, Project ID và API key dùng được. Tích ô "Tôi không phải người máy" rồi bấm Kiểm tra để thử cả Site key.${note}`
				: `Máy chủ gọi được Google. Tích ô "Tôi không phải người máy" rồi bấm Kiểm tra để thử cả cặp khóa.${note}`,
		};
	}
	if (!r.valid) return { ok: false, message: `Google từ chối — ${r.problem}.${note}` };
	const hosts = parseHostnames(config.hostnames);
	if (!config.enterprise && r.hostname === GOOGLE_TEST_HOSTNAME)
		return { ok: false, message: testKeyMessage() + note };
	const what = config.enterprise ? 'Khóa Google Cloud' : 'Cặp khóa';
	if (hosts.length && !hosts.includes(r.hostname))
		return {
			ok: false,
			message: `${what} đúng, nhưng tên miền "${r.hostname}" không có trong "Chỉ nhận từ tên miền" (${hosts.join(', ')}): người dùng mở trang ở tên miền này sẽ bị từ chối.${note}`,
		};
	return { ok: true, message: `${what} hoạt động bình thường (tên miền ${r.hostname}).${note}` };
};

const verifyRecaptcha = async (token, ip) => {
	const config = await recaptchaConfig();
	const name = config.enterprise ? 'reCAPTCHA (Google Cloud)' : 'reCAPTCHA';
	/** @type {any} JSON trả về của Google */
	const json = await callWithRetry(name, () => callRecaptcha(config, token, ip, VERIFY_TIMEOUT_MS));
	if (!json) return false;
	const r = readRecaptcha(config, json);
	if (!r.valid) {
		logger.warn(`[captcha] ${name} từ chối: ${r.problem}`);
		return false;
	}
	if (!config.enterprise && r.hostname === GOOGLE_TEST_HOSTNAME)
		logger.warn(`[captcha] ${testKeyMessage()}`);
	return hostnameAllowed(name, config.hostnames, r.hostname);
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
