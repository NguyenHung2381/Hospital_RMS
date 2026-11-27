#!/usr/bin/env node
// Chẩn đoán Google reCAPTCHA khi cổng công khai báo "Mã xác nhận không đúng hoặc đã hết hạn"
// cho mọi lượt gửi, hoặc Google Console báo "your site is not verifying reCAPTCHA solutions".
// Chạy TRONG container backend (cùng mạng, cùng cấu hình với API thật):
//
//   docker exec <container-backend> node scripts/check-recaptcha.js
//
// In ra: chế độ captcha đang dùng, khóa đã đặt chưa (không in khóa), khóa có dính khoảng
// trắng không, và máy chủ có gọi được Google không (khóa Google Cloud: kiểm cả Project ID /
// API key / API đã bật).
// Lưu ý: Google xét token TRƯỚC khóa bí mật — với token giả, khóa sai hay đúng Google đều
// trả invalid-input-response, nên script không kiểm được khóa bí mật đúng cặp với site key.
// Việc đó xem ở log backend sau 1 lượt gửi thật: dòng "[captcha] reCAPTCHA từ chối: …".
require('../src/config/loadEnv');
const systemSettingService = require('../src/modules/settings/systemSettingService');
const { captchaProvider, testRecaptcha } = require('../src/utils/captcha');

const describeKey = (raw) => {
	if (!raw) return 'CHƯA đặt';
	const trimmed = raw.trim();
	const ws =
		raw !== trimmed ? ' — dính khoảng trắng/xuống dòng (bản mới tự cắt, bản cũ sẽ lỗi)' : '';
	return `đã đặt, ${trimmed.length} ký tự${ws}`;
};

const main = async () => {
	const [site, secret, hosts, project, apiKey] = await Promise.all(
		[
			'RECAPTCHA_SITE_KEY',
			'RECAPTCHA_SECRET_KEY',
			'RECAPTCHA_HOSTNAMES',
			'RECAPTCHA_PROJECT_ID',
			'RECAPTCHA_API_KEY',
		].map((k) => systemSettingService.getValue(k)),
	);
	console.log('Chế độ captcha đang dùng :', await captchaProvider());
	console.log(
		'Cách xác minh            :',
		project?.trim() ? 'Google Cloud (assessment)' : 'cũ (siteverify + secret key)',
	);
	console.log('Site key                 :', describeKey(site));
	console.log('Project ID               :', project?.trim() || 'CHƯA đặt');
	console.log('API key                  :', describeKey(apiKey));
	console.log('Khóa bí mật (cũ)         :', describeKey(secret));
	console.log('Tên miền cho phép        :', hosts?.trim() || '(không giới hạn)');
	const proxy = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'].find(
		(k) => process.env[k],
	);
	if (proxy)
		console.log(
			`Proxy                    : có ${proxy} nhưng fetch của Node chỉ dùng khi đặt NODE_USE_ENV_PROXY=1`,
			process.env.NODE_USE_ENV_PROXY === '1' ? '(đã đặt)' : '(CHƯA đặt)',
		);

	// Cùng hàm với nút "Kiểm tra" ở Cấu hình hệ thống (token giả): kiểm kết nối, và với khóa
	// Google Cloud kiểm luôn Project ID / API key / API đã bật chưa.
	const started = Date.now();
	const r = await testRecaptcha();
	console.log(`Kiểm tra (${Date.now() - started} ms)`, r.ok ? 'ĐẠT' : 'LỖI', '—', r.message);
	if (r.ok)
		console.log(
			'=> Nếu vẫn lỗi: gửi thử 1 đăng ký rồi xem log backend dòng "[captcha] reCAPTCHA ... từ chối".',
		);
};

main()
	.catch((err) => console.error('Lỗi:', err.message))
	.finally(() => process.exit(0));
