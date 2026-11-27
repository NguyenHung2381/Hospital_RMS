// Captcha chế độ Google reCAPTCHA v2 (utils/captcha.js): bật khi có đủ 2 khóa,
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
	normalizeSetting,
	testRecaptcha,
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

test('khóa đặt ở Cấu hình hệ thống được ưu tiên hơn .env', async () => {
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

// Khóa dán từ trang Google hay dính khoảng trắng / xuống dòng — trước đây lưu được (kiểm tra
// trên chuỗi đã cắt) nhưng gửi nguyên văn cho Google ⇒ invalid-input-secret, lượt nào cũng lỗi.
test('khóa đã lưu dính khoảng trắng → cắt trước khi dùng', async () => {
	uiSettings.RECAPTCHA_SITE_KEY = ' ui-site-key \n';
	uiSettings.RECAPTCHA_SECRET_KEY = 'ui-secret-key \r\n';
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

test('lưu cấu hình: cắt khoảng trắng khóa reCAPTCHA, giữ chuỗi che và key khác', () => {
	assert.equal(normalizeSetting('RECAPTCHA_SECRET_KEY', ' abc \n'), 'abc');
	assert.equal(normalizeSetting('RECAPTCHA_HOSTNAMES', ' rms.vn '), 'rms.vn');
	assert.equal(normalizeSetting('RECAPTCHA_SECRET_KEY', '••••••'), '••••••');
	assert.equal(normalizeSetting('SMTP_PASS', ' p '), ' p ');
	assert.equal(normalizeSetting('RECAPTCHA_SITE_KEY', null), null);
});

// Nút "Kiểm tra" ở Cấu hình hệ thống
test('kiểm tra: không token → chỉ thử kết nối, gửi khóa đã cắt khoảng trắng', async () => {
	uiSettings.RECAPTCHA_SECRET_KEY = 'ui-secret-key \n';
	try {
		mockFetch(() => ({
			json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
		}));
		const r = await testRecaptcha();
		assert.equal(r.ok, true);
		assert.match(r.message, /gọi được Google/);
		assert.equal(calls.at(-1).body.get('secret'), 'ui-secret-key');
	} finally {
		delete uiSettings.RECAPTCHA_SECRET_KEY;
	}
});

test('kiểm tra: không gọi được Google → báo lỗi mạng', async () => {
	mockFetch(() => {
		throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
	});
	const r = await testRecaptcha('g-token');
	assert.equal(r.ok, false);
	assert.match(r.message, /không gọi được www\.google\.com \(ENOTFOUND\)/);
});

test('kiểm tra: token thật + khóa sai → nêu lý do', async () => {
	mockFetch(() => ({
		json: async () => ({ success: false, 'error-codes': ['invalid-input-secret'] }),
	}));
	const r = await testRecaptcha('g-token');
	assert.equal(r.ok, false);
	assert.match(r.message, /invalid-input-secret.*khóa bí mật sai/);
});

test('kiểm tra: cặp khóa đúng nhưng tên miền ngoài danh sách → báo', async () => {
	mockFetch(() => ({ json: async () => ({ success: true, hostname: '10.0.0.5' }) }));
	const r = await testRecaptcha('g-token');
	assert.equal(r.ok, false);
	assert.match(r.message, /10\.0\.0\.5.*rms\.benhvien\.vn, localhost/);
});

test('kiểm tra: cặp khóa + tên miền đúng → ok', async () => {
	mockFetch(() => ({ json: async () => ({ success: true, hostname: 'rms.benhvien.vn' }) }));
	const r = await testRecaptcha('g-token');
	assert.deepEqual(r, {
		ok: true,
		message: 'Cặp khóa hoạt động bình thường (tên miền rms.benhvien.vn).',
	});
});

test('kiểm tra: thiếu khóa → không gọi Google', async () => {
	const saved = process.env.RECAPTCHA_SECRET_KEY;
	delete process.env.RECAPTCHA_SECRET_KEY;
	const before = calls.length;
	try {
		const r = await testRecaptcha('g-token');
		assert.equal(r.ok, false);
		assert.equal(calls.length, before);
	} finally {
		process.env.RECAPTCHA_SECRET_KEY = saved;
	}
});

test('chưa có khóa nào → quay về proof-of-work', async () => {
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

test('đặt cả khóa Turnstile → Turnstile được ưu tiên', async () => {
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
