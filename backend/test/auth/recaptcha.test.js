// Captcha chế độ Google reCAPTCHA v2 (utils/captcha.js): bật khi có đủ 2 khoá,
// xác minh qua API Google (giả lập bằng fetch), lỗi mạng thì từ chối.
process.env.JWT_SECRET = 'test-secret';
delete process.env.TURNSTILE_SITE_KEY;
delete process.env.TURNSTILE_SECRET_KEY;
process.env.RECAPTCHA_SITE_KEY = 'site-key-test';
process.env.RECAPTCHA_SECRET_KEY = 'secret-key-test';
process.env.RECAPTCHA_HOSTNAMES = 'rms.benhvien.vn, localhost';
const test = require('node:test');
const assert = require('node:assert/strict');
// Cấu hình hệ thống giả lập: key nào chưa đặt qua UI thì lấy .env (như getValue thật)
const uiSettings = {};
require('../../src/modules/settings/systemSettingService').getValue = async (key) =>
	uiSettings[key] ?? process.env[key];
const {
	generateCaptcha,
	verifyCaptcha,
	captchaProvider,
	validateSetting,
} = require('../../src/utils/captcha');

const calls = [];
const mockFetch = (impl) => {
	global.fetch = async (url, opts) => {
		calls.push({ url, headers: opts.headers, body: new URLSearchParams(opts.body) });
		return impl();
	};
};

test('trả site key cho client', async () => {
	assert.equal(await captchaProvider(), 'recaptcha');
	assert.deepEqual(await generateCaptcha(), { provider: 'recaptcha', site_key: 'site-key-test' });
});

test('khoá đặt ở Cấu hình hệ thống được ưu tiên hơn .env', async () => {
	uiSettings.RECAPTCHA_SITE_KEY = 'ui-site-key';
	uiSettings.RECAPTCHA_SECRET_KEY = 'ui-secret-key';
	try {
		assert.deepEqual(await generateCaptcha(), { provider: 'recaptcha', site_key: 'ui-site-key' });
		mockFetch(() => ({ json: async () => ({ success: true, hostname: 'localhost' }) }));
		assert.equal(await verifyCaptcha('g-token', undefined, '10.1.2.3'), true);
		assert.equal(calls.at(-1).body.get('secret'), 'ui-secret-key');
	} finally {
		delete uiSettings.RECAPTCHA_SITE_KEY;
		delete uiSettings.RECAPTCHA_SECRET_KEY;
	}
});

test('chưa có khoá nào → quay về proof-of-work', async () => {
	const saved = process.env.RECAPTCHA_SECRET_KEY;
	delete process.env.RECAPTCHA_SECRET_KEY;
	try {
		assert.equal(await captchaProvider(), 'pow');
	} finally {
		process.env.RECAPTCHA_SECRET_KEY = saved;
	}
});

test('kiểm tra giá trị khi admin lưu cấu hình', () => {
	assert.equal(
		validateSetting('RECAPTCHA_SITE_KEY', '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'),
		null,
	);
	assert.match(validateSetting('RECAPTCHA_SITE_KEY', 'abc') ?? '', /không hợp lệ/);
	assert.equal(validateSetting('RECAPTCHA_SECRET_KEY', '••••••'), null);
	assert.equal(validateSetting('RECAPTCHA_HOSTNAMES', 'rms.benhvien.vn, localhost'), null);
	assert.match(validateSetting('RECAPTCHA_HOSTNAMES', 'https://rms.vn') ?? '', /không hợp lệ/);
	assert.equal(validateSetting('RECAPTCHA_SITE_KEY', ''), null);
});

test('Google xác nhận → qua; gửi dạng form kèm secret + IP người dùng', async () => {
	mockFetch(() => ({ json: async () => ({ success: true, hostname: 'localhost' }) }));
	assert.equal(await verifyCaptcha('g-token', undefined, '10.1.2.3'), true);
	const last = calls.at(-1);
	assert.equal(last.url, 'https://www.google.com/recaptcha/api/siteverify');
	assert.equal(last.headers['Content-Type'], 'application/x-www-form-urlencoded');
	assert.deepEqual(Object.fromEntries(last.body), {
		secret: 'secret-key-test',
		response: 'g-token',
		remoteip: '10.1.2.3',
	});
});

test('không có IP → không gửi remoteip', async () => {
	mockFetch(() => ({ json: async () => ({ success: true, hostname: 'localhost' }) }));
	assert.equal(await verifyCaptcha('g-token'), true);
	assert.equal(calls.at(-1).body.has('remoteip'), false);
});

test('Google từ chối (token dùng lại / hết hạn) → không qua', async () => {
	mockFetch(() => ({
		json: async () => ({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
	}));
	assert.equal(await verifyCaptcha('g-token', undefined, '10.1.2.3'), false);
});

test('token sinh trên tên miền lạ → không qua', async () => {
	mockFetch(() => ({ json: async () => ({ success: true, hostname: 'evil.example' }) }));
	assert.equal(await verifyCaptcha('g-token', undefined, '10.1.2.3'), false);
});

test('lỗi mạng thoáng qua → thử lại 1 lần rồi qua', async () => {
	let n = 0;
	mockFetch(() => {
		if (n++ === 0) throw new Error('ECONNRESET');
		return { json: async () => ({ success: true, hostname: 'rms.benhvien.vn' }) };
	});
	assert.equal(await verifyCaptcha('g-token', undefined, '10.1.2.3'), true);
});

test('không gọi được Google → từ chối (không bỏ qua kiểm tra)', async () => {
	mockFetch(() => {
		throw new Error('ENOTFOUND');
	});
	assert.equal(await verifyCaptcha('g-token', undefined, '10.1.2.3'), false);
});

test('thiếu token → không gọi Google', async () => {
	const before = calls.length;
	assert.equal(await verifyCaptcha('', undefined, '10.1.2.3'), false);
	assert.equal(calls.length, before);
});

test('đặt cả khoá Turnstile → Turnstile được ưu tiên', async () => {
	process.env.TURNSTILE_SITE_KEY = 'cf-site';
	process.env.TURNSTILE_SECRET_KEY = 'cf-secret';
	try {
		assert.equal(await captchaProvider(), 'turnstile');
		assert.equal((await generateCaptcha()).provider, 'turnstile');
	} finally {
		delete process.env.TURNSTILE_SITE_KEY;
		delete process.env.TURNSTILE_SECRET_KEY;
	}
});
