// QR chung của đề kiểm tra hội nghị (seminarTestQrService) — chạy trên CSDL giả:
// nhập họ tên → khớp người tham dự (xác nhận) hoặc thêm khách → mã lượt → làm / nộp bài
// không cần điểm danh, bài nộp ghi via = 'qr'; CME chỉ tính khi đề bật qr_counts_for_cme.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const QUESTIONS = JSON.stringify([
	{ q: 'Câu 1', options: ['A', 'B'], answer: 1, points: 1 },
	{ q: 'Câu 2', options: ['A', 'B'], answer: 0, points: 1 },
]);
const state = {
	test: {},
	people: [],
	submission: null,
};
const testRow = () => ({
	id: 'SMT1',
	title: 'Bài cuối buổi',
	counts_for_cme: true,
	test_questions: QUESTIONS,
	test_open: true,
	test_date: null,
	test_end_date: null,
	test_start_time: null,
	test_end_time: null,
	test_duration_minutes: null,
	test_pass_score: null,
	test_score_scale: null,
	test_shuffle_questions: false,
	test_shuffle_options: false,
	qr_enabled: true,
	qr_counts_for_cme: false,
	test_started_at: null,
	test_elapsed_sec: null,
	test_submitted_at: null,
	...state.test,
});
const SEMINAR = {
	id: 'HN1',
	title: 'Hội nghị',
	scope: 'hosted',
	start_date: null,
	end_date: null,
	grants_cme: true,
};

const log = install(async (text, inputs) => {
	if (/WHERE t.qr_token = @token/.test(text))
		return inputs.token === 'tok' ? [{ ...SEMINAR, test_id: 'SMT1', seminar_id: 'HN1' }] : [];
	if (/FROM seminar_tests t\s+LEFT JOIN seminar_test_submissions x/.test(text)) return [testRow()];
	if (/SELECT id, full_name, organization, department_raw, notes/.test(text)) return state.people;
	if (/SELECT code FROM seminar_test_qr_sessions/.test(text)) return [{ code: `c-${inputs.pid}` }];
	if (/FROM seminar_test_qr_sessions q/.test(text))
		return inputs.code === 'c-P1'
			? [
					{
						...SEMINAR,
						test_id: 'SMT1',
						participant_id: 'P1',
						ticket_code: null,
						checked_in_at: null,
						full_name: 'Trần Thị An',
					},
				]
			: [];
	if (/INSERT INTO seminar_test_submissions AS x/.test(text)) {
		state.submission = inputs;
		return [{}];
	}
	return [];
});

const added = [];
require('../../src/modules/seminars/seminarParticipantService').add = async (sid, data, actor) => {
	added.push({ sid, data, actor });
	return { id: 'G1' };
};

const qr = require('../../src/modules/seminars/seminarTestQrService');
const { CME_ELIGIBLE_SQL } = require('../../src/modules/seminars/seminarCmeService');

const reset = () => {
	state.test = {};
	state.people = [];
	state.submission = null;
	added.length = 0;
};

test('không trùng ai → thêm khách (có mã vé, ngoại viện) rồi trả mã lượt', async () => {
	reset();
	const r = await qr.enter('tok', { full_name: '  Lê   Văn Khách ', organization: 'BV tỉnh' });
	assert.equal(r.attempt_code, 'c-G1');
	assert.equal(added.length, 1);
	const { data, actor } = added[0];
	assert.equal(data.full_name, 'Lê Văn Khách');
	assert.equal(data.organization, 'BV tỉnh');
	assert.equal(data.source, 'external');
	assert.match(data.ticket_code, /^[0-9a-f]{32}$/);
	assert.equal(actor, null);
});

test('trùng họ tên (bỏ dấu, hoa thường) → hỏi xác nhận, không tự gắn', async () => {
	reset();
	state.people = [
		{ id: 'P1', full_name: 'Trần Thị An', organization: 'Khoa Nội', department_raw: null },
		{ id: 'P2', full_name: 'Trần Thị Bình', organization: null, department_raw: null },
	];
	const r = await qr.enter('tok', { full_name: 'tran thi an' });
	assert.deepEqual(
		r.choices.map((c) => c.id),
		['P1'],
	);
	assert.equal(added.length, 0);

	assert.equal(
		(await qr.enter('tok', { full_name: 'Trần Thị An', participant_id: 'P1' })).attempt_code,
		'c-P1',
	);
	// Không chọn được người không trùng tên vừa nhập
	await assert.rejects(
		qr.enter('tok', { full_name: 'Trần Thị An', participant_id: 'P2' }),
		(e) => e.statusCode === 409,
	);
	// "Không phải tôi" → làm với tư cách khách
	assert.equal(
		(await qr.enter('tok', { full_name: 'Trần Thị An', as_guest: true })).attempt_code,
		'c-G1',
	);
});

test('BTC tắt QR chung / đề đóng / link sai → không vào được', async () => {
	reset();
	state.test = { qr_enabled: false };
	await assert.rejects(qr.enter('tok', { full_name: 'A' }), (e) => e.statusCode === 409);
	state.test = { test_open: false };
	await assert.rejects(qr.enter('tok', { full_name: 'A' }), (e) => e.statusCode === 409);
	state.test = {};
	await assert.rejects(qr.enter('khac', { full_name: 'A' }), (e) => e.statusCode === 404);
	await assert.rejects(qr.enter('tok', { full_name: ' ' }), (e) => e.statusCode === 400);
});

test('trang nhập tên không lộ câu hỏi; lượt làm bài không cần điểm danh', async () => {
	reset();
	const info = await qr.getQrTest('tok');
	assert.equal(info.test.question_count, 2);
	assert.equal(info.test.counts_for_cme, false);
	assert.equal(JSON.stringify(info).includes('answer'), false);

	const a = await qr.getAttempt('c-P1');
	assert.equal(a.full_name, 'Trần Thị An');
	assert.equal(a.test.questions.length, 2);
	assert.equal(JSON.stringify(a.test.questions).includes('answer'), false);
});

test('nộp bài qua QR chung ghi via = qr; tắt QR thì không nộp được', async () => {
	reset();
	const r = await qr.submitAttempt('c-P1', [1, 1]);
	assert.equal(r.correct, 1);
	assert.equal(state.submission.via, 'qr');
	assert.equal(state.submission.pid, 'P1');

	state.test = { qr_enabled: false };
	await assert.rejects(qr.submitAttempt('c-P1', [1, 0]), (e) => e.statusCode === 409);
	assert.ok(log.length);
});

test('điều kiện CME: bài via = qr chỉ tính khi đề bật qr_counts_for_cme', () => {
	assert.match(CME_ELIGIBLE_SQL, /r\.via <> 'qr' OR t\.qr_counts_for_cme/);
});
