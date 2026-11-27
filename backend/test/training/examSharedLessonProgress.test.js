// Phần dùng chung của đề thi (exams/examShared) và tính trạng thái bài học từ điểm danh
// (courses/lessonProgressService) với CSDL giả: bốc câu đủ số lượng hoặc báo thiếu, giữ
// thứ tự câu của lượt làm bài, đúng 1 bộ lọc khi tính lại tiến độ.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const events = [];
require('../../src/modules/events/eventService').broadcast = (...a) => events.push(a);

const S = { bank: [], paperQuestions: [], questions: [], changed: 0 };
const log = install(async (text, inputs) => {
	if (text.includes('SELECT id, question_type FROM question_bank')) return S.bank;
	if (text.includes('FROM exam_paper_questions WHERE paper_id')) return S.paperQuestions;
	if (text.includes('FROM question_bank q WHERE q.id IN')) {
		const ids = JSON.parse(inputs.ids);
		return S.questions.filter((q) => ids.includes(q.id));
	}
	if (text.includes('UPDATE enrollment_lessons')) return Array(S.changed).fill({});
	return [];
});
const shared = require('../../src/modules/training/exams/examShared');
const progress = require('../../src/modules/training/courses/lessonProgressService');

test('isRandom / parseOptions', () => {
	assert.equal(shared.isRandom({}), false);
	assert.equal(shared.isRandom({ gen_mc_count: 0, gen_essay_count: 2 }), true);
	assert.deepEqual(shared.parseOptions({ id: 1, options: '["A","B"]' }).options, ['A', 'B']);
	const row = { id: 1 };
	assert.equal(shared.parseOptions(row), row, 'không có cột options ⇒ giữ nguyên');
});

test('bankOf: tách câu trắc nghiệm / tự luận của đúng chương trình và kho', async () => {
	S.bank = [
		{ id: 'Q1', question_type: 'single_choice' },
		{ id: 'Q2', question_type: 'essay' },
		{ id: 'Q3', question_type: 'single_choice' },
	];
	log.length = 0;
	const bank = await shared.bankOf({ program_id: 'CT1', purpose: 'entrance' });
	assert.deepEqual(bank, { mc: ['Q1', 'Q3'], essay: ['Q2'] });
	assert.deepEqual([log[0].inputs.program_id, log[0].inputs.qpool], ['CT1', 'entrance']);
});

test('drawSet: đủ câu ⇒ trắc nghiệm trước, tự luận sau, không trùng; thiếu ⇒ 400 nêu số câu đang có', () => {
	const bank = { mc: ['M1', 'M2', 'M3'], essay: ['E1', 'E2'] };
	const set = shared.drawSet(
		{ gen_mc_count: 2, gen_essay_count: 1, purpose: 'final' },
		bank,
		new Set(),
		Math.random,
	);
	assert.equal(set.length, 3);
	assert.ok(set.slice(0, 2).every((id) => id.startsWith('M')));
	assert.ok(set[2].startsWith('E'));
	assert.equal(new Set(set).size, 3);

	assert.throws(
		() =>
			shared.drawSet(
				{ gen_mc_count: 5, gen_essay_count: 3, purpose: 'entrance' },
				bank,
				new Set(),
				Math.random,
			),
		(err) => {
			assert.equal(err.statusCode, 400);
			assert.match(err.message, /kiểm tra đầu vào/);
			assert.match(err.message, /3\/5 câu trắc nghiệm, 2\/3 câu tự luận/);
			return true;
		},
	);
});

test('attemptQuestionIds: lượt mới dùng bộ câu đã lưu, lượt cũ lấy câu của đề theo thứ tự', async () => {
	assert.deepEqual(await shared.attemptQuestionIds({ question_ids: '["Q3","Q1"]' }), ['Q3', 'Q1']);
	S.paperQuestions = [{ question_id: 'Q1' }, { question_id: 'Q2' }];
	log.length = 0;
	assert.deepEqual(await shared.attemptQuestionIds({ paper_id: 'DE1', question_ids: null }), [
		'Q1',
		'Q2',
	]);
	assert.match(log[0].text, /ORDER BY sort_order/);
});

test('loadQuestions: giữ thứ tự của lượt làm bài, bỏ câu đã bị xóa, rỗng ⇒ không truy vấn', async () => {
	log.length = 0;
	assert.deepEqual(await shared.loadQuestions([], 'q.id'), []);
	assert.equal(log.length, 0);
	S.questions = [{ id: 'Q1' }, { id: 'Q3' }];
	const out = await shared.loadQuestions(['Q3', 'Q2', 'Q1'], 'q.id');
	assert.deepEqual(out, [
		{ id: 'Q3', sort_order: 0 },
		{ id: 'Q1', sort_order: 2 },
	]);
});

test('lessonProgress.recompute: lọc theo buổi / khóa / hồ sơ; có mặt + đi muộn đều tính là đã học', async () => {
	for (const [arg, needle] of [
		[
			{ sessionId: 'BH1' },
			/el\.lesson_id = \(SELECT subject_id FROM class_sessions WHERE id = @session_id\)/,
		],
		[{ courseId: 'KH1' }, /WHERE e\.course_id = @course_id/],
		[{ enrollmentId: 'GD1' }, /WHERE e\.id = @enrollment_id/],
	]) {
		log.length = 0;
		await progress.recompute(arg);
		assert.match(log[0].text, needle);
		assert.match(log[0].text, /a\.status IN \('present', 'late'\)/);
		assert.match(
			log[0].text,
			/WHEN total > 0 AND attended = total THEN 'done'/,
			'bài chưa có buổi không thành done',
		);
	}
});

test('lessonProgress.recompute: trả số dòng đổi; chỉ phát sự kiện khi có thay đổi', async () => {
	events.length = 0;
	S.changed = 0;
	assert.equal(await progress.recompute({ courseId: 'KH1' }), 0);
	assert.equal(events.length, 0);
	S.changed = 3;
	assert.equal(await progress.recompute({ courseId: 'KH1' }), 3);
	assert.deepEqual(events, [['update', { entity: 'course_enrollment' }]]);
});
