// Quyền yêu cầu ở từng route của các module ít test (khảo sát, đợt nghiên cứu,
// hội đồng, CCHN, danh mục). Nạp app thật, đọc guard authorizePermission của
// route (không gọi handler, không cần DB). Đổi quyền có chủ đích ⇒ sửa bảng dưới.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
require('../../scripts/lib/static-check-env');

const { listRoutes, passesGuards } = require('../../src/permissions/routeWalker');
const app = require('../../src/app');

const API = '/api/v1';
const routes = listRoutes(app);
const find = (method, p) => {
	const r = routes.find((x) => x.method === method && x.path === `${API}${p}`);
	assert.ok(r, `không có route ${method} ${p}`);
	return r;
};
// Người dùng chỉ có đúng các quyền liệt kê
const userWith = (...keys) => ({
	id: 'NV_TEST',
	role_id: 'VT_TEST',
	permissions: new Set(keys),
	permissionScopes: new Map(),
});
const NOBODY = userWith();

// [method, đường dẫn, quyền đủ để vào] — null = chỉ cần đăng nhập
const EXPECT = [
	// Khảo sát: người dùng thường trả lời; quản trị cần surveys:manage
	['GET', '/surveys/active', null],
	['GET', '/surveys/:id/respond', null],
	['POST', '/surveys/:id/respond', null],
	['GET', '/surveys/', 'surveys:manage'],
	['GET', '/surveys/:id', 'surveys:manage'],
	['GET', '/surveys/:id/results', 'surveys:manage'],
	['POST', '/surveys/', 'surveys:manage'],
	['PUT', '/surveys/:id', 'surveys:manage'],
	['DELETE', '/surveys/:id', 'surveys:manage'],
	// Đợt nghiên cứu + mốc thời hạn
	['GET', '/research-rounds', 'rounds:read'],
	['POST', '/research-rounds', 'rounds:create'],
	['PUT', '/research-rounds/:id', 'rounds:update'],
	['DELETE', '/research-rounds/:id', 'rounds:delete'],
	['GET', '/research-rounds/:id/deadlines', 'rounds:read'],
	['POST', '/research-rounds/:id/deadlines/:phase', 'rounds:update'],
	['DELETE', '/research-rounds/:id/deadlines/:phase', 'rounds:update'],
	// Hội đồng
	['GET', '/councils/', 'councils:read'],
	['POST', '/councils/auto-assign', 'councils:create'],
	['POST', '/councils/import-excel', 'councils:create'],
	['PUT', '/councils/:id', 'councils:update'],
	['DELETE', '/councils/:id', 'councils:delete'],
	['POST', '/councils/:id/members', 'councils:update'],
	['POST', '/councils/:id/topics', 'councils:update'],
	['PUT', '/councils/:id/topics/:topic_id/substitute', 'councils:update'],
	['GET', '/councils/:id/eligible-users', 'councils:read'],
	['GET', '/councils/my-progress', null], // lọc theo ghế của chính người dùng trong service
	['POST', '/external-reviewers', 'councils:create'],
	['DELETE', '/external-reviewers/:id', 'councils:delete'],
	// Chứng chỉ hành nghề
	['GET', '/staff-licenses/', 'staff_licenses:read'],
	['GET', '/staff-licenses/:id', 'staff_licenses:read'],
	['GET', '/staff-licenses/by-user/:userId', 'staff_licenses:read'],
	['POST', '/staff-licenses/', 'staff_licenses:create'],
	['POST', '/staff-licenses/import-excel', 'staff_licenses:update'],
	['PUT', '/staff-licenses/:id', 'staff_licenses:update'],
	['DELETE', '/staff-licenses/:id', 'staff_licenses:delete'],
	// Danh mục NCKH: đọc chỉ cần đăng nhập, ghi cần catalog:*
	['GET', '/categories', null],
	['POST', '/categories', 'catalog:create'],
	['PUT', '/categories/:id', 'catalog:update'],
	['DELETE', '/categories/:id', 'catalog:delete'],
	['POST', '/levels', 'catalog:create'],
	['DELETE', '/levels/:id', 'catalog:delete'],
	['POST', '/round-types', 'catalog:create'],
	['PUT', '/round-types/:id/levels', 'catalog:update'],
	['GET', '/departments', 'departments:read'],
	['GET', '/departments/:id', null], // routePolicy: danh mục dropdown
	['POST', '/departments', 'departments:create'],
	['PUT', '/departments/:id', 'departments:update'],
	['DELETE', '/departments/:id', 'departments:delete'],
	['POST', '/venues', 'venues:create'],
	['DELETE', '/venues/:id', 'venues:delete'],
];

for (const [method, p, perm] of EXPECT) {
	test(`${method} ${p}: ${perm ?? 'chỉ cần đăng nhập'}`, () => {
		const r = find(method, p);
		assert.equal(r.auth, true, 'phải qua authenticate');
		if (perm === null) {
			assert.equal(passesGuards(r, NOBODY), true);
			return;
		}
		assert.equal(passesGuards(r, NOBODY), false, 'không quyền ⇒ bị chặn');
		assert.equal(passesGuards(r, userWith(perm)), true, `có ${perm} ⇒ được vào`);
		// Quyền cùng module nhưng khác thao tác không thay được quyền cần
		const [mod] = perm.split(':');
		const others = ['read', 'create', 'update', 'delete', 'manage']
			.map((a) => `${mod}:${a}`)
			.filter((k) => k !== perm);
		assert.equal(passesGuards(r, userWith(...others)), false, `chỉ ${perm} mới đủ`);
	});
}

test('GET /staff-licenses/mentors: một trong staff_licenses:read / lecturers:read / courses:update', () => {
	const r = find('GET', '/staff-licenses/mentors');
	assert.equal(passesGuards(r, NOBODY), false);
	for (const k of ['staff_licenses:read', 'lecturers:read', 'courses:update'])
		assert.equal(passesGuards(r, userWith(k)), true, k);
	assert.equal(passesGuards(r, userWith('courses:read')), false);
});
