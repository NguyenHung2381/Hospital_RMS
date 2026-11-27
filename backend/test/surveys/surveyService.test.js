// Hồi quy cho surveyService (01-tests mục 3 #1–#4, 02-security S-08) — CSDL giả.
const test = require('node:test');
const assert = require('node:assert/strict');

const fakeDb = require('../auth/fakeDb');

// Trạng thái CSDL giả cho từng test
let state;
const reset = (over = {}) => {
	state = {
		survey: { id: 'KS1', title: 'T', status: 'active', target_role: null },
		questions: [
			{ id: 'Q1', question_text: 'Một', question_type: 'single_choice', options: '["A","B"]' },
			{ id: 'Q2', question_text: 'Nhiều', question_type: 'multi_choice', options: '["X","Y"]' },
			{ id: 'Q3', question_text: 'Chữ', question_type: 'text', options: null },
		],
		responses: 0,
		failAnswer: false,
		...over,
	};
};
reset();

const log = fakeDb.install(async (text) => {
	if (/FROM surveys WHERE id = @id/.test(text)) return state.survey ? [state.survey] : [];
	if (/SELECT id FROM survey_responses/.test(text)) return [];
	if (/COUNT\(\*\) AS n FROM survey_responses/.test(text)) return [{ n: state.responses }];
	if (/FROM survey_questions WHERE survey_id/.test(text)) return state.questions;
	if (/INSERT INTO survey_answers/.test(text) && state.failAnswer) throw new Error('DB rớt');
	return [];
});

const svc = require('../../src/modules/surveys/surveyService');
const actor = { id: 'U1', role_id: 'R1' };
const inserts = (re) => log.filter((l) => re.test(l.text));

test('#1 nộp khảo sát không tồn tại ⇒ 404, không phải TypeError (500)', async () => {
	reset({ survey: null });
	await assert.rejects(svc.submitResponse('KHONGCO', [], actor), (e) => e.statusCode === 404);
});

test('#2/S-08 phản hồi + câu trả lời trong 1 transaction có người thao tác; lỗi giữa chừng ⇒ ROLLBACK', async () => {
	reset({ failAnswer: true });
	log.length = 0;
	await assert.rejects(svc.submitResponse('KS1', [], actor), /DB rớt/);
	const texts = log.map((l) => l.text);
	const iResp = texts.findIndex((t) => /INSERT INTO survey_responses/.test(t));
	assert.ok(iResp > 0, 'có ghi phản hồi');
	assert.ok(
		texts.slice(0, iResp).some((t) => /set_config\('app.current_user_id'/.test(t)),
		'gắn người thao tác trước khi ghi',
	);
	assert.equal(texts.at(-1), 'ROLLBACK');
	assert.equal(inserts(/COMMIT/).length, 0);
});

test('#4 answer_options chỉ giữ lựa chọn có trong câu hỏi; single_choice tối đa 1', async () => {
	reset();
	log.length = 0;
	await svc.submitResponse(
		'KS1',
		[
			{ question_id: 'Q1', answer_options: ['A', 'B', 'LẠ'] },
			{ question_id: 'Q2', answer_options: ['Y', 'LẠ', 'Y', 'X'] },
			{ question_id: 'Q3', answer_text: 'ok', answer_options: ['A'] },
		],
		actor,
	);
	const byQ = Object.fromEntries(
		inserts(/INSERT INTO survey_answers/).map((l) => [l.inputs.question_id, l.inputs]),
	);
	assert.deepEqual(JSON.parse(byQ.Q1.answer_options), ['A']);
	assert.deepEqual(JSON.parse(byQ.Q2.answer_options), ['Y', 'X']);
	assert.equal(byQ.Q3.answer_options, null);
	assert.equal(byQ.Q3.answer_text, 'ok');
});

test('#4 toàn lựa chọn lạ ⇒ answer_options NULL', async () => {
	reset();
	log.length = 0;
	await svc.submitResponse('KS1', [{ question_id: 'Q1', answer_options: ['LẠ'] }], actor);
	const q1 = inserts(/INSERT INTO survey_answers/).find((l) => l.inputs.question_id === 'Q1');
	assert.equal(q1.inputs.answer_options, null);
});

const sameAsStored = () =>
	state.questions.map((q) => ({
		question_text: q.question_text,
		question_type: q.question_type,
		options: q.options ? JSON.parse(q.options) : undefined,
	}));

test('#3 setQuestions: đổi câu hỏi khi đã có phản hồi ⇒ 409, không DELETE', async () => {
	reset({ responses: 2 });
	log.length = 0;
	await assert.rejects(
		svc.setQuestions('KS1', [{ question_text: 'Mới', question_type: 'text' }], 'ADMIN'),
		(e) => e.statusCode === 409,
	);
	assert.equal(inserts(/DELETE FROM survey_questions/).length, 0);
});

test('#3 setQuestions: câu hỏi không đổi (form sửa gửi kèm) ⇒ không ghi, không 409', async () => {
	reset({ responses: 2 });
	log.length = 0;
	await svc.setQuestions('KS1', sameAsStored(), 'ADMIN');
	assert.equal(inserts(/DELETE FROM survey_questions|INSERT INTO survey_questions/).length, 0);
});

test('#3 setQuestions: chưa có phản hồi ⇒ ghi lại trong 1 transaction có người thao tác', async () => {
	reset({ responses: 0 });
	log.length = 0;
	await svc.setQuestions(
		'KS1',
		[
			{ question_text: 'Mới', question_type: 'single_choice', options: ['A', '', 'B'] },
			{ question_text: '', question_type: 'text' },
		],
		'ADMIN',
	);
	const texts = log.map((l) => l.text);
	const iDel = texts.findIndex((t) => /DELETE FROM survey_questions/.test(t));
	assert.ok(texts.slice(0, iDel).some((t) => /set_config/.test(t)));
	const ins = inserts(/INSERT INTO survey_questions/);
	assert.equal(ins.length, 1);
	assert.equal(ins[0].inputs.options, '["A","B"]');
	assert.ok(texts.includes('COMMIT'));
});

test('xoá khảo sát ghi kèm người thao tác (audit biết ai xoá)', async () => {
	reset();
	log.length = 0;
	await svc.remove('KS1', 'ADMIN');
	const texts = log.map((l) => l.text);
	const iDel = texts.findIndex((t) => /DELETE FROM surveys/.test(t));
	assert.ok(iDel > 0, 'có câu DELETE');
	assert.ok(texts.slice(0, iDel).some((t) => /set_config\('app.current_user_id'/.test(t)));
	assert.ok(texts.slice(iDel).includes('COMMIT'));
});
