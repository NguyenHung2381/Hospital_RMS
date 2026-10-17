// Chốt chặn leo thang quyền (modules/access/privilegeGuard.js) — quyền của vai trò
// đích lấy từ permissionCache, ở đây thay bằng dữ liệu giả (không cần DB).
const test = require('node:test');
const assert = require('node:assert/strict');
const permCache = require('../../src/middlewares/permissionCache');

const perms = (grants) => ({
	keys: new Set(Object.keys(grants)),
	scopes: new Map(Object.entries(grants).filter(([, s]) => s)),
});
const ROLES = {
	ADMIN: perms({ 'system:manage': null }),
	QLKH: perms({ 'roles:manage': null, 'users:read': 'all', 'users:update': 'all', 'topics:read': 'all' }),
	TK: perms({ 'users:read': 'department', 'users:update': 'department', 'topics:read': 'department' }),
	MEM: perms({ 'topics:read': 'own' }),
	DEPTVIEW: perms({ 'topics:read': 'department' }),
};
permCache.load = async (id) => ROLES[id] ?? perms({});
const g = require('../../src/modules/access/privilegeGuard');

const actor = (role, dept = 'K1') => ({
	id: `u-${role}`,
	role_id: role,
	department_id: dept,
	permissions: ROLES[role].keys,
	permissionScopes: ROLES[role].scopes,
});
const G = (key, scope = null) => ({ key, scope });
const denied = (promiseOrFn) =>
	assert.rejects(async () => (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn), (e) => e.statusCode === 403);

test('không cấp được quyền / phạm vi mình không có', async () => {
	const q = actor('QLKH');
	const tk = actor('TK');
	await denied(() => g.assertCanChangeGrants(q, [], [G('system:manage')]));
	await denied(() => g.assertCanChangeGrants(q, [], [G('topics:approve', 'all')]));
	await denied(() => g.assertCanChangeGrants(q, [], [G('roles:delete')])); // manage ≠ wildcard
	await denied(() => g.assertCanChangeGrants(tk, [], [G('topics:read', 'all')]));
	await denied(() => g.assertCanChangeGrants(tk, [G('topics:read', 'own')], [G('topics:read', 'all')]));
	g.assertCanChangeGrants(q, [], [G('topics:read', 'all')]);
	g.assertCanChangeGrants(tk, [], [G('topics:read', 'own')]);
});

test('không gỡ được quyền nằm ngoài tầm của mình', async () => {
	await denied(() => g.assertCanChangeGrants(actor('TK'), [G('topics:approve', 'all')], []));
});

test('gán vai trò: không vượt quyền người gán, vai trò toàn quyền chỉ superuser gán', async () => {
	await denied(g.assertCanAssignRole(actor('QLKH'), 'ADMIN'));
	await g.assertCanAssignRole(actor('QLKH'), 'MEM');
	await g.assertCanAssignRole(actor('TK'), 'DEPTVIEW');
	await g.assertCanAssignRole(actor('ADMIN'), 'ADMIN');
});

test('thao tác trên tài khoản: cùng khoa (nếu bị giới hạn) và không cao quyền hơn', async () => {
	await denied(g.assertCanManageUser(actor('TK'), { department_id: 'K1', role_id: 'QLKH' }));
	await denied(g.assertCanManageUser(actor('TK'), { department_id: 'K2', role_id: 'MEM' }));
	await g.assertCanManageUser(actor('TK'), { department_id: 'K1', role_id: 'MEM' });
	await g.assertCanManageUser(actor('QLKH'), { department_id: 'K2', role_id: 'MEM' });
	await denied(g.assertCanManageUser(actor('QLKH'), { department_id: 'K1', role_id: 'ADMIN' }));
});

test('sửa vai trò: không sửa vai trò của mình, vai trò toàn quyền hay vai trò cao quyền hơn', async () => {
	await denied(g.assertCanEditRole(actor('QLKH'), 'QLKH'));
	await denied(g.assertCanEditRole(actor('QLKH'), 'ADMIN'));
	await denied(g.assertCanEditRole(actor('TK'), 'QLKH'));
	await g.assertCanEditRole(actor('QLKH'), 'MEM');
	await g.assertCanEditRole(actor('ADMIN'), 'ADMIN');
});
