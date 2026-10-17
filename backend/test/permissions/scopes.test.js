// Quy tắc kiểm tra quyền + phạm vi (middlewares/auth.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { hasPermission, scopeOf, isDeadlineBound } = require('../../src/middlewares/auth');

const user = (grants) => ({
	permissions: new Set(Object.keys(grants)),
	permissionScopes: new Map(Object.entries(grants).filter(([, s]) => s)),
});

test('phải có ĐÚNG quyền — "manage" không còn là wildcard', () => {
	const u = user({ 'roles:manage': null, 'topics:read': 'own' });
	assert.equal(hasPermission(u, 'roles', 'manage'), true);
	assert.equal(hasPermission(u, 'roles', 'delete'), false);
	assert.equal(hasPermission(u, 'topics', 'update'), false);
	assert.equal(hasPermission(null, 'topics', 'read'), false);
});

test('superuser (system:manage) được mọi quyền, phạm vi toàn viện', () => {
	const su = user({ 'system:manage': null });
	assert.equal(hasPermission(su, 'anything', 'delete'), true);
	assert.equal(scopeOf(su, 'topics'), 'all');
	assert.equal(scopeOf(su, 'users'), 'all');
});

test('scopeOf: ưu tiên phạm vi của quyền Xem, không có thì rộng nhất trong resource', () => {
	assert.equal(scopeOf(user({ 'topics:read': 'department', 'topics:update': 'own' }), 'topics'), 'department');
	assert.equal(scopeOf(user({ 'topics:create': 'own', 'topics:update': 'department' }), 'topics'), 'department');
	assert.equal(scopeOf(user({ 'rounds:read': null }), 'topics'), null);
});

test('isDeadlineBound: chỉ thấy đề tài của mình (hoặc không có quyền đề tài) ⇒ bị chặn theo mốc thời gian', () => {
	assert.equal(isDeadlineBound(user({ 'topics:read': 'own' })), true);
	assert.equal(isDeadlineBound(user({})), true);
	assert.equal(isDeadlineBound(user({ 'topics:read': 'department' })), false);
});
