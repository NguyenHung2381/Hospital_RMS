// modules/auth/authService.js với CSDL giả (test/auth/fakeDb.js):
//   - chống dò tài khoản: sai username / sai mật khẩu / TK bị khóa mà sai mật
//     khẩu đều trả cùng một lỗi;
//   - /2fa/setup không được dùng để tắt 2FA đang bật (chỉ cần access token);
//   - đổi mật khẩu phải khác mật khẩu cũ và gỡ cờ bắt buộc đổi.
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { install } = require('./fakeDb');

const HASH = bcrypt.hashSync('Dung#matkhau2026', 4);
const USERS = {
	active: {
		id: 'U1',
		username: 'active',
		email: 'active@bv.vn',
		password: HASH,
		is_active: 1,
		role_id: null,
		totp_enabled: 0,
		failed_login_count: 0,
		locked_until: null,
	},
	disabled: {
		id: 'U2',
		username: 'disabled',
		email: 'chung@bv.vn',
		password: HASH,
		is_active: 0,
		role_id: null,
		totp_enabled: 0,
		failed_login_count: 0,
		locked_until: null,
	},
	twofa: {
		id: 'U3',
		username: 'twofa',
		email: 'chung@bv.vn',
		password: HASH,
		is_active: 1,
		totp_enabled: 1,
	},
	// Đã có lượt sai (mật khẩu / mã 2FA) trước đó
	twofa_failed: {
		id: 'U4',
		username: 'twofa_failed',
		email: 'twofa_failed@bv.vn',
		password: HASH,
		is_active: 1,
		totp_enabled: 1,
		failed_login_count: 3,
		locked_until: null,
	},
};
const byId = Object.fromEntries(Object.values(USERS).map((u) => [u.id, u]));

const log = install(async (text, inputs) => {
	if (/WHERE u\.username = @login/.test(text))
		return USERS[inputs.login] ? [USERS[inputs.login]] : [];
	if (/WHERE u\.email = @login/.test(text))
		return Object.values(USERS).filter((u) => u.email === inputs.login);
	if (/SELECT username, totp_enabled FROM users/.test(text)) return [byId[inputs.id]];
	if (/SELECT id, username, password, failed_login_count, locked_until FROM users/.test(text))
		return [byId[inputs.id]];
	if (/SELECT failed_login_count, locked_until FROM users/.test(text)) return [byId[inputs.id]];
	if (/COUNT\(\*\) AS locks/.test(text)) return [{ locks: 0 }];
	if (/old\.failed_login_count/.test(text)) return [{ prev_count: 0, locked_until: null }];
	if (/SELECT token_version/.test(text)) return [{ token_version: 0 }];
	if (/SELECT \* FROM users WHERE id = @id/.test(text)) return [byId[inputs.id]];
	return [];
});
require('../../src/modules/audit/securityEventService').log = async () => {};
const authService = require('../../src/modules/auth/authService');
const twoFactorService = require('../../src/modules/auth/twoFactorService');

const rejectsWith = async (p, status, msgRe) => {
	await assert.rejects(p, (e) => e.statusCode === status && (!msgRe || msgRe.test(e.message)));
};

test('sai username và sai mật khẩu trả cùng một lỗi 401', async () => {
	const a = await authService.login('khong_ton_tai', 'Sai#matkhau1').catch((e) => e);
	const b = await authService.login('active', 'Sai#matkhau2').catch((e) => e);
	assert.equal(a.statusCode, 401);
	assert.deepEqual({ s: a.statusCode, m: a.message }, { s: b.statusCode, m: b.message });
});

test('đăng nhập bằng email; email dùng chung nhiều tài khoản → lỗi chung 401', async () => {
	const ok = await authService.login('active@bv.vn', 'Dung#matkhau2026');
	assert.equal(ok.user?.username, 'active');
	await rejectsWith(authService.login('chung@bv.vn', 'Dung#matkhau2026'), 401, /không đúng/);
});

test('tài khoản bị vô hiệu hóa: sai mật khẩu → lỗi chung, đúng mật khẩu → mới báo vô hiệu hóa', async () => {
	await rejectsWith(authService.login('disabled', 'Sai#matkhau3'), 401, /không đúng/);
	await rejectsWith(authService.login('disabled', 'Dung#matkhau2026'), 403, /vô hiệu hóa/);
});

test('TK bật 2FA: đúng mật khẩu KHÔNG xóa bộ đếm sai (chặn dò mã 2FA bằng cách đăng nhập lại)', async () => {
	const before = log.length;
	const r = await authService.login('twofa_failed', 'Dung#matkhau2026');
	assert.equal(r.requires_2fa, true);
	assert.ok(!r.access_token);
	assert.ok(
		!log.slice(before).some((q) => /SET failed_login_count = 0/.test(q.text)),
		'bộ đếm chỉ được xóa sau khi qua bước mã 2FA',
	);
});

test('TK không bật 2FA: đúng mật khẩu thì xóa bộ đếm sai', async () => {
	USERS.active.failed_login_count = 2;
	const before = log.length;
	await authService.login('active', 'Dung#matkhau2026');
	USERS.active.failed_login_count = 0;
	assert.ok(log.slice(before).some((q) => /SET failed_login_count = 0/.test(q.text)));
});

test('/2fa/setup bị từ chối khi 2FA đang bật (không ghi đè secret)', async () => {
	const before = log.length;
	await rejectsWith(twoFactorService.setup2FA('U3'), 409);
	assert.ok(!log.slice(before).some((q) => /UPDATE users SET totp_secret/.test(q.text)));
});

test('đổi mật khẩu: mới trùng cũ bị từ chối; hợp lệ thì gỡ must_change_password', async () => {
	await rejectsWith(
		authService.changePassword('U1', 'Dung#matkhau2026', 'Dung#matkhau2026'),
		400,
		/khác/,
	);
	const before = log.length;
	await authService.changePassword('U1', 'Dung#matkhau2026', 'Moi#matkhau2027');
	assert.ok(log.slice(before).some((q) => /must_change_password = 'false'/.test(q.text)));
});
