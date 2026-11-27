// Khảo sát (surveyService) với CSDL giả: điều kiện được trả lời (trạng thái, vai
// trò đích, đã nộp chưa), ghi phản hồi, lưu câu hỏi, tổng hợp kết quả.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

// Không bắn sự kiện realtime (service destructure broadcast lúc nạp)
require('../../src/modules/events/eventService').broadcast = () => {};

// Dữ liệu giả, đổi được trong từng test
const state = {
	survey: null, // dòng surveys (SELECT id, title, ... FROM surveys WHERE id = @id)
	existing: [], // survey_responses đã có của người dùng
	questions: [],
	answers: [],
	insertResponseError: null,
};

const log = install(async (text) => {
	if (text.includes('FROM surveys WHERE id = @id')) return state.survey ? [state.survey] : [];
	if (text.includes('SELECT id FROM survey_responses')) return state.existing;
	if (text.includes('FROM survey_questions WHERE survey_id')) return state.questions;
	if (text.includes('INSERT INTO survey_responses') && state.insertResponseError)
		throw state.insertResponseError;
	if (text.includes('FROM survey_answers a')) return state.answers;
	if (text.includes('FROM surveys s') && text.includes('WHERE s.id = @id'))
		return state.survey ? [{ ...state.survey, response_count: 2 }] : [];
	if (text.includes('COUNT(*) AS total FROM surveys')) return [{ total: 0 }];
	return [];
});

const svc = require('../../src/modules/surveys/surveyService');

const reset = () => {
	log.length = 0;
	state.survey = { id: 'KS1', title: 'KS', status: 'active', target_role: null };
	state.existing = [];
	state.questions = [
		{ id: 'Q1', question_type: 'single_choice', options: '["A","B"]' },
		{ id: 'Q2', question_type: 'multi_choice', options: '["X","Y","Z"]' },
		{ id: 'Q3', question_type: 'text', options: null },
	];
	state.answers = [];
	state.insertResponseError = null;
};

const actor = { id: 'NV0001', role_id: 'R_MEMBER' };
const writes = (needle) => log.filter((l) => l.text.includes(needle));

test('getForRespond: không có khảo sát ⇒ null', async () => {
	reset();
	state.survey = null;
	assert.equal(await svc.getForRespond('KS9', actor), null);
});

test('getForRespond: khảo sát chưa mở / đã đóng ⇒ 403', async () => {
	for (const status of ['draft', 'closed']) {
		reset();
		state.survey.status = status;
		await assert.rejects(svc.getForRespond('KS1', actor), { statusCode: 403 });
	}
});

test('getForRespond: khảo sát dành cho vai trò khác ⇒ 403', async () => {
	reset();
	state.survey.target_role = 'R_TRAINEE';
	await assert.rejects(svc.getForRespond('KS1', actor), {
		statusCode: 403,
		message: /vai trò/,
	});
});

test('getForRespond: đúng vai trò đích ⇒ trả câu hỏi đã parse options', async () => {
	reset();
	state.survey.target_role = 'R_MEMBER';
	const row = await svc.getForRespond('KS1', actor);
	assert.equal(row.questions.length, 3);
	assert.deepEqual(row.questions[0].options, ['A', 'B']);
	assert.deepEqual(row.questions[2].options, []);
});

test('getForRespond: đã nộp rồi ⇒ 409', async () => {
	reset();
	state.existing = [{ id: 'PH1' }];
	await assert.rejects(svc.getForRespond('KS1', actor), { statusCode: 409 });
});

test('submitResponse: kiểm lại điều kiện trước khi ghi — khảo sát đã đóng thì không ghi gì', async () => {
	reset();
	state.survey.status = 'closed';
	await assert.rejects(svc.submitResponse('KS1', [], actor), { statusCode: 403 });
	assert.equal(writes('INSERT').length, 0);
});

test('submitResponse: 1 dòng phản hồi + 1 dòng trả lời cho MỖI câu hỏi của khảo sát', async () => {
	reset();
	const res = await svc.submitResponse(
		'KS1',
		[
			{ question_id: 'Q1', answer_options: ['A'] },
			{ question_id: 'Q3', answer_text: 'Góp ý', answer_options: ['A'] },
			{ question_id: 'Q_KHAC', answer_text: 'câu không thuộc khảo sát' },
		],
		actor,
	);
	assert.match(res.response_id, /^PH/);

	const resp = writes('INSERT INTO survey_responses');
	assert.equal(resp.length, 1);
	assert.equal(resp[0].inputs.user_id, 'NV0001', 'người nộp lấy từ phiên, không từ body');

	const ans = writes('INSERT INTO survey_answers');
	assert.deepEqual(
		ans.map((a) => a.inputs.question_id),
		['Q1', 'Q2', 'Q3'],
		'chỉ ghi câu thuộc khảo sát, bỏ question_id lạ',
	);
	assert.ok(ans.every((a) => a.inputs.response_id === res.response_id));
	const [q1, q2, q3] = ans.map((a) => a.inputs);
	assert.equal(q1.answer_options, '["A"]');
	assert.equal(q1.answer_text, null, 'câu chọn không lưu answer_text');
	assert.equal(q2.answer_options, null, 'câu bỏ trống ⇒ null');
	assert.equal(q3.answer_text, 'Góp ý');
	assert.equal(q3.answer_options, null, 'câu tự luận không lưu answer_options');
});

test('submitResponse: trùng UNIQUE(survey_id, respondent) lúc ghi (nộp 2 lần cùng lúc) ⇒ 409', async () => {
	reset();
	state.insertResponseError = Object.assign(new Error('duplicate key'), {
		code: '23505',
		severity: 'ERROR',
	});
	await assert.rejects(svc.submitResponse('KS1', [], actor), { statusCode: 409 });
	assert.equal(writes('INSERT INTO survey_answers').length, 0);
});

test('submitResponse: lỗi CSDL khác không bị đổi thành 409', async () => {
	reset();
	state.insertResponseError = Object.assign(new Error('fk'), { code: '23503', severity: 'ERROR' });
	await assert.rejects(svc.submitResponse('KS1', [], actor), { message: 'fk' });
});

test('submitResponse: khảo sát không tồn tại ⇒ 404', async () => {
	reset();
	state.survey = null;
	await assert.rejects(svc.submitResponse('KS9', [], actor), { statusCode: 404 });
});

test('setQuestions: bỏ câu thiếu nội dung / sai loại, đánh số thứ tự liên tục, lọc lựa chọn rỗng', async () => {
	reset();
	await svc.setQuestions(
		'KS1',
		[
			{ question_text: 'Một', question_type: 'single_choice', options: ['A', '', null, 'B'] },
			{ question_text: '', question_type: 'text' },
			{ question_text: 'Sai loại', question_type: 'rating' },
			null,
			{ question_text: 'Hai', question_type: 'text', options: ['bỏ qua'] },
		],
		'ADMIN',
	);
	const del = log.findIndex((l) => l.text.includes('DELETE FROM survey_questions'));
	const ins = writes('INSERT INTO survey_questions').map((l) => l.inputs);
	assert.ok(del >= 0 && del < log.findIndex((l) => l.text.includes('INSERT')), 'xóa trước rồi ghi');
	assert.equal(ins.length, 2);
	assert.deepEqual(
		ins.map((i) => [i.question_text, i.sort_order, i.options]),
		[
			['Một', 0, '["A","B"]'],
			['Hai', 1, null],
		],
	);
	assert.ok(ins.every((i) => i.actor_id === 'ADMIN' && i.survey_id === 'KS1'));
});

test('getResults: đếm theo lựa chọn (kể cả 0 phiếu), câu tự luận trả danh sách văn bản', async () => {
	reset();
	state.answers = [
		{ question_id: 'Q1', answer_options: '["A"]' },
		{ question_id: 'Q1', answer_options: '["A"]' },
		{ question_id: 'Q2', answer_options: '["X","Z"]' },
		{ question_id: 'Q2', answer_options: 'không phải JSON' },
		{ question_id: 'Q3', answer_text: 'Tốt' },
		{ question_id: 'Q3', answer_text: null },
	];
	const r = await svc.getResults('KS1');
	const [q1, q2, q3] = r.questions;
	assert.deepEqual(q1.counts, [
		{ option: 'A', count: 2 },
		{ option: 'B', count: 0 },
	]);
	assert.deepEqual(q2.counts, [
		{ option: 'X', count: 1 },
		{ option: 'Y', count: 0 },
		{ option: 'Z', count: 1 },
	]);
	assert.deepEqual(q3.texts, ['Tốt']);
	assert.equal(r.response_count, 2);
});

test('getResults: khảo sát không tồn tại ⇒ null', async () => {
	reset();
	state.survey = null;
	assert.equal(await svc.getResults('KS9'), null);
});

test('listActiveForUser: lọc theo vai trò + loại khảo sát đã nộp bằng id trong phiên', async () => {
	reset();
	await svc.listActiveForUser({ id: 'NV0002', role_id: 'R_X' });
	const q = log.at(-1);
	assert.equal(q.inputs.user_id, 'NV0002');
	assert.equal(q.inputs.role_id, 'R_X');
	assert.match(q.text, /status = 'active'/);
	assert.match(q.text, /NOT EXISTS/);
});

test('getAll: tìm kiếm và trạng thái đi qua tham số, không nối chuỗi vào SQL', async () => {
	reset();
	// queryAll giả chỉ trả 1 tập kết quả (thiếu dòng total) ⇒ bỏ qua lỗi đọc total,
	// chỉ xét câu SQL đã gửi đi.
	await svc.getAll({ search: "x' OR 1=1 --", status: 'active' }).catch(() => {});
	const q = log.at(-1);
	assert.equal(q.inputs.search, "%x' OR 1=1 --%");
	assert.equal(q.inputs.status, 'active');
	assert.ok(!q.text.includes('OR 1=1'));
});
