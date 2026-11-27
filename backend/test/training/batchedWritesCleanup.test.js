// Các vòng ghi từng dòng đã gom thành 1 câu SQL (jsonValues / jsonRows) — rà soát
// 2026-11-26 (docs/review/2026-11-26/03-training.md). Kiểm số câu ghi và payload JSON;
// câu SQL đã chạy thử trên PostgreSQL thật trong transaction ROLLBACK.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const state = { linked: [], maxOrder: 4, rotations: [], waitlisted: [] };
const log = install(async (text) => {
	if (/SELECT lesson_id FROM lesson_programs WHERE program_id/.test(text))
		return state.linked.map((lesson_id) => ({ lesson_id }));
	if (/AS max_order FROM lesson_programs/.test(text)) return [{ max_order: state.maxOrder }];
	if (/SELECT id, program_id, start_date, end_date FROM course_enrollments/.test(text))
		return [{ id: 'E1', program_id: 'CT1', start_date: null, end_date: null }];
	if (/FROM enrollment_rotations WHERE enrollment_id = @id AND result = 'pending'/.test(text))
		return state.rotations;
	if (/FROM lesson_programs lp\s+JOIN program_lessons pl/.test(text))
		return [
			{ id: 'V1', duration_value: 1, duration_unit: 'month', allow_split: false },
			{ id: 'V2', duration_value: 2, duration_unit: 'week', allow_split: false },
		];
	if (/e\.status = 'waitlisted'/.test(text)) return state.waitlisted;
	return [];
});
require('../../src/modules/events/eventService').broadcast = () => {};
const programClassService = require('../../src/modules/training/courses/programClassService');
programClassService.lockWaitlist = async () => {};
programClassService.classesOf = async () => [
	{ program_id: 'CT1', class_rule: true, class_max: 2, class_approved: 1 },
];
programClassService.mailTrainees = () => {};
programClassService.notifyIfReady = async () => {};
const lessonService = require('../../src/modules/training/programs/programLessonService');
const rotationService = require('../../src/modules/training/courses/enrollmentRotationService');
const waitlistService = require('../../src/modules/training/courses/waitlistTransferService');

const writes = (re) => log.filter((l) => re.test(l.text));

test('linkLessons: 1 câu INSERT, bỏ bài đã gắn / trùng, thứ tự nối sau bài cuối', async () => {
	log.length = 0;
	state.linked = ['L1'];
	const res = await lessonService.linkLessons('CT1', ['L1', 'L2', '', 'L3', 'L2'], 'U1');
	assert.deepEqual(res, { linked: 2 });
	const ins = writes(/INSERT INTO lesson_programs/);
	assert.equal(ins.length, 1);
	assert.deepEqual(JSON.parse(ins[0].inputs.ids), ['L2', 'L3']);
	assert.equal(ins[0].inputs.base_order, 5);
	assert.equal(ins[0].inputs.program_id, 'CT1');
	// Mã bài không tồn tại bị bỏ qua nhờ JOIN program_lessons
	assert.match(ins[0].text, /JOIN program_lessons pl ON pl\.id = j\.value/);
});

test('linkLessons: mọi bài đã gắn ⇒ không gửi câu INSERT', async () => {
	log.length = 0;
	state.linked = ['L1', 'L2'];
	assert.deepEqual(await lessonService.linkLessons('CT1', ['L2', 'L1'], 'U1'), { linked: 0 });
	assert.equal(writes(/INSERT INTO lesson_programs/).length, 0);
	assert.deepEqual(await lessonService.linkLessons('CT1', [], 'U1'), { linked: 0 });
});

test('setLessonLecturers (chương trình): xóa cũ rồi 1 câu INSERT trong cùng giao dịch', async () => {
	log.length = 0;
	await lessonService.setLessonLecturers(
		'CT1',
		'L1',
		{ main: 'GV1', assistants: ['GV2', 'GV1', '', 'GV2'] },
		'U1',
	);
	const seq = log.map((l) => l.text.match(/^\s*(DELETE FROM \w+|INSERT INTO \w+|COMMIT)/)?.[1]);
	assert.deepEqual(seq.filter(Boolean), [
		'DELETE FROM program_lesson_lecturers',
		'INSERT INTO program_lesson_lecturers',
		'COMMIT',
	]);
	const [ins] = writes(/INSERT INTO program_lesson_lecturers/);
	assert.deepEqual(JSON.parse(ins.inputs.rows), [
		{ lecturer_id: 'GV1', role: 'main' },
		{ lecturer_id: 'GV2', role: 'assistant' },
	]);
	assert.equal(ins.inputs.program_id, 'CT1');
	assert.equal(ins.inputs.lesson_id, 'L1');

	log.length = 0;
	await lessonService.setLessonLecturers('CT1', 'L1', { main: null, assistants: [] }, 'U1');
	assert.equal(writes(/DELETE FROM program_lesson_lecturers/).length, 1);
	assert.equal(writes(/INSERT INTO program_lesson_lecturers/).length, 0);
});

test('schedule (vòng GPHN): 1 câu UPDATE ngày cho cả lịch, giới hạn trong hồ sơ', async () => {
	log.length = 0;
	state.rotations = [
		{ id: 'R1', lesson_id: 'V1', duration_text: null },
		{ id: 'R2', lesson_id: 'V2', duration_text: null },
	];
	const res = await rotationService.schedule('E1', '2030-01-01', 'U1');
	assert.deepEqual(res, { scheduled: 2, skipped: 0 });
	const upd = writes(/UPDATE enrollment_rotations/);
	assert.equal(upd.length, 1);
	assert.equal(upd[0].inputs.enrollment_id, 'E1');
	assert.match(upd[0].text, /enrollment_rotations\.enrollment_id = @enrollment_id/);
	const rows = JSON.parse(upd[0].inputs.rows);
	assert.deepEqual(
		rows.map((r) => r.id),
		['R1', 'R2'],
	);
	assert.equal(rows[0].start_date, '2030-01-01');
	// Vòng sau nối tiếp ngay sau vòng trước
	assert.ok(rows[1].start_date > rows[0].end_date);
	assert.equal(writes(/UPDATE course_enrollments/).length, 1);
});

test('schedule: không vòng nào xếp được ⇒ không ghi gì', async () => {
	log.length = 0;
	state.rotations = [];
	assert.deepEqual(await rotationService.schedule('E1', '2030-01-01', 'U1'), {
		scheduled: 0,
		skipped: 0,
	});
	assert.equal(writes(/^\s*UPDATE/).length, 0);
});

test('transfer (danh sách chờ): 1 câu UPDATE cho hồ sơ còn chỗ, trong giao dịch', async () => {
	log.length = 0;
	// Lớp còn 1 chỗ (class_max 2, đã duyệt 1) ⇒ chỉ hồ sơ đầu được chuyển
	state.waitlisted = [
		{ id: 'E7', program_id: 'CT1', trainee_name: 'A' },
		{ id: 'E8', program_id: 'CT1', trainee_name: 'B' },
	];
	const res = await waitlistService.transfer('KH2', ['E7', 'E8'], 'U1');
	assert.deepEqual(res, { moved: 1, skipped: 1, full: 1 });
	const upd = writes(/UPDATE course_enrollments/);
	assert.equal(upd.length, 1);
	assert.deepEqual(JSON.parse(upd[0].inputs.ids), ['E7']);
	assert.equal(upd[0].inputs.course_id, 'KH2');
	assert.match(upd[0].text, /status = 'waitlisted'/);
	assert.equal(log.at(-1).text, 'COMMIT');
});

test('transfer: lớp hết chỗ ⇒ 409, không UPDATE, rollback', async () => {
	log.length = 0;
	programClassService.classesOf = async () => [
		{ program_id: 'CT1', class_rule: true, class_max: 1, class_approved: 1 },
	];
	await assert.rejects(waitlistService.transfer('KH2', ['E7'], 'U1'), { statusCode: 409 });
	assert.equal(writes(/UPDATE course_enrollments/).length, 0);
	assert.equal(log.at(-1).text, 'ROLLBACK');
});
