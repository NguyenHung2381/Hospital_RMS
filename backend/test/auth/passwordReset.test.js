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
		return [];
	}
	if (/SELECT user_id AS id, code_hash/.test(text)) {
		const o = otps.get(inputs.id);
		return o ? [{ id: inputs.id, ...o, alive: 1 }] : [];
	}
	return [];
});

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
	await assert.rejects(svc.resetPassword('a@bv.vn', '000000', 'Matkhau#2026x'), (e) => e.statusCode === 400);
	await assert.rejects(svc.resetPassword('a@bv.vn', '123456', 'nva_0001#Abc9'), (e) => /tên đăng nhập/.test(e.message));
	await svc.resetPassword('a@bv.vn', '123456', 'Matkhau#2026x');
	assert.ok(newPassword);
});
