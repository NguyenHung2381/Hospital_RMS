// Hạn dùng mật khẩu tạm (permissions/tempPasswordPolicy.js):
//   - quá TEMP_PASSWORD_TTL_DAYS ngày mà chưa đổi ⇒ đăng nhập bị từ chối, kể cả
//     khi đúng mật khẩu; sai mật khẩu vẫn trả lỗi chung (không lộ trạng thái);
//   - phiên đang mở (access token / refresh token) cũng bị chặn;
//   - tự đổi mật khẩu thì xóa mốc; quản trị đặt lại thì tính hạn lại từ đầu.
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { install } = require('./fakeDb');

const DAY = 24 * 60 * 60 * 1000;
const HASH = bcrypt.hashSync('nva_0001', 4);
const base = {
	password: HASH,
	is_active: 1,
	role_id: null,
	totp_enabled: 0,
	failed_login_count: 0,
	locked_until: null,
	token_version: 0,
};
const USERS = {
	fresh: {
		...base,
		id: 'U1',
		username: 'fresh',
		must_change_password: 1,
		temp_password_issued_at: new Date(Date.now() - 2 * DAY),
	},
	stale: {
		...base,
		id: 'U2',
		username: 'stale',
		must_change_password: 1,
		temp_password_issued_at: new Date(Date.now() - 8 * DAY),
	},
	changed: {
		...base,
		id: 'U3',
		username: 'changed',
		must_change_password: 0,
		temp_password_issued_at: null,
	},
};
const byId = Object.fromEntries(Object.values(USERS).map((u) => [u.id, u]));

let ttlSetting; // giá trị Cấu hình hệ thống TEMP_PASSWORD_TTL_DAYS (undefined = mặc định)
const log = install(async (text, inputs) => {
	if (/WHERE u\.username = @login/.test(text))
		return USERS[inputs.login] ? [USERS[inputs.login]] : [];
	if (/SELECT failed_login_count, locked_until FROM users/.test(text)) return [byId[inputs.id]];
	if (/COUNT\(\*\) AS locks/.test(text)) return [{ locks: 0 }];
	if (/old\.failed_login_count/.test(text)) return [{ prev_count: 0, locked_until: null }];
	if (/SELECT token_version/.test(text)) return [{ token_version: 0 }];
	if (/SELECT id, username, password, failed_login_count, locked_until FROM users/.test(text))
		return [byId[inputs.id]];
	if (/SELECT \* FROM users WHERE id = @id/.test(text)) return [byId[inputs.id]];
	if (/SELECT username FROM users WHERE id=@id/.test(text)) return [byId[inputs.id]];
	return [];
});
const events = [];
require('../../src/modules/audit/securityEventService').log = async (e) => events.push(e);
require('../../src/modules/settings/systemSettingService').getValue = async (key) =>
	key === 'TEMP_PASSWORD_TTL_DAYS' ? ttlSetting : undefined;

const policy = require('../../src/permissions/tempPasswordPolicy');
const authService = require('../../src/modules/auth/authService');
const { verifySession } = require('../../src/middlewares/auth');
const userStatusCache = require('../../src/permissions/userStatusCache');

const rejectsWith = (p, status, msgRe) =>
	assert.rejects(p, (e) => e.statusCode === status && (!msgRe || msgRe.test(e.message)));

test('TEMP_PASSWORD_TTL_DAYS: mặc định 7, 0 = không giới hạn, giá trị sai ⇒ mặc định', () => {
	assert.equal(policy.parseTtlDays(undefined), 7);
	assert.equal(policy.parseTtlDays(''), 7);
	assert.equal(policy.parseTtlDays('3'), 3);
	assert.equal(policy.parseTtlDays('0'), 0);
	assert.equal(policy.parseTtlDays('-1'), 7);
	assert.equal(policy.parseTtlDays('abc'), 7);
	assert.equal(policy.deadlineOf(new Date(0), 0), null);
	assert.equal(policy.validateSetting('TEMP_PASSWORD_TTL_DAYS', '14'), null);
	assert.equal(policy.validateSetting('TEMP_PASSWORD_TTL_DAYS', ''), null);
	assert.match(policy.validateSetting('TEMP_PASSWORD_TTL_DAYS', '2.5'), /số nguyên/);
	assert.match(policy.validateSetting('TEMP_PASSWORD_TTL_DAYS', '1000'), /số nguyên/);
	assert.equal(policy.validateSetting('OTHER_KEY', 'x'), null);
});

test('mật khẩu tạm còn hạn: đăng nhập được (vẫn bắt đổi mật khẩu)', async () => {
	ttlSetting = undefined;
	const r = await authService.login('fresh', 'nva_0001');
	assert.equal(r.user.must_change_password, true);
});

test('mật khẩu tạm quá hạn: đúng mật khẩu vẫn bị từ chối + ghi sự kiện bảo mật', async () => {
	ttlSetting = undefined;
	events.length = 0;
	await rejectsWith(authService.login('stale', 'nva_0001'), 403, /Mật khẩu tạm đã hết hạn/);
	assert.ok(
		events.some((e) => e.eventType === 'login_temp_password_expired' && e.targetId === 'U2'),
	);
});

test('mật khẩu tạm quá hạn mà nhập SAI mật khẩu: lỗi chung, không lộ trạng thái hết hạn', async () => {
	ttlSetting = undefined;
	await rejectsWith(authService.login('stale', 'Sai#matkhau1'), 401, /không đúng/);
});

test('hạn dùng đổi theo Cấu hình hệ thống; 0 = không giới hạn', async () => {
	ttlSetting = '10';
	await authService.login('stale', 'nva_0001');
	ttlSetting = '1';
	await rejectsWith(authService.login('fresh', 'nva_0001'), 403, /hết hạn/);
	ttlSetting = '0';
	await authService.login('stale', 'nva_0001');
});

test('phiên đang mở bằng mật khẩu tạm quá hạn bị chặn', async () => {
	ttlSetting = undefined;
	const status = (u) => ({
		isActive: true,
		tokenVersion: 0,
		accountExpiresAt: null,
		mustChangePassword: !!u.must_change_password,
		tempPasswordIssuedAt: u.temp_password_issued_at,
	});
	const original = userStatusCache.load;
	userStatusCache.load = async (id) => status(byId[id]);
	try {
		assert.match((await verifySession('U2', 0)).error, /hết hạn/);
		assert.equal((await verifySession('U1', 0)).error, undefined);
		// Đã tự đổi mật khẩu: mốc cũ (nếu còn sót) không còn tác dụng
		userStatusCache.load = async () => ({
			...status(USERS.stale),
			mustChangePassword: false,
		});
		assert.equal((await verifySession('U2', 0)).error, undefined);
	} finally {
		userStatusCache.load = original;
	}
});

test('tự đổi mật khẩu xóa mốc mật khẩu tạm', async () => {
	const before = log.length;
	await authService.changePassword('U3', 'nva_0001', 'Moi#matkhau2027');
	assert.ok(
		log
			.slice(before)
			.some((q) => /must_change_password = 'false',\s*temp_password_issued_at = NULL/.test(q.text)),
	);
});

test('quản trị đặt lại mật khẩu: tính hạn mật khẩu tạm lại từ đầu', async () => {
	const userService = require('../../src/modules/users/userService');
	const before = log.length;
	await userService.resetPassword('U2', null, 'ADMIN');
	assert.ok(
		log
			.slice(before)
			.some((q) =>
				/must_change_password = 'true',\s*temp_password_issued_at=\(now\(\) AT TIME ZONE 'UTC'\)/.test(
					q.text,
				),
			),
	);
});
