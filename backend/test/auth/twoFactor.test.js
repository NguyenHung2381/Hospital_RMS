// 2FA (authService) với CSDL giả: chống dùng lại mã TOTP, mã khôi phục dùng
// 1 lần, pre-auth token chỉ đổi được 1 phiên, secret TOTP lưu mã hoá.
const os = require('os');
const path = require('path');
const fs = require('fs');
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.SECRETS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-2fa-'));
delete process.env.TOTP_ENC_KEY;

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const otplib = require('otplib');
const { install } = require('./fakeDb');
const secretBox = require('../../src/utils/secretBox');
const { signToken } = require('../../src/utils/keys');

const user = {
	id: 'U1', username: 'nva', is_active: 1, role_id: null, totp_enabled: 1, totp_secret: null,
	totp_last_step: null, failed_login_count: 0, locked_until: null, token_version: 0,
};
let backup = []; // { hash, used }

install(async (text, inputs) => {
	if (/WHERE u\.id = @id/.test(text) && /totp_secret/.test(text)) return [user];
	if (/SELECT id, totp_secret, totp_enabled FROM users/.test(text)) return [user];
	if (/SELECT totp_enabled FROM users/.test(text)) return [user];
	if (/SET totp_last_step = @step/.test(text)) {
		const ok = user.totp_last_step === null || user.totp_last_step < inputs.step;
		if (ok) user.totp_last_step = inputs.step;
		return [{ n: ok ? 1 : 0 }];
	}
	if (/UPDATE users SET totp_secret = @secret WHERE id = @id/.test(text)) {
		user.totp_secret = inputs.secret;
		return [];
	}
	if (/UPDATE users SET totp_enabled = 1/.test(text)) {
		user.totp_enabled = 1;
		return [];
	}
	if (/DELETE FROM user_backup_codes WHERE user_id = @user_id;/.test(text)) {
		backup = Object.keys(inputs).filter((k) => /^h\d+$/.test(k)).map((k) => ({ hash: inputs[k], used: false }));
		return [];
	}
	if (/UPDATE user_backup_codes SET used_at/.test(text)) {
		const b = backup.find((x) => x.hash === inputs.hash && !x.used);
		if (!b) return [];
		b.used = true;
		return [{ id: 1 }];
	}
	if (/SELECT COUNT\(\*\) AS n FROM user_backup_codes/.test(text)) return [{ n: backup.filter((b) => !b.used).length }];
	if (/COUNT\(\*\) AS locks/.test(text)) return [{ locks: 0 }];
	if (/OUTPUT DELETED\.failed_login_count/.test(text)) return [{ prev_count: 0, locked_until: null }];
	if (/SELECT token_version FROM users/.test(text)) return [{ token_version: 0 }];
	if (/EXEC sp_create_refresh_token/.test(text)) return [{ id: `RT${crypto.randomUUID()}` }];
	return [];
});
require('../../src/modules/audit/securityEventService').log = async () => {};
const authService = require('../../src/modules/auth/authService');

const preAuth = () => signToken('pre-auth-2fa', { id: 'U1', rm: 0, jti: crypto.randomUUID() }, '5m');
const setSecret = async (stored) => {
	user.totp_secret = stored;
	user.totp_last_step = null;
};

test('secretBox: mã hoá/giải mã, phát hiện dữ liệu bị sửa, đọc được giá trị cũ chưa mã hoá', () => {
	const enc = secretBox.encrypt('JBSWY3DPEHPK3PXP');
	assert.ok(secretBox.isEncrypted(enc));
	assert.notEqual(enc, secretBox.encrypt('JBSWY3DPEHPK3PXP')); // IV ngẫu nhiên
	assert.equal(secretBox.decrypt(enc), 'JBSWY3DPEHPK3PXP');
	const tampered = enc.slice(0, -4) + (enc.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
	assert.throws(() => secretBox.decrypt(tampered));
	assert.equal(secretBox.decrypt('PLAINLEGACY'), 'PLAINLEGACY');
	assert.ok(fs.existsSync(path.join(process.env.SECRETS_DIR, 'totp.key')));
});

test('mã TOTP đúng đăng nhập được; dùng lại đúng mã đó (phiên mới) bị từ chối', async () => {
	const secret = await otplib.generateSecret();
	await setSecret(secretBox.encrypt(secret));
	const code = await otplib.generate({ secret, type: 'totp' });
	const r = await authService.verify2FALogin(preAuth(), code);
	assert.ok(r.access_token);
	await assert.rejects(authService.verify2FALogin(preAuth(), code), (e) => e.statusCode === 401);
});

test('secret cũ chưa mã hoá: đăng nhập thành công thì được mã hoá lại', async () => {
	const secret = await otplib.generateSecret();
	await setSecret(secret);
	await authService.verify2FALogin(preAuth(), await otplib.generate({ secret, type: 'totp' }));
	assert.ok(secretBox.isEncrypted(user.totp_secret));
	assert.equal(secretBox.decrypt(user.totp_secret), secret);
});

test('bật 2FA trả 10 mã khôi phục; mỗi mã dùng được đúng 1 lần', async () => {
	const secret = await otplib.generateSecret();
	await setSecret(secretBox.encrypt(secret));
	user.totp_enabled = 0;
	const { backup_codes } = await authService.confirm2FASetup('U1', await otplib.generate({ secret, type: 'totp' }));
	assert.equal(backup_codes.length, 10);
	assert.equal(new Set(backup_codes).size, 10);
	assert.ok(backup.every((b) => !backup_codes.includes(b.hash))); // không lưu mã gốc

	const r = await authService.verify2FALogin(preAuth(), backup_codes[0].toUpperCase()); // không phân biệt hoa thường
	assert.ok(r.access_token);
	await assert.rejects(authService.verify2FALogin(preAuth(), backup_codes[0]), (e) => e.statusCode === 401);
	assert.equal((await authService.get2FAStatus('U1')).backup_codes_remaining, 9);
});

test('pre-auth token chỉ đổi được 1 phiên đăng nhập', async () => {
	const secret = await otplib.generateSecret();
	await setSecret(secretBox.encrypt(secret));
	user.totp_enabled = 0;
	const codes = (await authService.confirm2FASetup('U1', await otplib.generate({ secret, type: 'totp' }))).backup_codes;
	const token = preAuth();
	await authService.verify2FALogin(token, codes[0]);
	await assert.rejects(authService.verify2FALogin(token, codes[1]), (e) => /hết hạn/.test(e.message));
});

test('mã sai định dạng / sai giá trị bị từ chối', async () => {
	await assert.rejects(authService.verify2FALogin(preAuth(), '000000'), (e) => e.statusCode === 401);
	await assert.rejects(authService.verify2FALogin(preAuth(), 'zzzz-zzzz'), (e) => e.statusCode === 401);
});

test('khoá mã hoá đã đổi: báo lỗi rõ ràng (409), không phải 500', async () => {
	const secret = await otplib.generateSecret();
	await setSecret(secretBox.encrypt(secret));
	process.env.TOTP_ENC_KEY = crypto.randomBytes(32).toString('hex');
	secretBox.reset();
	try {
		await assert.rejects(authService.verify2FALogin(preAuth(), '123456'), (e) => e.statusCode === 409);
	} finally {
		delete process.env.TOTP_ENC_KEY;
		secretBox.reset();
	}
});
