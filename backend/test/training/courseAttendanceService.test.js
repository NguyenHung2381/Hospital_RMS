// Điểm danh buổi học của khóa đào tạo (courses/courseAttendanceService) với CSDL giả:
// QR ngắn hạn đúng mục đích, học viên phải thuộc lớp của buổi, 1 thiết bị chỉ điểm danh
// cho 1 người, điểm đã khóa thì không đổi trạng thái, máy chấm công không ghi đè điểm
// danh tay và giữ lần chấm sớm nhất.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-course-attendance-0123456789';
require('../../scripts/lib/static-check-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

require('../../src/modules/events/eventService').broadcast = () => {};

const S = {};
const log = install(async (text, inputs) => {
	if (text.includes('SELECT e.id AS enrollment_id, e.trainee_id')) return S.myEnrollments;
	if (/^SELECT e\.id\s+FROM class_sessions/.test(text.trim()))
		return S.roster.map((id) => ({ id }));
	if (text.includes('a.checkin_device_id = @device_id')) return S.deviceTaken ? [{ x: 1 }] : [];
	if (text.includes('SELECT 1 AS x FROM attendance WHERE session_id'))
		return S.existing.includes(inputs.enrollment_id) ? [{ x: 1 }] : [];
	if (text.includes('SELECT enrollment_id, status FROM attendance')) return S.currentStatus;
	if (text.includes('SELECT method, checked_in_at FROM attendance'))
		return S.deviceRow ? [S.deviceRow] : [];
	return [];
});

const gradebook = require('../../src/modules/training/courses/gradebookService');
gradebook.lockedEnrollmentIds = async (ids) => new Set(ids.filter((id) => S.locked.includes(id)));
const progress = require('../../src/modules/training/courses/lessonProgressService');
const recomputed = [];
progress.recompute = async (arg) => {
	recomputed.push(arg);
	return 0;
};

const svc = require('../../src/modules/training/courses/courseAttendanceService');
const { signToken } = require('../../src/utils/keys');

const reset = (over = {}) => {
	Object.assign(S, {
		myEnrollments: [{ enrollment_id: 'GD1', trainee_id: 'HV1' }],
		roster: ['GD1', 'GD2'],
		deviceTaken: false,
		existing: [],
		currentStatus: [],
		locked: [],
		deviceRow: null,
		...over,
	});
	log.length = 0;
	recomputed.length = 0;
};
const writes = () => log.filter((l) => /^\s*(INSERT INTO|UPDATE) attendance/.test(l.text));
const ME = { id: 'U1' };

test('checkInSelf: mã QR sai / ký cho mục đích khác / sai purpose ⇒ 401, không ghi', async () => {
	reset();
	for (const token of [
		'không-phải-jwt',
		signToken('seminar-qr', { session_id: 'BH1', purpose: 'course_attendance_qr' }, '1m'),
		signToken('attendance-qr', { session_id: 'BH1', purpose: 'khac' }, '1m'),
		signToken('attendance-qr', { session_id: 'BH1', purpose: 'course_attendance_qr' }, '-1s'),
	])
		await assert.rejects(svc.checkInSelf(token, 'dev1', ME), { statusCode: 401 });
	assert.equal(log.length, 0);
});

test('checkInSelf: không thuộc lớp của buổi ⇒ 403; mọi lượt ghi danh đã khóa điểm ⇒ 409', async () => {
	const token = svc.generateAttendanceQrToken('BH1');
	reset({ myEnrollments: [] });
	await assert.rejects(svc.checkInSelf(token, 'dev1', ME), { statusCode: 403 });
	reset({ locked: ['GD1'] });
	await assert.rejects(svc.checkInSelf(token, 'dev1', ME), { statusCode: 409 });
	assert.equal(writes().length, 0);
});

test('checkInSelf: thiết bị đã điểm danh cho học viên khác trong buổi ⇒ 403, không ghi', async () => {
	reset({ deviceTaken: true });
	await assert.rejects(svc.checkInSelf(svc.generateAttendanceQrToken('BH1'), 'dev1', ME), {
		statusCode: 403,
		message: /Thiết bị này đã dùng/,
	});
	assert.equal(writes().length, 0);
	assert.equal(recomputed.length, 0);
	const q = log.find((l) => l.text.includes('a.checkin_device_id = @device_id'));
	assert.match(q.text, /ae\.trainee_id <> @trainee_id/, 'chính mình quét lại vẫn được');
});

test('checkInSelf: nhiều lớp trong khóa ⇒ ghi mọi lượt chưa khóa (mới: INSERT, đã có: UPDATE), method qr', async () => {
	reset({
		myEnrollments: [
			{ enrollment_id: 'GD1', trainee_id: 'HV1' },
			{ enrollment_id: 'GD2', trainee_id: 'HV1' },
			{ enrollment_id: 'GD3', trainee_id: 'HV1' },
		],
		existing: ['GD2'],
		locked: ['GD3'],
	});
	const r = await svc.checkInSelf(svc.generateAttendanceQrToken('BH7'), 'dev9', ME);
	assert.deepEqual(r, { session_id: 'BH7' });
	const w = writes();
	assert.deepEqual(
		w.map((l) => [l.text.trim().split(' ')[0], l.inputs.enrollment_id]),
		[
			['INSERT', 'GD1'],
			['UPDATE', 'GD2'],
		],
	);
	assert.ok(w.every((l) => /'present'/.test(l.text) && /'qr'/.test(l.text)));
	assert.ok(w.every((l) => l.inputs.device_id === 'dev9' && l.inputs.actor_id === 'U1'));
	assert.deepEqual(recomputed, [{ sessionId: 'BH7' }]);
});

test('bulkSetAttendance: có học viên ngoài lớp ⇒ 400 trước khi ghi', async () => {
	reset();
	await assert.rejects(
		svc.bulkSetAttendance(
			'BH1',
			[
				{ enrollment_id: 'GD1', status: 'present' },
				{ enrollment_id: 'GD9', status: 'absent' },
			],
			'GV',
		),
		{ statusCode: 400 },
	);
	assert.equal(writes().length, 0);
});

test('bulkSetAttendance: điểm đã khóa mà đổi trạng thái ⇒ 409 cho cả lô; giữ nguyên trạng thái (chỉ sửa ghi chú) thì được', async () => {
	reset({ locked: ['GD2'], currentStatus: [{ enrollment_id: 'GD2', status: 'absent' }] });
	await assert.rejects(
		svc.bulkSetAttendance(
			'BH1',
			[
				{ enrollment_id: 'GD1', status: 'present' },
				{ enrollment_id: 'GD2', status: 'present' },
			],
			'GV',
		),
		{ statusCode: 409 },
	);
	assert.equal(writes().length, 0, 'không ghi dòng nào của lô');

	reset({
		locked: ['GD2'],
		currentStatus: [{ enrollment_id: 'GD2', status: 'absent' }],
		existing: ['GD2'],
	});
	await svc.bulkSetAttendance(
		'BH1',
		[
			{ enrollment_id: 'GD1', status: 'present' },
			{ enrollment_id: 'GD2', status: 'absent', note: 'Có giấy' },
		],
		'GV',
	);
	assert.equal(writes().length, 2);
	assert.deepEqual(recomputed, [{ sessionId: 'BH1' }], 'tính lại tiến độ 1 lần sau cả lô');
});

test('setAttendance: chưa có ⇒ INSERT với mã sinh mới; đã có ⇒ UPDATE; ghi chú rỗng ⇒ NULL', async () => {
	reset();
	await svc.setAttendance('BH1', 'GD1', 'late', '', 'GV');
	const [ins] = writes();
	assert.match(ins.text, /INSERT INTO attendance/);
	assert.match(ins.inputs.new_id, /^DD/);
	assert.deepEqual([ins.inputs.status, ins.inputs.note, ins.inputs.actor_id], ['late', null, 'GV']);
	assert.ok(log.some((l) => l.text === 'COMMIT'));
	assert.deepEqual(recomputed, [{ sessionId: 'BH1' }]);

	reset({ existing: ['GD1'] });
	await svc.setAttendance('BH1', 'GD1', 'absent', 'Ốm', 'GV', { recompute: false });
	assert.match(writes()[0].text, /UPDATE attendance SET status = @status/);
	assert.equal(recomputed.length, 0);
});

const at = (iso) => new Date(iso);
const punch = (iso) => ({
	sessionId: 'BH1',
	enrollmentId: 'GD1',
	status: 'present',
	checkedInAt: at(iso),
	deviceTag: 'MCC1',
});

test('recordDeviceCheckIn: điểm khóa ⇒ locked; điểm danh tay ⇒ giữ nguyên; chưa có ⇒ ghi', async () => {
	reset({ locked: ['GD1'] });
	assert.equal(await svc.recordDeviceCheckIn(punch('2026-12-01T00:05:00Z')), 'locked');
	assert.equal(log.length, 0);

	reset({ deviceRow: { method: 'manual', checked_in_at: null } });
	assert.equal(await svc.recordDeviceCheckIn(punch('2026-12-01T00:05:00Z')), 'kept_manual');
	assert.equal(writes().length, 0);

	reset();
	assert.equal(await svc.recordDeviceCheckIn(punch('2026-12-01T00:05:00Z')), 'matched');
	const [ins] = writes();
	assert.match(ins.text, /'device'/);
	assert.equal(ins.inputs.device_id, 'MCC1');
	assert.match(
		log.find((l) => l.text.includes('SELECT method')).text,
		/FOR UPDATE/,
		'khóa dòng khi đọc',
	);
});

test('recordDeviceCheckIn: đã có lần chấm sớm hơn ⇒ giữ; lần chấm mới sớm hơn ⇒ cập nhật', async () => {
	reset({ deviceRow: { method: 'qr', checked_in_at: at('2026-12-01T00:01:00Z') } });
	assert.equal(await svc.recordDeviceCheckIn(punch('2026-12-01T00:05:00Z')), 'matched');
	assert.equal(writes().length, 0);

	reset({ deviceRow: { method: 'device', checked_in_at: at('2026-12-01T00:09:00Z') } });
	await svc.recordDeviceCheckIn(punch('2026-12-01T00:05:00Z'));
	const [upd] = writes();
	assert.match(upd.text, /UPDATE attendance SET status = @status, method = 'device'/);
	assert.equal(upd.inputs.checked_in_at.toISOString(), '2026-12-01T00:05:00.000Z');
});
