// Ma trận phân quyền: vai trò mẫu × route. Nạp app thật, chạy đúng các guard
// authorizePermission của từng route (không gọi handler, không cần DB).
//
// Vai trò mẫu = fixtures/role-templates.json (ảnh chụp quyền của 8 vai trò hệ
// thống). Đổi quyền của vai trò mẫu có chủ đích → cập nhật fixture + bảng
// EXPECT bên dưới trong cùng commit — bảng này chính là đặc tả chính sách.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
// Không có .env (CI) thì điền giá trị giữ chỗ — app.js dừng nếu thiếu biến bắt buộc
require('../../scripts/lib/static-check-env');

const app = require('../../src/app');
const { hasPermission } = require('../../src/middlewares/auth');
const { isKnownKey } = require('../../src/permissions/catalog');
const { listRoutes, passesGuards } = require('../../src/permissions/routeWalker');
const policy = require('../../src/permissions/routePolicy');
const TEMPLATES = require('./fixtures/role-templates.json');

const API = '/api/v1';
const routes = listRoutes(app);
const route = (method, p) => {
	const r = routes.find((x) => x.method === method && x.path === p);
	assert.ok(r, `không có route ${method} ${p}`);
	return r;
};
const userOf = (code) => {
	const t = TEMPLATES[code];
	assert.ok(t, `không có vai trò mẫu "${code}"`);
	const keys = new Set(Object.keys(t.grants));
	if (t.superuser) keys.add('system:manage');
	return {
		id: `test-${code}`,
		role_id: t.id,
		permissions: keys,
		permissionScopes: new Map(Object.entries(t.grants).filter(([, s]) => s)),
	};
};

// [method, đường dẫn, vai trò ĐƯỢC phép, vai trò BỊ CHẶN]
const EXPECT = [
	// Quản lý tài khoản
	[
		'GET',
		`${API}/users/`,
		['admin', 'director', 'research_manager', 'dept_head'],
		['member', 'topic_leader', 'trainee', 'review_council'],
	],
	[
		'POST',
		`${API}/users/`,
		['admin', 'research_manager'],
		['director', 'dept_head', 'member', 'trainee'],
	],
	['PUT', `${API}/users/:id`, ['admin', 'research_manager'], ['director', 'dept_head', 'member']],
	[
		'POST',
		`${API}/users/:id/reset-password`,
		['admin', 'research_manager'],
		['director', 'dept_head', 'member', 'trainee'],
	],
	[
		'DELETE',
		`${API}/users/:id`,
		['admin'],
		['research_manager', 'director', 'dept_head', 'member'],
	],
	// Vai trò & phân quyền — chỉ quản trị hệ thống
	[
		'GET',
		`${API}/roles`,
		['admin', 'director', 'research_manager'],
		['member', 'dept_head', 'trainee'],
	],
	[
		'GET',
		`${API}/permissions/catalog`,
		['admin', 'director', 'research_manager'],
		['member', 'dept_head'],
	],
	[
		'PUT',
		`${API}/roles/:id/permissions`,
		['admin'],
		['research_manager', 'director', 'dept_head', 'member'],
	],
	['POST', `${API}/roles/:id/clone`, ['admin'], ['research_manager', 'director']],
	['DELETE', `${API}/roles/:id`, ['admin'], ['research_manager', 'director']],
	// Đề tài
	[
		'POST',
		`${API}/topics/`,
		['admin', 'research_manager', 'topic_leader'],
		['member', 'dept_head', 'review_council', 'trainee'],
	],
	[
		'POST',
		`${API}/topics/:id/approve`,
		['admin', 'director', 'review_council'],
		['research_manager', 'topic_leader', 'member', 'dept_head'],
	],
	// Đào tạo — quyền tách riêng ở giai đoạn 1
	[
		'GET',
		`${API}/exams/questions`,
		['admin', 'research_manager'],
		['member', 'trainee', 'dept_head'],
	],
	['GET', `${API}/cme-records/`, ['admin', 'research_manager'], ['director', 'member']],
	[
		'POST',
		`${API}/trainees/grant-accounts`,
		['admin', 'research_manager'],
		['dept_head', 'director', 'member'],
	],
	// Hệ thống
	[
		'GET',
		`${API}/activity-logs/`,
		['admin', 'director', 'research_manager'],
		['member', 'dept_head', 'trainee'],
	],
	['GET', `${API}/security-events/`, ['admin'], ['research_manager', 'director']],
	['GET', `${API}/system-settings/`, ['admin'], ['research_manager', 'director']],
	['POST', `${API}/persons/merge-candidates/:id/merge`, ['admin'], ['research_manager', 'member']],
	// Chỉ cần đăng nhập — ai cũng được (kiểm tra theo bản ghi ở service)
	['GET', `${API}/users/me`, ['admin', 'member', 'trainee', 'dept_head'], []],
	['GET', `${API}/exams/available`, ['trainee', 'member'], []],
];

for (const [method, p, allowed, denied] of EXPECT) {
	test(`${method} ${p}`, () => {
		const r = route(method, p);
		for (const code of allowed)
			assert.equal(passesGuards(r, userOf(code)), true, `${code} phải được phép`);
		for (const code of denied)
			assert.equal(passesGuards(r, userOf(code)), false, `${code} phải bị chặn`);
	});
}

test('mọi route đều khai báo phân quyền (authorizePermission hoặc routePolicy kèm lý do)', () => {
	const problems = [];
	for (const r of routes) {
		const id = `${r.method} ${r.path}`;
		for (const [res, act] of r.perms)
			if (!isKnownKey(`${res}:${act}`)) problems.push(`${id}: quyền lạ ${res}:${act}`);
		if (r.perms.length && !r.auth) problems.push(`${id}: có guard quyền nhưng thiếu authenticate`);
		if (!r.perms.length && r.auth && !policy.authOnly[id])
			problems.push(`${id}: chỉ cần đăng nhập nhưng chưa khai báo lý do`);
		if (!r.auth && !policy.public[id]) problems.push(`${id}: công khai nhưng chưa khai báo lý do`);
	}
	assert.deepEqual(problems, []);
});

test('guard của route và hasPermission cho cùng kết quả ở mọi vai trò mẫu', () => {
	const mismatches = [];
	for (const code of Object.keys(TEMPLATES)) {
		const u = userOf(code);
		for (const r of routes.filter((x) => x.guards.length)) {
			// Mỗi guard: có ÍT NHẤT MỘT cặp quyền; các guard nối tiếp: phải qua TẤT CẢ
			const expected = r.guards.every((g) =>
				g.permissionPairs.some(([res, act]) => hasPermission(u, res, act)),
			);
			if (passesGuards(r, u) !== expected) mismatches.push(`${code} ${r.method} ${r.path}`);
		}
	}
	assert.deepEqual(mismatches, []);
});

test('vai trò học viên không vào được route quản trị nào', () => {
	const u = userOf('trainee');
	const leaked = routes
		.filter((r) => r.guards.length && passesGuards(r, u))
		.map((r) => `${r.method} ${r.path}`);
	assert.deepEqual(leaked, []);
});
