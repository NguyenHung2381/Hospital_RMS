// Điểm danh học viên (attendance/staffAttendanceService) với CSDL giả: bảng điểm danh
// 1 ngày ghép bản ghi + ca chưa điểm danh + đơn xin phép (nghỉ có phép, đơn duyệt được
// ưu tiên), điểm danh chỉ cho học viên đang học khóa, gộp lý do bị từ chối.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

require('../../src/modules/events/eventService').broadcast = () => {};

const S = {};
const log = install(async (text) => {
	if (text.includes('FROM staff_attendance a')) return S.records;
	if (text.includes('FROM trainees WHERE user_id = @user_id')) return S.trainee ? [S.trainee] : [];
	if (text.includes('SELECT * FROM staff_attendance WHERE user_id')) return [];
	if (text.includes('INSERT INTO staff_attendance'))
		return [{ id: 1, merge_action: S.mergeAction }];
	return [];
});

const shiftService = require('../../src/modules/attendance/shiftService');
const leaveRequestService = require('../../src/modules/attendance/leaveRequestService');
const attendancePolicy = require('../../src/utils/attendancePolicy');
const leavePolicy = require('../../src/utils/leavePolicy');
shiftService.planForDate = async () => S.plan;
shiftService.traineePeriods = async () => S.periods;
shiftService.listPatterns = async () => [];
shiftService.assignmentsForUser = async () => [];
shiftService.shiftsMap = async () => new Map();
leaveRequestService.coveringDate = async () => S.leaves;
attendancePolicy.getPolicy = async () => ({ ipRanges: [], location: null, radiusM: 150 });
attendancePolicy.evaluate = () => ({
	ok: !S.locationReasons.length,
	reasons: [...S.locationReasons],
	distance_m: 12,
});
leavePolicy.getPolicy = async () => ({
	enabled: true,
	backdateDays: 3,
	aheadDays: 90,
	maxSpanDays: 31,
});

const svc = require('../../src/modules/attendance/staffAttendanceService');
const { todayKeyVN } = require('../../src/utils/vnDate');

const ADMIN = { id: 'ADM', permissions: new Set(['system:manage']), permissionScopes: new Map() };
const SHIFT = (id, name, start, end) => ({
	id,
	name,
	code: name[0],
	start_time: start,
	end_time: end,
	checkin_before_min: 30,
	checkout_after_min: 60,
	grace_min: 5,
	is_active: true,
});
const DATE = '2026-01-05'; // đã qua ⇒ ca chưa điểm danh là "vắng"
const trainee = (id, full_name) => ({
	id,
	trainee_id: `HV${id}`,
	full_name,
	department_name: 'Khoa A',
	periods: [
		{
			course_id: 'K1',
			course_name: 'Khóa 1',
			shift_pattern_id: null,
			start_date: '2026-01-01',
			end_date: null,
		},
	],
});
const leave = (id, user_id, over = {}) => ({
	id,
	user_id,
	trainee_id: `HV${user_id}`,
	full_name: `Tên ${user_id}`,
	department_name: 'Khoa A',
	course_id: 'K1',
	course_name: 'Khóa 1',
	type: 'absent',
	status: 'approved',
	shift_id: null,
	shift_name: null,
	arrive_time: null,
	reason: 'Ốm',
	...over,
});

const reset = (over = {}) => {
	Object.assign(S, {
		records: [],
		plan: {
			trainees: [trainee('U1', 'Bình'), trainee('U2', 'An')],
			patterns: [
				{
					id: 1,
					name: 'HC',
					is_default: true,
					days: { 1: [1, 2], 2: [1, 2], 3: [1, 2], 4: [1, 2], 5: [1, 2], 6: [], 7: [] },
				},
			],
			assignments: [],
			shifts: new Map([
				[1, SHIFT(1, 'Sáng', '07:00', '11:00')],
				[2, SHIFT(2, 'Chiều', '13:00', '17:00')],
			]),
		},
		leaves: [],
		trainee: { id: 'HV1', full_name: 'Bình' },
		periods: [],
		locationReasons: [],
		mergeAction: 'INSERT',
		...over,
	});
	log.length = 0;
};
const row = (rows, user, shift) =>
	rows.find((r) => r.user_id === user && (r.shift_id ?? null) === shift);

test('getByDate: phạm vi khoa mà người xem không thuộc khoa nào ⇒ rỗng, không truy vấn', async () => {
	reset();
	const actor = {
		id: 'X',
		department_id: null,
		permissions: new Set(['staff_attendance:read']),
		permissionScopes: new Map([['staff_attendance:read', 'department']]),
	};
	assert.deepEqual(await svc.getByDate(DATE, actor), []);
	assert.equal(log.length, 0);
});

test('getByDate: bản ghi đã điểm danh + ca theo mẫu chưa điểm danh (đã qua ⇒ vắng), không lặp ca đã có', async () => {
	reset({
		records: [
			{
				id: 10,
				user_id: 'U1',
				shift_id: 1,
				full_name: 'Bình',
				shift_start_at: new Date('2026-01-05T00:00:00Z'),
			},
		],
	});
	const rows = await svc.getByDate(DATE, ADMIN);
	assert.equal(rows.length, 4, '2 học viên × 2 ca');
	assert.equal(row(rows, 'U1', 1).status, 'checked');
	assert.equal(row(rows, 'U1', 1).key, 'r10');
	for (const [u, s] of [
		['U1', 2],
		['U2', 1],
		['U2', 2],
	])
		assert.equal(row(rows, u, s).status, 'absent', `${u} ca ${s}`);
	// Xếp theo giờ bắt đầu ca rồi tên
	assert.deepEqual(
		rows.map((r) => `${r.full_name}/${r.shift_id}`),
		['An/1', 'Bình/1', 'An/2', 'Bình/2'],
	);
});

test('getByDate: ca chưa kết thúc ⇒ "chưa điểm danh" chứ không phải vắng', async () => {
	reset();
	const future = '2099-01-05';
	S.plan.trainees = [
		{
			...trainee('U1', 'Bình'),
			periods: [{ ...trainee('U1').periods[0], start_date: '2098-01-01' }],
		},
	];
	const rows = await svc.getByDate(future, ADMIN);
	assert.ok(rows.length > 0 && rows.every((r) => r.status === 'pending'));
});

test('getByDate: đơn nghỉ cả ngày đã duyệt ⇒ ca chưa điểm danh thành "nghỉ có phép", ca đã điểm danh giữ nguyên', async () => {
	reset({
		records: [{ id: 10, user_id: 'U1', shift_id: 1, full_name: 'Bình' }],
		leaves: [leave(1, 'U1')],
	});
	const rows = await svc.getByDate(DATE, ADMIN);
	assert.equal(row(rows, 'U1', 1).status, 'checked');
	assert.equal(row(rows, 'U1', 1).leave.id, 1, 'vẫn hiện đơn');
	assert.equal(row(rows, 'U1', 2).status, 'excused');
	assert.equal(row(rows, 'U2', 2).leave, undefined);
});

test('getByDate: đơn theo ca chỉ gắn đúng ca; đơn xin muộn / chờ duyệt không đổi trạng thái', async () => {
	reset({
		leaves: [
			leave(2, 'U2', { shift_id: 2, shift_name: 'Chiều' }),
			leave(3, 'U1', { type: 'late', arrive_time: '07:30' }),
		],
	});
	const rows = await svc.getByDate(DATE, ADMIN);
	assert.equal(row(rows, 'U2', 1).leave, undefined);
	assert.equal(row(rows, 'U2', 2).status, 'excused');
	assert.equal(row(rows, 'U1', 1).status, 'absent', 'đơn xin muộn không thành nghỉ có phép');
	assert.equal(row(rows, 'U1', 1).leave.arrive_time, '07:30');
});

test('getByDate: học viên có đơn nhưng không có dòng nào ⇒ thêm 1 dòng, ưu tiên đơn đã duyệt', async () => {
	reset({
		leaves: [
			leave(4, 'U3', { status: 'pending' }),
			leave(5, 'U3'),
			leave(6, 'U4', { status: 'pending' }),
		],
	});
	const rows = await svc.getByDate(DATE, ADMIN);
	const u3 = rows.filter((r) => r.user_id === 'U3');
	assert.equal(u3.length, 1, 'mỗi học viên 1 dòng');
	assert.deepEqual([u3[0].key, u3[0].status, u3[0].leave.id], ['l5', 'excused', 5]);
	assert.equal(row(rows, 'U4', null).status, 'pending');
	assert.equal(row(rows, 'U4', null).work_date, DATE);
});

test('check: tài khoản không phải học viên ⇒ 400, không ghi', async () => {
	reset({ trainee: null });
	await assert.rejects(svc.check('U9', { ip: '10.0.0.1' }), {
		statusCode: 400,
		message: /chỉ dành cho tài khoản học viên/,
	});
	assert.ok(!log.some((l) => l.text.includes('INSERT INTO staff_attendance')));
});

test('check: hôm nay không học khóa nào + sai vị trí ⇒ 400 gộp mọi lý do, lý do khóa học đứng đầu', async () => {
	reset({ locationReasons: ['Không ở mạng bệnh viện'] });
	await assert.rejects(svc.check('U1', { ip: '1.1.1.1' }), (err) => {
		assert.equal(err.statusCode, 400);
		assert.equal(
			err.message,
			'Hôm nay bạn không có khóa học nào đang diễn ra nên không cần điểm danh. Không ở mạng bệnh viện',
		);
		return true;
	});
});

const studyingToday = () => [
	{
		course_id: 'K1',
		course_name: 'Khóa 1',
		shift_pattern_id: null,
		start_date: '2026-01-01',
		end_date: null,
	},
];

test('check: điểm danh tự do (không có lịch ca) — lần đầu là vào, ghi khóa + IP + khoảng cách', async () => {
	reset({ periods: studyingToday() });
	const r = await svc.check('U1', { ip: '::ffff:10.0.0.5', lat: 1, lng: 2 });
	assert.equal(r.action, 'check_in');
	assert.ok(!('merge_action' in r.record));
	const ins = log.find((l) => l.text.includes('INSERT INTO staff_attendance')).inputs;
	assert.deepEqual(
		[ins.shift_id, ins.work_date, ins.course_id, ins.late, ins.distance, ins.ip],
		[null, todayKeyVN(), 'K1', null, 12, '10.0.0.5'],
	);

	reset({ periods: studyingToday(), mergeAction: 'UPDATE' });
	assert.equal((await svc.check('U1', {})).action, 'check_out');
});

test('check: chọn ca không còn trong giờ điểm danh ⇒ 400', async () => {
	reset({ periods: studyingToday() });
	await assert.rejects(svc.check('U1', { shift_id: 1, work_date: todayKeyVN() }), {
		statusCode: 400,
		message: /không trong giờ được điểm danh/,
	});
});

test('getMine: không phải học viên — không có lựa chọn, lịch 7 ngày trống, chưa cấu hình vị trí', async () => {
	reset({ trainee: null });
	const r = await svc.getMine('U9', '::ffff:192.168.1.2');
	assert.equal(r.is_trainee, false);
	assert.deepEqual(r.options, []);
	assert.equal(r.week.length, 7);
	assert.equal(r.week[0].date, todayKeyVN());
	assert.ok(r.week.every((d) => d.course_id === null && d.shifts === null));
	assert.equal(r.current_course, null);
	assert.deepEqual(
		[r.client_ip, r.ip_ok, r.configured, r.radius_m],
		['192.168.1.2', false, false, 150],
	);
	assert.deepEqual(r.leave, { enabled: true, backdate_days: 3, ahead_days: 90, max_span_days: 31 });
});
