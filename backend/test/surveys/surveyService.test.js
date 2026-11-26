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
const _inserts = (re) => log.filter((l) => re.test(l.text));

test('#1 nộp khảo sát không tồn tại ⇒ 404, không phải TypeError (500)', async () => {
	reset({ survey: null });
	await assert.rejects(svc.submitResponse('KHONGCO', [], actor), (e) => e.statusCode === 404);
});
