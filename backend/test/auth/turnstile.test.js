// Captcha chế độ Cloudflare Turnstile (utils/captcha.js): bật khi có đủ 2 khoá,
// xác minh qua API Cloudflare (giả lập bằng fetch), lỗi mạng thì từ chối.
process.env.JWT_SECRET = 'test-secret';
process.env.TURNSTILE_SITE_KEY = 'site-key-test';
process.env.TURNSTILE_SECRET_KEY = 'secret-key-test';
process.env.TURNSTILE_HOSTNAMES = 'rms.benhvien.vn, localhost';
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateCaptcha, verifyCaptcha } = require('../../src/utils/captcha');

const calls = [];
const mockFetch = (impl) => {
	global.fetch = async (url, opts) => {
		calls.push({ url, body: JSON.parse(opts.body) });
		return impl();
	};
};

test('trả site key cho client, không có câu hỏi phép tính', async () => {
	assert.deepEqual(await generateCaptcha(), {
		provider: 'turnstile',
		site_key: 'site-key-test',
		action: 'public-form',
	});
});

test('Cloudflare xác nhận → qua; gửi kèm secret + IP người dùng', async () => {
	mockFetch(() => ({
		json: async () => ({ success: true, action: 'public-form', hostname: 'localhost' }),
	}));
	assert.equal(await verifyCaptcha('cf-token', undefined, '10.1.2.3'), true);
	const last = calls.at(-1);
	assert.match(last.url, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
	assert.deepEqual(last.body, {
		secret: 'secret-key-test',
		response: 'cf-token',
		remoteip: '10.1.2.3',
	});
});

test('Cloudflare từ chối (token dùng lại / giả) → không qua', async () => {
	mockFetch(() => ({
		json: async () => ({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
	}));
	assert.equal(await verifyCaptcha('cf-token', undefined, '10.1.2.3'), false);
});

test('token của widget khác (sai action) → không qua', async () => {
	mockFetch(() => ({
		json: async () => ({ success: true, action: 'login', hostname: 'localhost' }),
	}));
	assert.equal(await verifyCaptcha('cf-token', undefined, '10.1.2.3'), false);
});

test('token sinh trên tên miền lạ → không qua', async () => {
	mockFetch(() => ({
		json: async () => ({ success: true, action: 'public-form', hostname: 'evil.example' }),
	}));
	assert.equal(await verifyCaptcha('cf-token', undefined, '10.1.2.3'), false);
});

test('lỗi mạng thoáng qua → thử lại 1 lần rồi qua', async () => {
	let n = 0;
	mockFetch(() => {
		if (n++ === 0) throw new Error('ECONNRESET');
		return { json: async () => ({ success: true, action: 'public-form', hostname: 'localhost' }) };
	});
	assert.equal(await verifyCaptcha('cf-token', undefined, '10.1.2.3'), true);
});

test('không gọi được Cloudflare → từ chối (không bỏ qua kiểm tra)', async () => {
	mockFetch(() => {
		throw new Error('ENOTFOUND');
	});
	assert.equal(await verifyCaptcha('cf-token', undefined, '10.1.2.3'), false);
});

test('thiếu token → không gọi Cloudflare', async () => {
	const before = calls.length;
	assert.equal(await verifyCaptcha('', undefined, '10.1.2.3'), false);
	assert.equal(calls.length, before);
});
