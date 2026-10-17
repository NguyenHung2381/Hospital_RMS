// Phạm vi khoa của chấm công / phân ca (staff_attendance): khoa trưởng, điều
// dưỡng trưởng chỉ thấy và xếp ca cho khoa mình; lượt cấp quyền có từ trước khi
// resource có phạm vi (scope NULL) giữ hiệu lực toàn viện, không bị thu hẹp.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

// Nhân viên theo khoa
const USERS = [
	{ id: 'U1', full_name: 'A', department_id: 'K1' },
	{ id: 'U2', full_name: 'B', department_id: 'K1' },
	{ id: 'U3', full_name: 'C', department_id: 'K2' },
];
// Lượt cấp quyền trong CSDL cho bài test migration (scope NULL = cấp trước khi có phạm vi)
const GRANTS = [
	{ role_id: 'VT1', resource: 'staff_attendance', action: 'read', scope: null },
	{ role_id: 'VT1', resource: 'staff_attendance', action: 'roster', scope: null },
	{ role_id: 'VT1', resource: 'staff_attendance', action: 'manage', scope: null },
	{ role_id: 'VT1', resource: 'topics', action: 'read', scope: null },
	{ role_id: 'VT2', resource: 'staff_attendance', action: 'roster', scope: 'department' },
];

const log = install(async (text, inputs) => {
	if (/COL_LENGTH\('role_permissions', 'scope'\)/.test(text)) return [{ len: 20 }];
	if (/SELECT id, resource, action FROM permissions/.test(text)) {
		return [...new Set(GRANTS.map((g) => `${g.resource}:${g.action}`))].map((k, i) => {
			const [resource, action] = k.split(':');
			return { id: `P${i}`, resource, action };
		});
	}
	if (/FROM role_permissions rp INNER JOIN permissions p/.test(text)) return GRANTS;
	if (/FROM users u LEFT JOIN departments d/.test(text)) {
		return USERS.filter((u) => !inputs.dept || u.department_id === inputs.dept);
	}
	if (/FROM OPENJSON\(@users\) j/.test(text)) {
		return JSON.parse(inputs.users)
			.filter((id) => !USERS.some((u) => u.id === id && u.department_id === inputs.dept))
			.map((id) => ({ id }));
	}
	if (/FROM work_shifts/.test(text)) return [{ id: 1, is_active: true }];
	return [];
});
require('../../src/services/eventService').broadcast = () => {};
const shiftService = require('../../src/services/shiftService');
const staffAttendanceService = require('../../src/services/staffAttendanceService');
const { RESOURCE_SCOPES, nullScopeFill, normalizeLegacy } = require('../../src/permissions/scopes');
const { migratePermissionScopes } = require('../../src/permissions/migrations');

const actor = (id, departmentId, grants) => ({
	id,
	department_id: departmentId,
	permissions: new Set(Object.keys(grants)),
	permissionScopes: new Map(Object.entries(grants).filter(([, s]) => s)),
});
const HEAD_K1 = actor('TK1', 'K1', { 'staff_attendance:read': 'department', 'staff_attendance:roster': 'department' });
const HR = actor('NS1', 'K9', { 'staff_attendance:read': 'all', 'staff_attendance:roster': 'all' });
// Lượt cấp cũ còn scope NULL (trước khi migration chạy) — không bị thu hẹp
const LEGACY = actor('NS2', 'K9', { 'staff_attendance:read': null, 'staff_attendance:roster': null });
const SU = actor('ADMIN', null, { 'system:manage': null });
const NO_DEPT = actor('TK0', null, { 'staff_attendance:roster': 'department', 'staff_attendance:read': 'department' });

const ROSTER = { from: '2026-11-01', to: '2026-11-07' };
const PUT = { dates: ['2026-11-02'], mode: 'off' };
const queriesSince = (n) => log.slice(n).map((q) => q.text);
const denied = (p) => assert.rejects(p, (e) => e.statusCode === 403);

test('staff_attendance có phạm vi Trong khoa / Toàn viện', () => {
	assert.deepEqual(RESOURCE_SCOPES.staff_attendance, ['department', 'all']);
});

test('lượt cấp scope NULL: staff_attendance giữ toàn viện, resource khác vẫn hẹp nhất', () => {
	assert.equal(nullScopeFill('staff_attendance'), 'all');
	assert.equal(nullScopeFill('topics'), 'own');
	assert.equal(nullScopeFill('users'), 'department');
	const { scopes } = normalizeLegacy(new Set(['staff_attendance:read', 'staff_attendance:roster', 'topics:read']));
	assert.equal(scopes.get('staff_attendance:read'), 'all');
	assert.equal(scopes.get('staff_attendance:roster'), 'all');
	assert.equal(scopes.get('topics:read'), 'own');
});

test('migration: lượt cấp staff_attendance hiện có (scope NULL) → all, không thành department', async () => {
	const report = await migratePermissionScopes({ dryRun: true });
	const vt1 = report.roles.find((r) => r.role_id === 'VT1');
	assert.deepEqual(vt1.scoped.sort(), [
		'staff_attendance:manage@all',
		'staff_attendance:read@all',
		'staff_attendance:roster@all',
		'topics:read@own',
	]);
	// Lượt cấp đã có phạm vi thì giữ nguyên
	assert.equal(report.roles.find((r) => r.role_id === 'VT2'), undefined);
});

test('getRoster phạm vi khoa: chỉ người khoa mình, bỏ qua department_id gửi lên', async () => {
	const own = await shiftService.getRoster(ROSTER, HEAD_K1);
	assert.deepEqual(own.users.map((u) => u.id), ['U1', 'U2']);
	const other = await shiftService.getRoster({ ...ROSTER, department_id: 'K2' }, HEAD_K1);
	assert.deepEqual(other.users.map((u) => u.id), ['U1', 'U2']);
	assert.deepEqual((await shiftService.getRoster(ROSTER, NO_DEPT)).users, []);
});

test('getRoster toàn viện / lượt cấp cũ / superuser: không đổi hành vi', async () => {
	for (const a of [HR, LEGACY, SU]) {
		assert.deepEqual((await shiftService.getRoster(ROSTER, a)).users.map((u) => u.id), ['U1', 'U2', 'U3']);
		assert.deepEqual((await shiftService.getRoster({ ...ROSTER, department_id: 'K2' }, a)).users.map((u) => u.id), ['U3']);
	}
});

test('setRoster phạm vi khoa: người ngoài khoa ⇒ 403, không ghi gì', async () => {
	const n = log.length;
	await denied(shiftService.setRoster({ ...PUT, user_ids: ['U1', 'U3'] }, HEAD_K1));
	await denied(shiftService.setRoster({ ...PUT, user_ids: ['U1'] }, NO_DEPT));
	assert.ok(!queriesSince(n).some((t) => /DELETE FROM shift_assignments|INSERT INTO shift_assignments/.test(t)));
});

test('setRoster phạm vi khoa: người cùng khoa thì được', async () => {
	const n = log.length;
	assert.deepEqual(await shiftService.setRoster({ ...PUT, user_ids: ['U1', 'U2'] }, HEAD_K1), { cells: 2 });
	assert.ok(queriesSince(n).some((t) => /INSERT INTO shift_assignments/.test(t)));
});

test('setRoster toàn viện / lượt cấp cũ / superuser: không kiểm tra khoa', async () => {
	for (const a of [HR, LEGACY, SU]) {
		const n = log.length;
		await shiftService.setRoster({ ...PUT, user_ids: ['U1', 'U3'] }, a);
		assert.ok(!queriesSince(n).some((t) => /FROM OPENJSON\(@users\) j/.test(t)));
	}
});

test('bảng chấm công phạm vi khoa: lọc theo khoa của người xem', async () => {
	let n = log.length;
	await staffAttendanceService.getByDate('2026-11-02', HEAD_K1);
	const att = log.slice(n).find((q) => /FROM staff_attendance a/.test(q.text));
	assert.match(att.text, /u\.department_id = @dept/);
	assert.equal(att.inputs.dept, 'K1');
	assert.equal(log.slice(n).find((q) => /FROM users u LEFT JOIN departments d/.test(q.text)).inputs.dept, 'K1');

	for (const a of [HR, LEGACY, SU]) {
		n = log.length;
		await staffAttendanceService.getByDate('2026-11-02', a);
		assert.doesNotMatch(log.slice(n).find((q) => /FROM staff_attendance a/.test(q.text)).text, /@dept/);
	}
	assert.deepEqual(await staffAttendanceService.getByDate('2026-11-02', NO_DEPT), []);
});
