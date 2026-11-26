// Rà bảo mật 2026-11-26 (phiên security) — S-09: tự đổi mật khẩu và tự đặt lại mật khẩu
// bằng OTP thành công không ghi security_events (chỉ lần sai và lần admin đặt lại có ghi) —
// dấu hiệu chiếm tài khoản qua hộp thư không hiện ở Nhật ký bảo mật.
// Sau sửa: ghi 'password_changed' / 'password_reset_self' kèm người thao tác + IP.
const os = require('os');
const path = require('path');
const fs = require('fs');
process.env.SECRETS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-pw-events-'));
process.env.JWT_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const USER = { id: 'U1', username: 'NVA_0001', full_name: 'A', email: 'a@bv.vn' };
let otpHash = null;
const log = install(async (text, inputs) => {
	if (/WHERE username = @login/.test(text)) return [USER];
	if (/UPDATE password_reset_otps SET attempts = attempts \+ 1/.test(text))
		return otpHash ? [{ id: inputs.id, code_hash: otpHash }] : [];
	if (/FROM security_events/.test(text)) return [{ n: 0 }];
	if (/SELECT \* FROM users WHERE id = @id/.test(text)) return [USER];
	return [];
});

// Các phụ thuộc authService destructure lúc nạp ⇒ thay TRƯỚC khi require
require('../../src/modules/settings/systemSettingService').getValue = async () => 'true';
require('../../src/modules/auth/sessionVersion').bumpTokenVersion = async () => {};
const cred = require('../../src/modules/auth/credentialService');
cred.assertPassword = async () => {};
cred.hashPassword = async () => 'hashed';
require('../../src/modules/auth/sessionTokenService').signSession = async () => ({
	accessToken: 'a',
	refreshToken: 'r',
});

const secretBox = require('../../src/utils/secretBox');
const passwordReset = require('../../src/modules/auth/passwordResetService');
const authService = require('../../src/modules/auth/authService');

const eventsSince = (n) =>
	log
		.slice(n)
		.filter((e) => /INSERT INTO security_events/.test(e.text))
		.map((e) => e.inputs);

test('S-09: tự đặt lại mật khẩu bằng OTP thành công ⇒ security_events password_reset_self (actor, IP)', async () => {
	otpHash = secretBox.keyedHash('123456');
	const n = log.length;
	await passwordReset.resetPassword('NVA_0001', '123456', 'Matkhau#2026x', '10.0.0.9');
	const ev = eventsSince(n).find((e) => e.event_type === 'password_reset_self');
	assert.ok(ev, 'phải ghi password_reset_self');
	assert.equal(ev.actor_id, 'U1');
	assert.equal(ev.target_id, 'U1');
	assert.equal(ev.ip_address, '10.0.0.9');
});

test('S-09: tự đổi mật khẩu thành công ⇒ security_events password_changed (actor, IP)', async () => {
	const n = log.length;
	await authService.changePassword('U1', 'Cu#2026abcd', 'Moi#2026abcd', '10.0.0.8', 'UA');
	const ev = eventsSince(n).find((e) => e.event_type === 'password_changed');
	assert.ok(ev, 'phải ghi password_changed');
	assert.equal(ev.actor_id, 'U1');
	assert.equal(ev.ip_address, '10.0.0.8');
});

test('S-09: sai mã OTP không ghi password_reset_self', async () => {
	otpHash = secretBox.keyedHash('999999');
	const n = log.length;
	await assert.rejects(passwordReset.resetPassword('NVA_0001', '123456', 'Matkhau#2026x', 'x'));
	assert.equal(
		eventsSince(n).some((e) => e.event_type === 'password_reset_self'),
		false,
	);
});
