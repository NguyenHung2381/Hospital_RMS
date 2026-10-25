// Các thao tác ghi cả danh sách gửi ĐÚNG 1 câu SQL (OPENJSON) thay vì 1 round-trip
// / dòng, và payload JSON mang đủ dữ liệu từng dòng. Câu SQL chạy thật trên SQL
// Server ở test-integration/batchedWrites.test.js.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const QUESTIONS = [
	{ id: 'QB1', question_type: 'single_choice', correct_option: 'Á', points: 1 },
	{ id: 'QB2', question_type: 'single_choice', correct_option: 'C', points: 2 },
	{ id: 'QB3', question_type: 'essay', correct_option: null, points: 1 },
];
const log = install(async (text) => {
	if (/want_no/.test(text))
		return [
			{ id: 'EP1', status: 'published', enrollment_id: 'E1', duration_minutes: 45, want_no: 1 },
		];
	if (/OUTPUT INSERTED\.id/.test(text))
		return [{ id: 'EA1', late: 0, question_ids: JSON.stringify(QUESTIONS.map((q) => q.id)) }];
	if (/FROM question_bank q WHERE q\.id IN/.test(text)) return QUESTIONS;
	if (/SELECT paper_type FROM exam_papers/.test(text)) return [{ paper_type: 'multiple_choice' }];
	return [];
});
require('../../src/modules/events/eventService').broadcast = () => {};
const examAttemptService = require('../../src/modules/training/exams/examAttemptService');
const examPaperService = require('../../src/modules/training/exams/examPaperService');
const lessonService = require('../../src/modules/training/programs/programLessonService');

const writes = (re) => log.filter((l) => re.test(l.text));

test('nộp bài: mọi đáp án + đóng lượt trong 1 câu, chấm trắc nghiệm đúng', async () => {
	log.length = 0;
	const res = await examAttemptService.submitAttempt(
		'EP1',
		[
			{ question_id: 'QB1', selected_option: 'Á' },
			{ question_id: 'QB2', selected_option: 'D' },
			{ question_id: 'QB3', essay_text: 'Bài làm', selected_option: 'bỏ qua' },
		],
		{ id: 'U1' },
	);
	assert.deepEqual(res, { attempt_id: 'EA1', auto_score: 1, has_essay: true, late: false });
	const [ins] = writes(/INSERT INTO exam_answers/);
	assert.equal(writes(/INSERT INTO exam_answers/).length, 1);
	assert.match(ins.text, /UPDATE exam_attempts SET submitted_at/);
	assert.equal(ins.inputs.status, 'submitted');
	assert.equal(ins.inputs.auto_score, 1);
	assert.deepEqual(JSON.parse(ins.inputs.answers), [
		{ question_id: 'QB1', selected_option: 'Á', essay_text: null, score_awarded: 1 },
		{ question_id: 'QB2', selected_option: 'D', essay_text: null, score_awarded: 0 },
		{ question_id: 'QB3', selected_option: null, essay_text: 'Bài làm', score_awarded: null },
	]);
});

test('đề chọn tay: cả bộ câu 1 câu INSERT, lọc theo loại đề', async () => {
	log.length = 0;
	await examPaperService.setPaperQuestions('EP1', ['QB1', '', 'QB2', 'QB1'], 'U1');
	const ins = writes(/INSERT INTO exam_paper_questions/);
	assert.equal(ins.length, 1);
	assert.deepEqual(JSON.parse(ins[0].inputs.ids), ['QB1', 'QB2']);
	assert.equal(ins[0].inputs.only_type, 'single_choice');
	assert.equal(ins[0].inputs.code_no, null);
});

test('đề rỗng: không gửi câu INSERT', async () => {
	log.length = 0;
	await examPaperService.setPaperQuestions('EP1', [], 'U1');
	assert.equal(writes(/INSERT INTO exam_paper_questions/).length, 0);
});

test('sắp xếp bài học: 1 câu UPDATE, giới hạn trong chương trình', async () => {
	log.length = 0;
	await lessonService.reorderLessons('CT1', ['LP3', 'LP1', 'LP3', 'LP2'], 'U1');
	const upd = writes(/UPDATE lp SET display_order/);
	assert.equal(upd.length, 1);
	assert.deepEqual(JSON.parse(upd[0].inputs.ids), ['LP3', 'LP1', 'LP2']);
	assert.equal(upd[0].inputs.program_id, 'CT1');
	assert.match(upd[0].text, /WHERE lp\.program_id = @program_id/);
});

test('gán chương trình / khoa cho bài học: xóa cũ rồi 1 câu INSERT', async () => {
	log.length = 0;
	await lessonService.setLessonPrograms('PL1', ['CT2', 'CT1', 'CT2'], 'U1');
	await lessonService.setLessonDepartments('PL1', ['DV2', null, 'DV1']);
	await lessonService.setLessonDepartments('PL1', []);
	assert.deepEqual(
		log
			.map((l) => l.text.match(/^\s*(DELETE FROM \w+|INSERT INTO \w+|SELECT)/)?.[1])
			.filter(Boolean),
		[
			'DELETE FROM lesson_programs',
			'INSERT INTO lesson_programs',
			'SELECT',
			'DELETE FROM lesson_departments',
			'INSERT INTO lesson_departments',
			'DELETE FROM lesson_departments',
		],
	);
	const [lp] = writes(/INSERT INTO lesson_programs/);
	assert.deepEqual(JSON.parse(lp.inputs.ids), ['CT2', 'CT1']);
	const [ld] = writes(/INSERT INTO lesson_departments/);
	assert.deepEqual(JSON.parse(ld.inputs.ids), ['DV2', 'DV1']);
});
