// Captcha proof-of-work: gửi ngay sau khi lấy mã (nhanh hơn người thật điền
// form) thì bị từ chối dù lời giải đúng.
process.env.JWT_SECRET = 'test-secret';
// Ghim chế độ proof-of-work: đặt rỗng để dotenv không nạp khoá Turnstile/reCAPTCHA từ .env máy dev
for (const k of [
	'TURNSTILE_SITE_KEY',
	'TURNSTILE_SECRET_KEY',
	'RECAPTCHA_SITE_KEY',
	'RECAPTCHA_SECRET_KEY',
])
	process.env[k] = '';
process.env.CAPTCHA_POW_BITS = '12';
process.env.CAPTCHA_MIN_FILL_SEC = '3';
const test = require('node:test');
const assert = require('node:assert/strict');
const nodeCrypto = require('crypto');
const { install } = require('./fakeDb');
install(async () => []);
const { generateCaptcha, verifyCaptcha } = require('../../src/utils/captcha');
const { leadingZeroBits } = require('../../src/utils/loginShield');

test('gửi sớm hơn thời gian điền form tối thiểu → không qua', async () => {
	const c = await generateCaptcha();
	let nonce;
	for (let n = 0; !nonce; n++) {
		const d = nodeCrypto
			.createHash('sha256')
			.update(`${c.token}:${n.toString(36)}`)
			.digest();
		if (leadingZeroBits(d) >= c.bits) nonce = n.toString(36);
	}
	assert.equal(await verifyCaptcha(c.token, nonce), false);
});
