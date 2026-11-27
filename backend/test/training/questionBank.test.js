// Ngân hàng câu hỏi thi (exams/questionBankService + route /exams/questions) với CSDL giả:
// lọc theo chương trình / kho / loại, giá trị mặc định khi tạo, nhập hàng loạt trong 1
// transaction, đổi sang tự luận thì bỏ phương án, xóa ảnh cũ khi không câu nào dùng,
// không xóa câu đang có trong đề; route kiểm đáp án đúng phải nằm trong các phương án.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { install } = require('../auth/fakeDb');

require('../../src/modules/events/eventService').broadcast = () => {};

const S = {};
const log = install(async (text) => {
	if (text.startsWith('SELECT * FROM question_bank WHERE id = @id'))
		return S.current ? [S.current] : [];
	if (text.includes('SELECT COUNT(*) AS n FROM question_bank WHERE image_url'))
		return [{ n: S.imageUsers }];
	if (text.includes('SELECT 1 AS in_use')) return S.inUse ? [{ in_use: 1 }] : [];
	if (text.includes('DELETE FROM question_bank'))
		return [{ image_url: S.current?.image_url ?? null }];
	if (
		text.includes('INSERT INTO question_bank') &&
		S.failInsertAt != null &&
		++S.inserts === S.failInsertAt
	)
		throw new Error('mất kết nối');
	return [];
});

const removed = [];
require('../../src/utils/uploadPaths').removeUploadedFile = (p) => removed.push(p);
const svc = require('../../src/modules/training/exams/questionBankService');

const reset = (over = {}) => {
	Object.assign(S, {
		current: null,
		imageUsers: 0,
		inUse: false,
		failInsertAt: null,
		inserts: 0,
		...over,
	});
	log.length = 0;
	removed.length = 0;
};
const find = (needle) => log.find((l) => l.text.includes(needle));

test('listQuestions: __none__ ⇒ câu chưa gắn chương trình; kho lạ bị bỏ qua; tìm kiếm qua tham số', async () => {
	reset();
	await svc.listQuestions({ program_id: '__none__', pool: 'drop', search: "a' --" });
	const q = log[0];
	assert.match(q.text, /q\.program_id IS NULL/);
	assert.ok(!q.text.includes('q.pool = @qpool'));
	assert.equal(q.inputs.search, "%a' --%");
	assert.ok(!q.text.includes("a' --"));

	reset();
	await svc.listQuestions({ program_id: 'CT1', pool: 'final', question_type: 'essay' });
	assert.match(
		log[0].text,
		/q\.program_id = @program_id AND q\.pool = @qpool AND q\.question_type = @question_type/,
	);
});

test('createQuestion: loại / kho lạ ⇒ mặc định trắc nghiệm / cuối khóa; bỏ phương án rỗng; điểm mặc định 1', async () => {
	reset();
	await svc.createQuestion(
		{
			question_text: 'Q?',
			question_type: 'matching',
			pool: 'x',
			options: ['A', '', null, 'B'],
			correct_option: 'A',
		},
		'GV',
	);
	const ins = find('INSERT INTO question_bank').inputs;
	assert.deepEqual(
		[
			ins.question_type,
			ins.qpool,
			ins.options,
			ins.correct_option,
			ins.points,
			ins.program_id,
			ins.image_url,
		],
		['single_choice', 'final', '["A","B"]', 'A', 1, null, null],
	);
	assert.match(ins.new_id, /^QB/);
	assert.equal(ins.actor_id, 'GV');
});

test('createQuestion: tự luận ⇒ không lưu phương án / đáp án; ảnh ngoài thư mục câu hỏi ⇒ 400', async () => {
	reset();
	await svc.createQuestion(
		{ question_text: 'Trình bày…', question_type: 'essay', options: ['A'], correct_option: 'A' },
		'GV',
	);
	const ins = find('INSERT INTO question_bank').inputs;
	assert.equal(ins.options, null);
	assert.equal(ins.correct_option, null);

	reset();
	await assert.rejects(
		svc.createQuestion({ question_text: 'Q', image_url: '/uploads/../../etc/passwd' }, 'GV'),
		{
			statusCode: 400,
		},
	);
	await assert.rejects(
		svc.createQuestion({ question_text: 'Q', image_url: '/uploads/avatars/a.png' }, 'GV'),
		{
			statusCode: 400,
		},
	);
	assert.ok(!find('INSERT INTO question_bank'));
});

test('createQuestionsBulk: tất cả trong 1 transaction, mã trả về đúng thứ tự gửi; 1 câu lỗi ⇒ rollback cả lô', async () => {
	reset();
	const r = await svc.createQuestionsBulk(
		[{ question_text: '1' }, { question_text: '2' }, { question_text: '3' }],
		'GV',
	);
	assert.equal(r.created, 3);
	const ins = log.filter((l) => l.text.includes('INSERT INTO question_bank'));
	assert.deepEqual(
		r.ids,
		ins.map((l) => l.inputs.new_id),
	);
	assert.ok(log.at(-1).text === 'COMMIT');

	reset({ failInsertAt: 2 });
	await assert.rejects(
		svc.createQuestionsBulk([{ question_text: '1' }, { question_text: '2' }], 'GV'),
		/mất kết nối/,
	);
	assert.ok(log.some((l) => l.text === 'ROLLBACK'));
	assert.ok(!log.some((l) => l.text === 'COMMIT'));
});

const current = (over = {}) => ({
	id: 'QB1',
	question_type: 'single_choice',
	options: '["A","B"]',
	correct_option: 'A',
	image_url: '/uploads/questions/old.png',
	...over,
});

test('updateQuestion: không tồn tại ⇒ null, không ghi', async () => {
	reset();
	assert.equal(await svc.updateQuestion('QB9', { points: 2 }, 'GV'), null);
	assert.ok(!find('UPDATE question_bank'));
});

test('updateQuestion: chỉ SET trường được gửi; đổi sang tự luận ⇒ xóa phương án và đáp án', async () => {
	reset({ current: current() });
	await svc.updateQuestion('QB1', { points: 2 }, 'GV');
	const set = find('UPDATE question_bank').text;
	assert.match(set, /points = @points/);
	assert.ok(!/options|correct_option|question_text|image_url/.test(set));

	reset({ current: current() });
	await svc.updateQuestion('QB1', { question_type: 'essay' }, 'GV');
	const u = find('UPDATE question_bank').inputs;
	assert.deepEqual([u.question_type, u.options, u.correct_option], ['essay', null, null]);
});

test('updateQuestion: đổi ảnh ⇒ xóa file cũ nếu không câu nào khác dùng; còn câu dùng chung thì giữ', async () => {
	reset({ current: current(), imageUsers: 0 });
	await svc.updateQuestion('QB1', { image_url: '/uploads/questions/new.png' }, 'GV');
	assert.deepEqual(removed, ['/uploads/questions/old.png']);

	reset({ current: current(), imageUsers: 2 });
	await svc.updateQuestion('QB1', { image_url: null }, 'GV');
	assert.deepEqual(removed, []);
	assert.equal(find('UPDATE question_bank').inputs.image_url, null);
});

test('removeQuestion: đang có trong đề / bài làm ⇒ 409, không xóa; xóa được thì dọn ảnh', async () => {
	reset({ inUse: true });
	await assert.rejects(svc.removeQuestion('QB1'), { statusCode: 409 });
	assert.ok(!find('DELETE FROM question_bank'));

	reset({ current: current() });
	await svc.removeQuestion('QB1');
	assert.deepEqual(removed, ['/uploads/questions/old.png']);
});

// ── Route: kiểm dữ liệu câu hỏi ─────────────────────────────────────────────
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
		return res.status;
	} finally {
		srv.close();
	}
};
const mc = (over = {}) => ({
	question_text: 'Thuốc nào?',
	question_type: 'single_choice',
	program_id: 'CT1',
	options: ['A', 'B'],
	correct_option: 'A',
	...over,
});

test('POST /exams/questions/bulk: đáp án đúng không nằm trong phương án ⇒ 400, không ghi', async () => {
	reset();
	assert.equal(
		await call('POST', '/exams/questions/bulk', { questions: [mc(), mc({ correct_option: 'C' })] }),
		400,
	);
	assert.equal(
		await call('POST', '/exams/questions/bulk', { questions: [mc({ program_id: '' })] }),
		400,
	);
	assert.ok(!find('INSERT INTO question_bank'));
	assert.equal(await call('POST', '/exams/questions/bulk', { questions: [mc()] }), 201);
});

test(
	'POST /exams/questions: câu trắc nghiệm có đáp án ngoài phương án ⇒ 400 (như nhập hàng loạt)',
	{
		todo: 'Lỗi thật: exams.routes.js:78-90 (tạo lẻ) không kiểm correct_option ∈ options như /questions/bulk ⇒ lưu được câu mà chấm tự động luôn cho 0 điểm (examAttemptService.js:244)',
	},
	async () => {
		reset();
		assert.equal(await call('POST', '/exams/questions', mc({ correct_option: 'C' })), 400);
		assert.equal(await call('POST', '/exams/questions', mc({ correct_option: undefined })), 400);
	},
);

test(
	'PUT /exams/questions/:id: nội dung rỗng / điểm âm / đáp án ngoài phương án ⇒ 400',
	{
		todo: 'Lỗi thật: exams.routes.js:134 PUT /questions/:id không có validate nào (POST có) ⇒ sửa được câu thành rỗng, điểm âm, đáp án không có trong phương án',
	},
	async () => {
		for (const body of [
			{ question_text: '   ' },
			{ points: -5 },
			{ options: ['A', 'B'], correct_option: 'Z' },
		]) {
			reset({ current: current() });
			assert.equal(await call('PUT', '/exams/questions/QB1', body), 400, JSON.stringify(body));
		}
	},
);
