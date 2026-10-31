const test = require('node:test');
const assert = require('node:assert/strict');

process.env.UPLOAD_URL_SECRET = 'test-secret';
const express = require('express');
const { signUploadUrlsInJson } = require('../../src/utils/signedUpload');

// Dựng app Express thật để đi qua res.json / res.send như route thật
const call = async (body) => {
	const app = express();
	app.set('etag', false);
	app.use(signUploadUrlsInJson);
	app.get('/', (_req, res) => res.json(body));
	const server = app.listen(0);
	try {
		const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
		return { type: res.headers.get('content-type'), text: await res.text() };
	} finally {
		server.close();
	}
};

test('không có đường dẫn /uploads ⇒ JSON giữ nguyên, Content-Type JSON', async () => {
	const body = { success: true, data: [{ id: 1, name: 'Khoa Nội', at: new Date(0) }] };
	const res = await call(body);
	assert.match(res.type, /^application\/json/);
	assert.equal(res.text, JSON.stringify(body));
});

test('có /uploads ⇒ được ký, kể cả trong HTML', async () => {
	const res = await call({
		file_url: '/uploads/topics/T1/a.pdf',
		general_comment: '<img src="/uploads/topics/T1/comments/b.png">',
	});
	const out = JSON.parse(res.text);
	assert.match(out.file_url, /^\/uploads\/topics\/T1\/a\.pdf\?exp=\d+&sig=[\w-]+$/);
	assert.match(
		out.general_comment,
		/src="\/uploads\/topics\/T1\/comments\/b\.png\?exp=\d+&sig=[\w-]+"/,
	);
});

test('chuỗi người dùng tự nhập không được ký (chống tự xin link file người khác)', async () => {
	const res = await call({
		full_name: '/uploads/topics/T1/secret.pdf',
		note: '<img src="/uploads/topics/T1/secret.pdf">',
		// trường nhúng ảnh: chỉ ký ảnh nhận xét, không ký tài liệu đề tài
		comment:
			'<img src="/uploads/topics/T1/secret.pdf"><img src="/uploads/topics/T1/comments/a.png">',
		file_url: 'xem /uploads/topics/T1/a.pdf',
	});
	const out = JSON.parse(res.text);
	assert.equal(out.full_name, '/uploads/topics/T1/secret.pdf');
	assert.equal(out.note, '<img src="/uploads/topics/T1/secret.pdf">');
	assert.match(out.comment, /src="\/uploads\/topics\/T1\/secret\.pdf"/);
	assert.match(out.comment, /src="\/uploads\/topics\/T1\/comments\/a\.png\?exp=\d+&sig=[\w-]+"/);
	assert.equal(out.file_url, 'xem /uploads/topics/T1/a.pdf');
});

test('ảnh test hội nghị: chuỗi JSON test_questions và mảng/đối tượng image đều được ký', async () => {
	const res = await call({
		test_questions: JSON.stringify([{ q: 'a', image: '/uploads/seminars/S1/test/x.png' }]),
		questions: [{ image: '/uploads/seminars/S1/test/y.png' }],
	});
	const out = JSON.parse(res.text);
	assert.match(JSON.parse(out.test_questions)[0].image, /\?exp=\d+&sig=/);
	assert.match(out.questions[0].image, /\?exp=\d+&sig=/);
});

test('route tự đặt Content-Type thì không bị ghi đè', async () => {
	const app = express();
	app.use(signUploadUrlsInJson);
	app.get('/', (_req, res) => res.type('application/problem+json').json({ ok: 1 }));
	const server = app.listen(0);
	try {
		const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
		assert.match(res.headers.get('content-type'), /^application\/problem\+json/);
		assert.deepEqual(await res.json(), { ok: 1 });
	} finally {
		server.close();
	}
});
