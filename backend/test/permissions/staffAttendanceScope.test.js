// Phạm vi khoa của điểm danh / phân ca học viên (staff_attendance): khoa trưởng,
// điều dưỡng trưởng chỉ thấy và xếp ca cho học viên khoa mình (trainees.department_id);
// lượt cấp quyền có từ trước khi resource có phạm vi (scope NULL) giữ hiệu lực toàn
// viện, không bị thu hẹp. Chỉ tài khoản học viên mới được phân ca.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

// Tài khoản học viên theo khoa, đang học khóa KH1
const USERS = [
	{ id: 'U1', full_name: 'A', department_id: 'K1' },
	{ id: 'U2', full_name: 'B', department_id: 'K1' },
	{ id: 'U3', full_name: 'C', department_id: 'K2' },
];
const isTrainee = (id, dept) =>
	USERS.some((u) => u.id === id && (!dept || u.department_id === dept));

const log = install(async (text, inputs) => {
	if (/FROM course_enrollments e/.test(text)) {
		return USERS.filter((u) => !inputs.dept || u.department_id === inputs.dept).map((u) => ({
			user_id: u.id,
			trainee_id: `HV${u.id}`,
			full_name: u.full_name,
			department_id: u.department_id,
			course_id: 'KH1',
			course_name: 'Khóa 1',
			shift_pattern_id: null,
			start_date: '2026-11-01',
			end_date: null,
		}));
	}
	if (/FROM OPENJSON\(@users\) j/.test(text)) {
		return JSON.parse(inputs.users)
			.filter((id) => !isTrainee(id, inputs.dept))
			.map((id) => ({ id }));
	}
	if (/FROM work_shifts/.test(text)) return [{ id: 1, is_active: true }];
	return [];
});
require('../../src/modules/events/eventService').broadcast = () => {};
const shiftService = require('../../src/modules/attendance/shiftService');
const staffAttendanceService = require('../../src/modules/attendance/staffAttendanceService');
const { RESOURCE_SCOPES, nullScopeFill } = require('../../src/permissions/scopes');

const actor = (id, departmentId, grants) => ({
	id,
	department_id: departmentId,
	permissions: new Set(Object.keys(grants)),
	permissionScopes: new Map(Object.entries(grants).filter(([, s]) => s)),
});
const HEAD_K1 = actor('TK1', 'K1', {
	'staff_attendance:read': 'department',
	'staff_attendance:roster': 'department',
});
const HR = actor('NS1', 'K9', { 'staff_attendance:read': 'all', 'staff_attendance:roster': 'all' });
// Lượt cấp cũ còn scope NULL (cấp trước khi resource có phạm vi) — không bị thu hẹp
const LEGACY = actor('NS2', 'K9', {
	'staff_attendance:read': null,
	'staff_attendance:roster': null,
});
const SU = actor('ADMIN', null, { 'system:manage': null });
const NO_DEPT = actor('TK0', null, {
	'staff_attendance:roster': 'department',
	'staff_attendance:read': 'department',
});

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
});

test('getRoster phạm vi khoa: chỉ học viên khoa mình, bỏ qua department_id gửi lên', async () => {
	const own = await shiftService.getRoster(ROSTER, HEAD_K1);
	assert.deepEqual(
		own.users.map((u) => u.id),
		['U1', 'U2'],
	);
	const other = await shiftService.getRoster({ ...ROSTER, department_id: 'K2' }, HEAD_K1);
	assert.deepEqual(
		other.users.map((u) => u.id),
		['U1', 'U2'],
	);
	assert.deepEqual((await shiftService.getRoster(ROSTER, NO_DEPT)).users, []);
});

test('getRoster toàn viện / lượt cấp cũ / superuser: không đổi hành vi', async () => {
	for (const a of [HR, LEGACY, SU]) {
		assert.deepEqual(
			(await shiftService.getRoster(ROSTER, a)).users.map((u) => u.id),
			['U1', 'U2', 'U3'],
		);
		assert.deepEqual(
			(await shiftService.getRoster(ROSTER, a)).users[0].periods.map((p) => p.course_id),
			['KH1'],
		);
	}
});

test('setRoster phạm vi khoa: học viên ngoài khoa ⇒ 403, không ghi gì', async () => {
	const n = log.length;
	await denied(shiftService.setRoster({ ...PUT, user_ids: ['U1', 'U3'] }, HEAD_K1));
	await denied(shiftService.setRoster({ ...PUT, user_ids: ['U1'] }, NO_DEPT));
	assert.ok(
		!queriesSince(n).some((t) =>
			/DELETE FROM shift_assignments|INSERT INTO shift_assignments/.test(t),
		),
	);
});

test('setRoster phạm vi khoa: học viên cùng khoa thì được', async () => {
	const n = log.length;
	assert.deepEqual(await shiftService.setRoster({ ...PUT, user_ids: ['U1', 'U2'] }, HEAD_K1), {
		cells: 2,
	});
	assert.ok(queriesSince(n).some((t) => /INSERT INTO shift_assignments/.test(t)));
});

test('setRoster toàn viện / lượt cấp cũ / superuser: không kiểm tra khoa, chỉ kiểm tra là học viên', async () => {
	for (const a of [HR, LEGACY, SU]) {
		const n = log.length;
		await shiftService.setRoster({ ...PUT, user_ids: ['U1', 'U3'] }, a);
		const check = log.slice(n).find((q) => /FROM OPENJSON\(@users\) j/.test(q.text));
		assert.doesNotMatch(check.text, /@dept/);
		await assert.rejects(
			shiftService.setRoster({ ...PUT, user_ids: ['NV1'] }, a),
			(e) => e.statusCode === 400,
		);
	}
});

test('bảng điểm danh phạm vi khoa: lọc theo khoa của người xem', async () => {
	let n = log.length;
	await staffAttendanceService.getByDate('2026-11-02', HEAD_K1);
	const att = log.slice(n).find((q) => /FROM staff_attendance a/.test(q.text));
	assert.match(att.text, /t\.department_id = @dept/);
	assert.equal(att.inputs.dept, 'K1');
	assert.equal(
		log.slice(n).find((q) => /FROM course_enrollments e/.test(q.text)).inputs.dept,
		'K1',
	);

	for (const a of [HR, LEGACY, SU]) {
		n = log.length;
		await staffAttendanceService.getByDate('2026-11-02', a);
		assert.doesNotMatch(
			log.slice(n).find((q) => /FROM staff_attendance a/.test(q.text)).text,
			/@dept/,
		);
	}
	assert.deepEqual(await staffAttendanceService.getByDate('2026-11-02', NO_DEPT), []);
});
