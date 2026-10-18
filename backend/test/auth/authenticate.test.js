// middlewares/auth.js — kiểm tra phiên (token_version, purpose) và chặn API
// khi tài khoản bắt buộc đổi mật khẩu. userStatusCache/permCache thay bằng dữ
// liệu giả, không cần DB.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const userStatusCache = require('../../src/permissions/userStatusCache');
const permCache = require('../../src/permissions/permissionCache');

const STATUS = {
	active: {
		isActive: true,
		roleId: 'R1',
		departmentId: 'K1',
		accountExpiresAt: null,
		tokenVersion: 3,
		mustChangePassword: false,
	},
	mustChange: {
		isActive: true,
		roleId: 'R1',
		departmentId: 'K1',
		accountExpiresAt: null,
		tokenVersion: 0,
		mustChangePassword: true,
	},
	disabled: {
		isActive: false,
		roleId: 'R1',
		departmentId: null,
		accountExpiresAt: null,
		tokenVersion: 0,
		mustChangePassword: false,
	},
};
userStatusCache.load = async (id) => STATUS[id];
permCache.load = async () => ({ keys: new Set(['topics:read']), scopes: new Map() });

const {
	authenticate,
	verifyAccessToken,
	PASSWORD_CHANGE_REQUIRED,
} = require('../../src/middlewares/auth');

const { signToken } = require('../../src/utils/keys');
const sign = (payload) => signToken('access', payload, '5m');

const run = (token, url = '/api/v1/topics') =>
	new Promise((resolve) => {
		const res = {
			statusCode: 200,
			status(c) {
				this.statusCode = c;
				return this;
			},
			json(body) {
				resolve({ status: this.statusCode, body, next: false });
			},
		};
		const req = { headers: token ? { authorization: `Bearer ${token}` } : {}, originalUrl: url };
		authenticate(req, res, (err) => resolve({ status: err ? 500 : 200, next: true, req }));
	});

test('token hợp lệ đi qua, nạp role/khoa từ DB', async () => {
	const r = await run(sign({ id: 'active', tv: 3 }));
	assert.equal(r.next, true);
	assert.equal(r.req.user.role_id, 'R1');
	assert.ok(r.req.user.permissions.has('topics:read'));
});

test('token_version lệch (đã đăng xuất mọi thiết bị) bị từ chối', async () => {
	const r = await run(sign({ id: 'active', tv: 2 }));
	assert.equal(r.status, 401);
});

test('token loại khác (pre-auth 2FA, captcha) hoặc ký bằng JWT_SECRET thô bị từ chối', async () => {
	assert.equal((await run(signToken('pre-auth-2fa', { id: 'active', tv: 3 }, '5m'))).status, 401);
	assert.equal(
		(await run(signToken('captcha', { id: 'active', tv: 3, answer: 7 }, '5m'))).status,
		401,
	);
	// Access token kiểu cũ (trước khi tách khoá theo mục đích)
	assert.equal((await run(jwt.sign({ id: 'active', tv: 3 }, process.env.JWT_SECRET))).status, 401);
});

test('tài khoản bị vô hiệu hoá bị từ chối', async () => {
	assert.equal((await run(sign({ id: 'disabled', tv: 0 }))).status, 401);
});

test('bắt buộc đổi mật khẩu: chặn API thường với mã PASSWORD_CHANGE_REQUIRED', async () => {
	const r = await run(sign({ id: 'mustChange', tv: 0 }), '/api/v1/topics?page=1');
	assert.equal(r.status, 403);
	assert.equal(r.body.code, PASSWORD_CHANGE_REQUIRED);
});

test('bắt buộc đổi mật khẩu: vẫn gọi được đổi mật khẩu / đăng xuất mọi thiết bị', async () => {
	for (const url of ['/api/v1/auth/change-password', '/api/v1/auth/logout-all']) {
		assert.equal((await run(sign({ id: 'mustChange', tv: 0 }), url)).next, true, url);
	}
});

test('verifyAccessToken (dùng cho SSE) áp cùng quy tắc token_version', async () => {
	assert.ok((await verifyAccessToken(sign({ id: 'active', tv: 1 }))).error);
	assert.ok((await verifyAccessToken(null)).error);
	assert.equal((await verifyAccessToken(sign({ id: 'active', tv: 3 }))).status.roleId, 'R1');
});
