// Quên mật khẩu (passwordResetService) với CSDL giả: xin mã / đặt lại bằng
// username hoặc email; email dùng chung nhiều tài khoản thì không gửi mã.
const os = require('os');
const path = require('path');
const fs = require('fs');
process.env.SECRETS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-reset-'));

const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('./fakeDb');

const USERS = [
	{ id: 'U1', username: 'NVA_0001', full_name: 'Nguyễn Văn A', email: 'a@bv.vn', is_active: 1 },
	{ id: 'U2', username: 'TTB_0002', full_name: 'Trần Thị B', email: 'chung@bv.vn', is_active: 1 },
	{ id: 'U3', username: 'LVC_0003', full_name: 'Lê Văn C', email: 'chung@bv.vn', is_active: 1 },
];
const otps = new Map(); // user_id → { code_hash, attempts }
let newPassword = null;
const failureEvents = []; // target_id của mỗi event password_reset_failed

install(async (text, inputs) => {
	if (/WHERE email = @login/.test(text)) return USERS.filter((u) => u.email === inputs.login);
	if (/WHERE username = @login/.test(text)) return USERS.filter((u) => u.username === inputs.login);
	if (/SELECT 1 AS x FROM password_reset_otps/.test(text)) return [];
	if (/INSERT INTO password_reset_otps/.test(text)) {
		otps.set(inputs.id, { code_hash: inputs.hash, attempts: 0 });
		return [];
	}
	if (/UPDATE users SET password = @password/.test(text)) {
		newPassword = inputs.password;
		otps.delete(inputs.id); // cùng câu lệnh: xóa OTP + refresh token
		return [];
	}
	if (/UPDATE password_reset_otps SET attempts = attempts \+ 1/.test(text)) {
		const o = otps.get(inputs.id);
		if (!o || o.attempts >= inputs.max) return [];
		o.attempts++;
		return [{ id: inputs.id, code_hash: o.code_hash }];
	}
	if (/FROM security_events/.test(text) && inputs.type === 'password_reset_failed')
		return [{ n: failureEvents.filter((id) => id === inputs.id).length }];
	return [];
});

require('../../src/modules/audit/securityEventService').log = async (e) => {
	if (e.eventType === 'password_reset_failed') failureEvents.push(e.targetId);
};
require('../../src/modules/settings/systemSettingService').getValue = async () => 'true';
require('../../src/modules/auth/sessionVersion').bumpTokenVersion = async () => {};
const mailService = require('../../src/modules/notifications/mailService');
const sent = [];
mailService.isEnabled = async () => true;
mailService.renderOtpEmail = (o) => o;
mailService.send = async (m) => sent.push(m);
const svc = require('../../src/modules/auth/passwordResetService');

test('xin mã bằng email: gửi tới đúng người, link mang username chứ không mang email', async () => {
	await svc.requestOtp('a@bv.vn');
	assert.equal(sent.length, 1);
	assert.equal(sent[0].to, 'a@bv.vn');
	assert.match(sent[0].html.resetUrl, /\?u=NVA_0001$/);
	assert.ok(otps.has('U1'));
});

test('email dùng chung nhiều tài khoản: không gửi mã, không lỗi', async () => {
	sent.length = 0;
	await svc.requestOtp('chung@bv.vn');
	assert.equal(sent.length, 0);
});

test('đặt lại bằng email: OTP sai bị từ chối; mật khẩu chứa username thật bị chặn; hợp lệ thì đổi', async () => {
	const secretBox = require('../../src/utils/secretBox');
	otps.set('U1', { code_hash: secretBox.keyedHash('123456'), attempts: 0 });
	await assert.rejects(
		svc.resetPassword('a@bv.vn', '000000', 'Matkhau#2026x'),
		(e) => e.statusCode === 400,
	);
	await assert.rejects(svc.resetPassword('a@bv.vn', '123456', 'nva_0001#Abc9'), (e) =>
		/tên đăng nhập/.test(e.message),
	);
	await svc.resetPassword('a@bv.vn', '123456', 'Matkhau#2026x');
	assert.ok(newPassword);
});

const setOtp = (code, attempts = 0) => {
	const secretBox = require('../../src/utils/secretBox');
	otps.set('U1', { code_hash: secretBox.keyedHash(code), attempts });
};

test('mỗi mã chỉ thử được 5 lần — kể cả khi nhiều request sai gửi cùng lúc', async () => {
	failureEvents.length = 0;
	setOtp('123456');
	const wrong = Array.from({ length: 8 }, (_, i) =>
		svc.resetPassword('a@bv.vn', String(100000 + i), 'Matkhau#2026x').catch((e) => e),
	);
	assert.ok((await Promise.all(wrong)).every((e) => e.statusCode === 400));
	assert.equal(failureEvents.length, 5); // 3 request sau không còn lượt để so mã
	await assert.rejects(svc.resetPassword('a@bv.vn', '123456', 'Matkhau#2026x'), (e) =>
		/OTP/.test(e.message),
	);
});

test('sai đủ 10 lần trong 24h (qua nhiều mã): ngừng cấp mã mới và từ chối cả mã đúng', async () => {
	failureEvents.length = 0;
	for (let round = 0; round < 2; round++) {
		setOtp('123456');
		for (let i = 0; i < 5; i++)
			await assert.rejects(svc.resetPassword('a@bv.vn', '000000', 'Matkhau#2026x'));
	}
	assert.equal(failureEvents.length, 10);

	sent.length = 0;
	otps.delete('U1');
	await svc.requestOtp('a@bv.vn');
	assert.equal(sent.length, 0);
	assert.ok(!otps.has('U1'));

	setOtp('123456');
	await assert.rejects(svc.resetPassword('a@bv.vn', '123456', 'Matkhau#2026x'), (e) =>
		/OTP/.test(e.message),
	);
	failureEvents.length = 0;
});

test('xin mã không chờ gửi mail xong (thời gian phản hồi không lộ tài khoản có thật)', async () => {
	const original = mailService.send;
	mailService.send = () => new Promise(() => {}); // SMTP treo
	try {
		otps.delete('U1');
		await svc.requestOtp('a@bv.vn'); // treo ở đây nếu còn await mail
		assert.ok(otps.has('U1'));
	} finally {
		mailService.send = original;
	}
});

test('production: mail tắt cũng KHÔNG ghi mã OTP vào log', async () => {
	const logger = require('../../src/config/logger');
	const originalInfo = logger.info;
	const originalEnv = process.env.NODE_ENV;
	const logged = [];
	logger.info = (...args) => logged.push(args.join(' '));
	mailService.isEnabled = async () => false;
	try {
		process.env.NODE_ENV = 'production';
		otps.delete('U1');
		await svc.requestOtp('a@bv.vn');
		await new Promise((r) => setImmediate(r));
		assert.ok(!logged.some((l) => l.includes('[reset-otp]')));

		process.env.NODE_ENV = 'development';
		otps.delete('U1');
		await svc.requestOtp('a@bv.vn');
		await new Promise((r) => setImmediate(r));
		assert.ok(logged.some((l) => l.includes('[reset-otp]')));
	} finally {
		logger.info = originalInfo;
		process.env.NODE_ENV = originalEnv;
		mailService.isEnabled = async () => true;
	}
});
