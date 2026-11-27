// Ngân hàng câu hỏi thi — một bộ kiểm dữ liệu dùng chung cho tạo lẻ, nhập hàng loạt và sửa
// (exams/questionValidators.js). Hồi quy cho lỗi phiên tests tìm ra
// (docs/review/2026-11-26/01-tests.md mục 12, 13): tạo lẻ không kiểm đáp án đúng nằm trong
// các phương án; PUT không kiểm gì ⇒ lưu được câu chấm tự động luôn 0 điểm, nội dung rỗng,
// điểm âm.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { install } = require('../auth/fakeDb');

require('../../src/modules/events/eventService').broadcast = () => {};

const S = { current: null };
const log = install(async (text) => {
	if (text.startsWith('SELECT * FROM question_bank WHERE id = @id'))
		return S.current ? [S.current] : [];
	return [];
});

// Bỏ qua đăng nhập / phân quyền (đã có test riêng): chỉ kiểm phần validate của route
const authPath = require.resolve('../../src/middlewares/auth');
require.cache[authPath] = {
	id: authPath,
	filename: authPath,
	loaded: true,
	exports: {
		authenticate: (req, _res, next) => {
			req.user = { id: 'GV', permissions: new Set(['system:manage']), permissionScopes: new Map() };
			next();
		},
		authorizePermission: () => (_req, _res, next) => next(),
	},
};
const app = express();
app.use(express.json());
app.use('/exams', require('../../src/modules/training/exams/exams.routes'));
app.use((err, _req, res, _next) =>
	res.status(err.statusCode || err.status || 500).json({ message: err.message }),
);

const call = async (method, path, body) => {
	const srv = app.listen(0, '127.0.0.1');
	await new Promise((r) => srv.once('listening', r));
	try {
		const res = await fetch(`http://127.0.0.1:${srv.address().port}${path}`, {
			method,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		});
		return { status: res.status, body: await res.json() };
	} finally {
		srv.close();
	}
};
const reset = (current = null) => {
	S.current = current;
	log.length = 0;
};
const wrote = (re) => log.some((l) => re.test(l.text));
const mc = (over = {}) => ({
	question_text: 'Thuốc nào?',
	question_type: 'single_choice',
	program_id: 'CT1',
	options: ['A', 'B'],
	correct_option: 'A',
	...over,
});
const stored = (over = {}) => ({
	id: 'QB1',
	question_type: 'single_choice',
	question_text: 'Câu cũ',
	options: JSON.stringify(['A', 'B']),
	correct_option: 'A',
	points: 1,
	image_url: null,
	...over,
});

test('POST /exams/questions: đáp án ngoài phương án / thiếu đáp án / thiếu phương án / điểm sai ⇒ 400, không ghi', async () => {
	for (const body of [
		mc({ correct_option: 'C' }),
		mc({ correct_option: undefined }),
		mc({ correct_option: '' }),
		mc({ options: undefined }),
		// Không gửi loại câu ⇒ mặc định trắc nghiệm như khi lưu, nên vẫn phải có đáp án hợp lệ
		mc({ question_type: undefined, correct_option: 'Z' }),
		mc({ points: 0 }),
		mc({ points: 1000 }),
		mc({ question_text: '   ' }),
		mc({ program_id: '' }),
		mc({ pool: 'khac' }),
	]) {
		reset();
		const r = await call('POST', '/exams/questions', body);
		assert.equal(r.status, 400, JSON.stringify(body));
		assert.ok(!wrote(/INSERT INTO question_bank/), JSON.stringify(body));
	}
	const bad = await call('POST', '/exams/questions', mc({ correct_option: 'C' }));
	assert.match(JSON.stringify(bad.body), /đáp án đúng nằm trong các phương án/);
});

test('POST /exams/questions: câu hợp lệ ⇒ 201; tự luận không cần phương án / đáp án', async () => {
	reset();
	assert.equal((await call('POST', '/exams/questions', mc({ points: 2.5 }))).status, 201);
	assert.ok(wrote(/INSERT INTO question_bank/));
	reset();
	const essay = { question_text: 'Trình bày…', question_type: 'essay', program_id: 'CT1' };
	assert.equal((await call('POST', '/exams/questions', essay)).status, 201);
});

test('POST /exams/questions/bulk: vẫn kiểm như cũ; đáp án rỗng trùng phương án rỗng ⇒ 400', async () => {
	reset();
	const r = await call('POST', '/exams/questions/bulk', {
		questions: [mc(), mc({ options: ['A', ''], correct_option: '' })],
	});
	assert.equal(r.status, 400);
	reset();
	assert.equal(
		(
			await call('POST', '/exams/questions/bulk', {
				questions: [mc(), mc({ correct_option: 'C' })],
			})
		).status,
		400,
	);
	assert.equal(
		(await call('POST', '/exams/questions/bulk', { questions: [mc({ question_type: undefined })] }))
			.status,
		400,
	);
	assert.ok(!wrote(/INSERT INTO question_bank/));
	assert.equal((await call('POST', '/exams/questions/bulk', { questions: [mc()] })).status, 201);
});

test('PUT /exams/questions/:id: nội dung rỗng / điểm âm / đáp án ngoài phương án ⇒ 400, không ghi', async () => {
	for (const body of [
		{ question_text: '   ' },
		{ points: -5 },
		{ points: 0 },
		{ question_type: 'khac' },
		{ program_id: '' },
		{ options: ['A', 'B'], correct_option: 'Z' },
		// Chỉ gửi một phần: so với phương án / đáp án đang lưu
		{ correct_option: 'Z' },
		{ options: ['C', 'D'] },
		{ question_type: 'single_choice' },
	]) {
		reset(
			stored(
				body.question_type ? { question_type: 'essay', options: null, correct_option: null } : {},
			),
		);
		const r = await call('PUT', '/exams/questions/QB1', body);
		assert.equal(r.status, 400, JSON.stringify(body));
		assert.ok(!wrote(/UPDATE question_bank/), JSON.stringify(body));
	}
});

test('PUT /exams/questions/:id: sửa một phần hợp lệ ⇒ 200; đổi sang tự luận bỏ phương án', async () => {
	reset(stored());
	assert.equal((await call('PUT', '/exams/questions/QB1', { points: 2 })).status, 200);
	assert.equal(log.find((l) => /UPDATE question_bank/.test(l.text)).inputs.points, 2);

	reset(stored());
	const r = await call('PUT', '/exams/questions/QB1', { options: ['B', 'C'], correct_option: 'C' });
	assert.equal(r.status, 200);

	reset(stored());
	assert.equal((await call('PUT', '/exams/questions/QB1', { question_type: 'essay' })).status, 200);
	const upd = log.find((l) => /UPDATE question_bank/.test(l.text));
	assert.equal(upd.inputs.options, null);
	assert.equal(upd.inputs.correct_option, null);

	// Câu cũ đã lỗi sẵn (đáp án ngoài phương án): sửa điểm / kho / chương trình không bị chặn,
	// chỉ kiểm khi đụng tới loại câu / phương án / đáp án
	reset(stored({ correct_option: 'Z' }));
	const move = { points: 3, program_id: 'CT2', pool: 'entrance' };
	assert.equal((await call('PUT', '/exams/questions/QB1', move)).status, 200);
});
