// Bắt buộc 2FA cho tài khoản quản trị (permissions/twoFactorPolicy.js + chốt
// chặn trong middlewares/auth.js). userStatusCache / permCache / DB là dữ liệu giả.
process.env.JWT_SECRET = 'test-secret';
delete process.env.REQUIRE_2FA_FOR_ADMINS;
delete process.env.TWOFA_GRACE_DAYS;
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('./fakeDb');

const DAY = 24 * 60 * 60 * 1000;
const writes = [];
install(async (text, inputs) => {
	if (/SET twofa_required_since = SYSUTCDATETIME\(\)/.test(text)) {
		writes.push(inputs.id);
		return [{ twofa_required_since: new Date() }];
	}
	return [];
});

const base = {
	isActive: true,
	departmentId: 'K1',
	accountExpiresAt: null,
	tokenVersion: 0,
	mustChangePassword: false,
};
const STATUS = {
	adminOverdue: {
		...base,
		roleId: 'ADMIN',
		totpEnabled: false,
		twofaRequiredSince: new Date(Date.now() - 30 * DAY),
	},
	adminGrace: {
		...base,
		roleId: 'ADMIN',
		totpEnabled: false,
		twofaRequiredSince: new Date(Date.now() - 2 * DAY),
	},
	adminNew: { ...base, roleId: 'ADMIN', totpEnabled: false, twofaRequiredSince: null },
	adminWith2fa: {
		...base,
		roleId: 'ADMIN',
		totpEnabled: true,
		twofaRequiredSince: new Date(Date.now() - 30 * DAY),
	},
	superOverdue: {
		...base,
		roleId: 'SUPER',
		totpEnabled: false,
		twofaRequiredSince: new Date(Date.now() - 30 * DAY),
	},
	memberOverdue: {
		...base,
		roleId: 'MEM',
		totpEnabled: false,
		twofaRequiredSince: new Date(Date.now() - 30 * DAY),
	},
};
const PERMS = {
	ADMIN: new Set(['users:read', 'users:update']), // users:update là quyền critical
	SUPER: new Set(['system:manage']),
	MEM: new Set(['topics:read', 'users:read']),
};
require('../../src/permissions/userStatusCache').load = async (id) => STATUS[id];
require('../../src/permissions/userStatusCache').clear = () => {};
require('../../src/permissions/permissionCache').load = async (roleId) => ({
	keys: PERMS[roleId],
	scopes: new Map(),
});

const { authenticate, TWO_FACTOR_REQUIRED } = require('../../src/middlewares/auth');
const { signToken } = require('../../src/utils/keys');
const { twoFactorState } = require('../../src/permissions/twoFactorPolicy');

const run = (id, url = '/api/v1/topics') =>
	new Promise((resolve) => {
		const res = {
			statusCode: 200,
			status(c) {
				this.statusCode = c;
				return this;
			},
			json(body) {
				resolve({ status: this.statusCode, body });
			},
		};
		const token = signToken('access', { id, tv: 0 }, '5m');
		authenticate({ headers: { authorization: `Bearer ${token}` }, originalUrl: url }, res, () =>
			resolve({ status: 200, next: true }),
		);
	});

test('quản trị quá hạn chưa bật 2FA: chặn API thường, vẫn gọi được API bật 2FA', async () => {
	const r = await run('adminOverdue');
	assert.equal(r.status, 403);
	assert.equal(r.body.code, TWO_FACTOR_REQUIRED);
	for (const url of [
		'/api/v1/auth/2fa/setup',
		'/api/v1/auth/2fa/verify-setup',
		'/api/v1/auth/2fa/status',
	]) {
		assert.equal((await run('adminOverdue', url)).next, true, url);
	}
});

test('superuser quá hạn cũng bị chặn', async () => {
	assert.equal((await run('superOverdue')).status, 403);
});

test('còn trong thời gian chuyển tiếp: chưa chặn', async () => {
	assert.equal((await run('adminGrace')).next, true);
});

test('đã bật 2FA, hoặc vai trò không có quyền critical: không bị chặn', async () => {
	assert.equal((await run('adminWith2fa')).next, true);
	assert.equal((await run('memberOverdue')).next, true);
});

test('lần đầu thuộc diện: ghi mốc bắt đầu, trạng thái grace với hạn 14 ngày', async () => {
	const s = await twoFactorState(
		{ userId: 'adminNew', totpEnabled: false, requiredSince: null },
		PERMS.ADMIN,
	);
	assert.equal(s.state, 'grace');
	assert.ok(writes.includes('adminNew'));
	const days = (s.deadline.getTime() - Date.now()) / DAY;
	assert.ok(days > 13.9 && days <= 14);
});

test('TWOFA_GRACE_DAYS và REQUIRE_2FA_FOR_ADMINS=false', async () => {
	process.env.TWOFA_GRACE_DAYS = '60';
	assert.equal((await run('adminOverdue')).next, true); // 30 ngày < 60
	process.env.TWOFA_GRACE_DAYS = '14';
	process.env.REQUIRE_2FA_FOR_ADMINS = 'false';
	assert.equal((await run('adminOverdue')).next, true);
	delete process.env.REQUIRE_2FA_FOR_ADMINS;
});
