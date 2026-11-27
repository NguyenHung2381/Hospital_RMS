// Đơn xin nghỉ / xin đi muộn của học viên (attendance/leaveRequestService) với CSDL
// giả: giới hạn ngày theo cấu hình, chỉ học viên đang học khóa, ca phải có trong lịch,
// chặn đơn trùng, thông báo đúng người duyệt (toàn viện + cùng khoa), duyệt theo
// phạm vi khoa, không tự duyệt, đơn đã xử lý ⇒ 409.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

require('../../src/modules/events/eventService').broadcast = () => {};

const S = {};
const USER_DEPT = { A1: 'K9', D1: 'K1', D2: 'K2', HV1: 'K1' };
const log = install(async (text, inputs) => {
	if (text.includes('FROM trainees WHERE user_id = @user_id')) return S.trainee ? [S.trainee] : [];
	if (text.includes('SELECT id, status FROM attendance_leave_requests'))
		return S.dup ? [S.dup] : [];
	if (text.includes('INSERT INTO attendance_leave_requests'))
		return [
			{
				id: 7,
				user_id: inputs.user_id,
				type: inputs.type,
				from_date: new Date(`${inputs.from}T00:00:00Z`),
				to_date: new Date(`${inputs.to}T00:00:00Z`),
				shift_id: inputs.shift_id,
				shift_name: inputs.shift_name,
				status: 'pending',
			},
		];
	if (text.includes('SELECT id FROM users WHERE department_id = @dept'))
		return JSON.parse(inputs.ids)
			.filter((id) => USER_DEPT[id] === inputs.dept)
			.map((id) => ({ id }));
	if (text.includes("SET status = 'cancelled'")) return S.cancelOk ? [{}] : [];
	if (text.includes('WHERE r.id = @id')) return S.current ? [S.current] : [];
	if (text.includes('SET status = @status')) return S.updateOk ? [{}] : [];
	return [];
});

// Người duyệt: lọc theo quyền thật (hasPermission/scopeOf) trên danh sách tài khoản giả
const actor = (id, perms = {}, department_id = USER_DEPT[id]) => ({
	id,
	department_id,
	permissions: new Set(Object.keys(perms)),
	permissionScopes: new Map(Object.entries(perms)),
});
const APPROVERS = [
	actor('A1', { 'staff_attendance:approve': 'all' }),
	actor('D1', { 'staff_attendance:approve': 'department' }),
	actor('D2', { 'staff_attendance:approve': 'department' }),
	actor('HV1', { 'staff_attendance:approve': 'all' }), // chính người gửi
	actor('R1', { 'staff_attendance:read': 'all' }),
];
require('../../src/modules/access/permissionService').findActiveUserIdsWhere = async (pred) =>
	APPROVERS.filter(pred).map((u) => u.id);

const pushed = [];
require('../../src/modules/notifications/notificationService').push = async (...args) => {
	pushed.push(args);
};
require('../../src/modules/forms/formCustomValueService').attach = async (_k, rows) => rows;
const leavePolicy = require('../../src/utils/leavePolicy');
leavePolicy.getPolicy = async () => S.policy;
const shiftService = require('../../src/modules/attendance/shiftService');
shiftService.traineePeriods = async () => S.periods;
shiftService.listPatterns = async () => S.patterns;
shiftService.shiftsMap = async () => new Map(S.shifts.map((s) => [s.id, s]));
shiftService.assignmentsForUser = async () => S.assignments;

const svc = require('../../src/modules/attendance/leaveRequestService');
const { todayKeyVN } = require('../../src/utils/vnDate');
const { addDays } = require('../../src/utils/attendanceShift');

const day = (n) => addDays(todayKeyVN(), n);
const reset = (over = {}) => {
	Object.assign(S, {
		policy: { enabled: true, backdateDays: 3, aheadDays: 90, maxSpanDays: 31 },
		trainee: { id: 'HV0001', full_name: 'Nguyễn Văn A', department_id: 'K1' },
		// Khóa KH1 bắt đầu từ ngày +2 (ngày 0, +1 chưa học)
		periods: [
			{
				course_id: 'KH1',
				course_name: 'Khóa 1',
				shift_pattern_id: null,
				start_date: day(2),
				end_date: null,
			},
		],
		patterns: [],
		shifts: [{ id: 1, name: 'Sáng', start_time: '07:00', end_time: '11:00' }],
		assignments: [],
		dup: null,
		cancelOk: true,
		current: null,
		updateOk: true,
		...over,
	});
	log.length = 0;
	pushed.length = 0;
};
const absent = (over = {}) => ({
	type: 'absent',
	from_date: day(2),
	to_date: day(3),
	reason: 'Ốm, có giấy khám',
	...over,
});
const wrote = () => log.some((l) => l.text.includes('INSERT INTO attendance_leave_requests'));

const rejects400 = async (body, msg) => {
	await assert.rejects(svc.createMine('HV1', body), (err) => {
		assert.equal(err.statusCode, 400, err.message);
		assert.match(err.message, msg);
		return true;
	});
	assert.ok(!wrote(), 'không ghi đơn');
};

test('createMine: quản trị tắt chức năng ⇒ 400', async () => {
	reset();
	S.policy.enabled = false;
	await rejects400(absent(), /tắt chức năng/);
});

test('createMine: kiểm khoảng ngày theo cấu hình (nộp bù, xin trước, độ dài, thứ tự)', async () => {
	reset();
	await rejects400(absent({ from_date: day(5), to_date: day(4) }), /phải sau hoặc bằng/);
	await rejects400(absent({ from_date: day(-4), to_date: day(-4) }), /tối đa 3 ngày/);
	await rejects400(absent({ from_date: day(80), to_date: day(91) }), /trước tối đa 90 ngày/);
	await rejects400(absent({ from_date: day(2), to_date: day(33) }), /tối đa 31 ngày/);
	S.policy.backdateDays = 0;
	await rejects400(
		absent({ from_date: day(-1), to_date: day(-1) }),
		/Không được nộp đơn cho ngày đã qua/,
	);
});

test('createMine: ca chỉ chọn cho đơn 1 ngày; xin muộn phải có giờ; lý do ≥ 5 ký tự', async () => {
	reset();
	await rejects400(absent({ shift_id: 1 }), /Chỉ chọn ca khi xin phép trong 1 ngày/);
	await rejects400({ type: 'late', from_date: day(2), reason: 'Kẹt xe' }, /giờ dự kiến/);
	await rejects400(absent({ reason: '  ab  ' }), /tối thiểu 5 ký tự/);
});

test('createMine: không phải học viên / không có khóa trong khoảng ngày ⇒ 400', async () => {
	reset({ trainee: null });
	await rejects400(absent(), /chỉ dành cho tài khoản học viên/);
	reset();
	await rejects400(absent({ from_date: day(0), to_date: day(1) }), /không có khóa học nào/);
});

test('createMine: ca không tồn tại / không có trong lịch ngày đó ⇒ 400', async () => {
	reset();
	await rejects400(absent({ to_date: day(2), shift_id: 99 }), /Ca không tồn tại/);
	reset({ assignments: [{ work_date: day(2), shift_id: 2 }] });
	await rejects400(absent({ to_date: day(2), shift_id: 1 }), /không có ca Sáng/);
});

test('createMine: trùng đơn đang chờ / đã duyệt ⇒ 409, không ghi', async () => {
	for (const [status, msg] of [
		['pending', /đang chờ duyệt/],
		['approved', /đã được duyệt/],
	]) {
		reset({ dup: { id: 3, status } });
		await assert.rejects(svc.createMine('HV1', absent()), { statusCode: 409, message: msg });
		assert.ok(!wrote());
	}
	const q = log.find((l) => l.text.includes('SELECT id, status FROM attendance_leave_requests'));
	assert.match(q.text, /from_date <= @to AND to_date >= @from/, 'so trùng theo khoảng giao nhau');
});

test('createMine: xin nghỉ nhiều ngày — khóa của ngày đầu có học, không lưu giờ có mặt', async () => {
	reset();
	const saved = await svc.createMine(
		'HV1',
		absent({ from_date: day(1), to_date: day(3), arrive_time: '09:00' }),
	);
	const ins = log.find((l) => l.text.includes('INSERT INTO attendance_leave_requests')).inputs;
	assert.deepEqual(
		[ins.type, ins.from, ins.to, ins.course_id, ins.arrive_time, ins.reason],
		['absent', day(1), day(3), 'KH1', null, 'Ốm, có giấy khám'],
	);
	assert.equal(saved.from_date, day(1), 'ngày trả về dạng YYYY-MM-DD');
	assert.equal(saved.to_date, day(3));
});

test('createMine: xin đi muộn — chỉ 1 ngày (bỏ to_date), lưu giờ có mặt và tên ca', async () => {
	reset();
	await svc.createMine('HV1', {
		type: 'late',
		from_date: day(2),
		to_date: day(9),
		shift_id: 1,
		arrive_time: '07:30',
		reason: 'Đưa con đi khám',
	});
	const ins = log.find((l) => l.text.includes('INSERT INTO attendance_leave_requests')).inputs;
	assert.equal(ins.to, day(2));
	assert.equal(ins.arrive_time, '07:30');
	assert.equal(ins.shift_name, 'Sáng (07:00–11:00)');
	assert.match(pushed[0][1], /xin đi muộn/);
	assert.match(pushed[0][3].message, /dự kiến có mặt lúc 07:30/);
});

test('createMine: thông báo người duyệt toàn viện + duyệt khoa cùng khoa, trừ chính người gửi', async () => {
	reset();
	await svc.createMine('HV1', absent());
	assert.equal(pushed.length, 1);
	const [type, title, recipients, opts] = pushed[0];
	assert.equal(type, 'leave_request_submitted');
	assert.match(title, /^Nguyễn Văn A gửi đơn xin nghỉ /);
	assert.deepEqual([...recipients].sort(), ['A1', 'D1']);
	assert.deepEqual([opts.refId, opts.refType], ['7', 'leave_request']);
});

test('cancelMine: chỉ hủy đơn của mình còn chờ duyệt, không trúng ⇒ 409', async () => {
	reset();
	await svc.cancelMine('HV1', 5);
	const q = log.at(-1);
	assert.match(q.text, /WHERE id = @id AND user_id = @user_id AND status = 'pending'/);
	assert.deepEqual([q.inputs.id, q.inputs.user_id], [5, 'HV1']);
	reset({ cancelOk: false });
	await assert.rejects(svc.cancelMine('HV1', 5), { statusCode: 409 });
});

const pending = (over = {}) => ({
	id: 5,
	user_id: 'HV1',
	department_id: 'K1',
	type: 'absent',
	status: 'pending',
	from_date: new Date('2026-12-05T00:00:00Z'),
	to_date: new Date('2026-12-05T00:00:00Z'),
	shift_name: null,
	...over,
});
const updated = () => log.some((l) => l.text.includes('SET status = @status'));

test('review: từ chối phải có lý do, kiểm trước khi đọc CSDL', async () => {
	reset({ current: pending() });
	await assert.rejects(svc.review(5, { decision: 'rejected', note: '   ' }, APPROVERS[0]), {
		statusCode: 400,
	});
	assert.equal(log.length, 0);
});

test('review: ngoài phạm vi khoa / không có khoa / không tồn tại ⇒ 404, không ghi', async () => {
	const cases = [
		[pending(), APPROVERS[2]], // D2 khoa K2 duyệt đơn khoa K1
		[pending(), actor('DX', { 'staff_attendance:approve': 'department' }, null)],
		[null, APPROVERS[0]],
	];
	for (const [current, who] of cases) {
		reset({ current });
		await assert.rejects(svc.review(5, { decision: 'approved' }, who), { statusCode: 404 });
		assert.ok(!updated());
	}
});

test('review: đơn đã xử lý ⇒ 409; tự duyệt đơn của mình ⇒ 400', async () => {
	reset({ current: pending({ status: 'approved' }) });
	await assert.rejects(svc.review(5, { decision: 'approved' }, APPROVERS[0]), { statusCode: 409 });
	reset({ current: pending({ user_id: 'A1' }) });
	await assert.rejects(svc.review(5, { decision: 'approved' }, APPROVERS[0]), { statusCode: 400 });
	assert.ok(!updated());
});

test('review: người khác duyệt trước (UPDATE không trúng) ⇒ 409, không thông báo', async () => {
	reset({ current: pending(), updateOk: false });
	await assert.rejects(svc.review(5, { decision: 'approved' }, APPROVERS[1]), { statusCode: 409 });
	const upd = log.find((l) => l.text.includes('SET status = @status'));
	assert.match(upd.text, /WHERE id = @id AND status = 'pending'/);
	assert.equal(pushed.length, 0);
});

test('review: duyệt khoa cùng khoa được; báo kết quả cho học viên', async () => {
	reset({ current: pending() });
	const r = await svc.review(5, { decision: 'rejected', note: ' Thiếu giấy tờ ' }, APPROVERS[1]);
	assert.deepEqual([r.status, r.review_note, r.reviewed_by], ['rejected', 'Thiếu giấy tờ', 'D1']);
	const [type, title, to, opts] = pushed[0];
	assert.equal(type, 'leave_request_reviewed');
	assert.equal(title, 'Đơn xin nghỉ ngày 05/12/2026 bị từ chối');
	assert.deepEqual(to, ['HV1']);
	assert.equal(opts.message, 'Thiếu giấy tờ');
});

test('list: phạm vi khoa theo quyền duyệt (nếu có), không có khoa ⇒ rỗng không truy vấn', async () => {
	reset();
	assert.deepEqual(
		await svc.list({}, actor('DX', { 'staff_attendance:approve': 'department' }, null)),
		[],
	);
	assert.equal(log.length, 0);

	await svc.list({ status: 'pending', from: '2026-12-01', to: '2026-12-31' }, APPROVERS[1]);
	const q = log.at(-1);
	assert.match(
		q.text,
		/AND r\.status = @status AND r\.to_date >= @from AND r\.from_date <= @to AND t\.department_id = @dept/,
	);
	assert.equal(q.inputs.dept, 'K1');

	// Quyền xem toàn viện nhưng không có quyền duyệt ⇒ phạm vi theo quyền xem
	await svc.list({}, APPROVERS[4]);
	assert.ok(!log.at(-1).text.includes('@dept'));
});
