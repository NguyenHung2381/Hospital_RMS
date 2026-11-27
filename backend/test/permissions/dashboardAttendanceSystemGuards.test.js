// Quyền yêu cầu ở từng route của dashboard / báo cáo, điểm danh học viên và các
// route hệ thống. Nạp app thật, đọc guard authorizePermission của route (không gọi
// handler, không cần DB). Đổi quyền có chủ đích ⇒ sửa bảng dưới.
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
	const full = p.startsWith('/health') ? p : `${API}${p}`;
	const r = routes.find((x) => x.method === method && x.path === full);
	assert.ok(r, `không có route ${method} ${p}`);
	return r;
};
const userWith = (...keys) => ({
	id: 'NV_TEST',
	role_id: 'VT_TEST',
	permissions: new Set(keys),
	permissionScopes: new Map(),
});
const NOBODY = userWith();
const ACTIONS = ['read', 'create', 'update', 'delete', 'manage', 'approve', 'roster', 'export'];

// [method, đường dẫn, các quyền — có MỘT trong số đó là đủ]; [] = chỉ cần đăng nhập
const EXPECT = [
	// Dashboard + trang Báo cáo: mọi thứ cần reports:read
	['GET', '/dashboard/stats', ['reports:read']],
	['GET', '/dashboard/overview', ['reports:read']],
	['POST', '/dashboard/export-stats', ['reports:read']],
	['GET', '/dashboard/training-stats', ['reports:read']],
	['GET', '/dashboard/seminar-stats', ['reports:read']],
	['GET', '/dashboard/training-report', ['reports:read']],
	['POST', '/dashboard/training-report-export', ['reports:read']],
	['GET', '/dashboard/seminar-report', ['reports:read']],
	['POST', '/dashboard/seminar-report-export', ['reports:read']],
	['POST', '/dashboard/cme-report-export', ['reports:read']],
	// Điểm danh học viên (quản trị)
	['GET', '/staff-attendance/', ['staff_attendance:read']],
	[
		'GET',
		'/staff-attendance/leave-requests',
		['staff_attendance:read', 'staff_attendance:approve'],
	],
	['PUT', '/staff-attendance/leave-requests/:id/review', ['staff_attendance:approve']],
	['GET', '/staff-attendance/shifts', ['staff_attendance:manage', 'staff_attendance:roster']],
	['POST', '/staff-attendance/shifts', ['staff_attendance:manage']],
	['PUT', '/staff-attendance/shifts/:id', ['staff_attendance:manage']],
	['DELETE', '/staff-attendance/shifts/:id', ['staff_attendance:manage']],
	['GET', '/staff-attendance/patterns', ['staff_attendance:manage', 'staff_attendance:roster']],
	['GET', '/staff-attendance/patterns/courses', ['staff_attendance:manage']],
	['POST', '/staff-attendance/patterns', ['staff_attendance:manage']],
	['PUT', '/staff-attendance/patterns/:id', ['staff_attendance:manage']],
	['DELETE', '/staff-attendance/patterns/:id', ['staff_attendance:manage']],
	['PUT', '/staff-attendance/patterns/:id/courses', ['staff_attendance:manage']],
	['GET', '/staff-attendance/roster', ['staff_attendance:roster']],
	['PUT', '/staff-attendance/roster', ['staff_attendance:roster']],
	// Học viên tự điểm danh / gửi đơn: chỉ cần đăng nhập (service lọc theo chính mình)
	['GET', '/me/attendance', []],
	['POST', '/me/attendance/check', []],
	['GET', '/me/attendance/leave-requests', []],
	['POST', '/me/attendance/leave-requests', []],
	['PATCH', '/me/attendance/leave-requests/:id/cancel', []],
	// Hệ thống
	['GET', '/modules/', []],
	['GET', '/modules/menus', []],
	['POST', '/excel/build', []],
	['POST', '/excel/parse', []],
];

for (const [method, p, perms] of EXPECT) {
	test(`${method} ${p}: ${perms.length ? perms.join(' | ') : 'chỉ cần đăng nhập'}`, () => {
		const r = find(method, p);
		assert.equal(r.auth, true, 'phải qua authenticate');
		if (!perms.length) {
			assert.equal(passesGuards(r, NOBODY), true);
			return;
		}
		assert.equal(passesGuards(r, NOBODY), false, 'không quyền ⇒ bị chặn');
		for (const k of perms) assert.equal(passesGuards(r, userWith(k)), true, `có ${k} ⇒ được vào`);
		// Mọi quyền khác của cùng module không thay được
		const [mod] = perms[0].split(':');
		const others = ACTIONS.map((a) => `${mod}:${a}`).filter((k) => !perms.includes(k));
		assert.equal(passesGuards(r, userWith(...others)), false, `chỉ ${perms.join(' | ')} mới đủ`);
	});
}

test('route công khai (trình duyệt / giám sát gọi không kèm token): /health, /health/db, /csp-report', () => {
	for (const [m, p] of [
		['GET', '/health/'],
		['GET', '/health/db'],
		['POST', '/csp-report/'],
	])
		assert.equal(find(m, p).auth, false, `${m} ${p}`);
});
