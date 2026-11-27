#!/usr/bin/env node
// Chẩn đoán Google reCAPTCHA khi cổng công khai báo "Mã xác nhận không đúng hoặc đã hết hạn"
// cho mọi lượt gửi, hoặc Google Console báo "your site is not verifying reCAPTCHA solutions".
// Chạy TRONG container backend (cùng mạng, cùng cấu hình với API thật):
//
//   docker exec <container-backend> node scripts/check-recaptcha.js
//
// In ra: chế độ captcha đang dùng, khóa đã đặt chưa (không in khóa), khóa có dính khoảng
// trắng không, và máy chủ có gọi được API siteverify của Google không.
// Lưu ý: Google xét token TRƯỚC khóa bí mật — với token giả, khóa sai hay đúng Google đều
// trả invalid-input-response, nên script không kiểm được khóa bí mật đúng cặp với site key.
// Việc đó xem ở log backend sau 1 lượt gửi thật: dòng "[captcha] reCAPTCHA từ chối: …".
require('../src/config/loadEnv');
const systemSettingService = require('../src/modules/settings/systemSettingService');
const { captchaProvider } = require('../src/utils/captcha');

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

const describeKey = (raw) => {
	if (!raw) return 'CHƯA đặt';
	const trimmed = raw.trim();
	const ws =
		raw !== trimmed ? ' — dính khoảng trắng/xuống dòng (bản mới tự cắt, bản cũ sẽ lỗi)' : '';
	return `đã đặt, ${trimmed.length} ký tự${ws}`;
};

const main = async () => {
	const [site, secret, hosts] = await Promise.all(
		['RECAPTCHA_SITE_KEY', 'RECAPTCHA_SECRET_KEY', 'RECAPTCHA_HOSTNAMES'].map((k) =>
			systemSettingService.getValue(k),
		),
	);
	console.log('Chế độ captcha đang dùng :', await captchaProvider());
	console.log('Site key                 :', describeKey(site));
	console.log('Khóa bí mật              :', describeKey(secret));
	console.log('Tên miền cho phép        :', hosts?.trim() || '(không giới hạn)');
	const proxy = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'].find(
		(k) => process.env[k],
	);
	if (proxy)
		console.log(
			`Proxy                    : có ${proxy} nhưng fetch của Node chỉ dùng khi đặt NODE_USE_ENV_PROXY=1`,
			process.env.NODE_USE_ENV_PROXY === '1' ? '(đã đặt)' : '(CHƯA đặt)',
		);

	const started = Date.now();
	try {
		const res = await fetch(VERIFY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ secret: (secret || '').trim(), response: 'kiem-tra' }).toString(),
			signal: AbortSignal.timeout(10000),
		});
		const json = await res.json();
		console.log(
			`Kết nối tới Google       : ĐƯỢC (${Date.now() - started} ms, HTTP ${res.status}, ${JSON.stringify(json['error-codes'] || [])})`,
		);
		console.log(
			'=> Mạng ổn. Nếu vẫn lỗi: gửi thử 1 đăng ký rồi xem log backend dòng "[captcha] reCAPTCHA từ chối".',
		);
	} catch (err) {
		console.log(
			`Kết nối tới Google       : KHÔNG ĐƯỢC (${err.cause?.code || err.name}: ${err.cause?.message || err.message})`,
		);
		console.log(
			'=> Máy chủ không gọi ra được www.google.com — mở tường lửa/DNS, hoặc cấu hình proxy (xem dòng Proxy).',
		);
	}
};

main()
	.catch((err) => console.error('Lỗi:', err.message))
	.finally(() => process.exit(0));
