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
		html: '<img src="/uploads/topics/T1/b.png">',
	});
	const out = JSON.parse(res.text);
	assert.match(out.file_url, /^\/uploads\/topics\/T1\/a\.pdf\?exp=\d+&sig=[\w-]+$/);
	assert.match(out.html, /src="\/uploads\/topics\/T1\/b\.png\?exp=\d+&sig=[\w-]+"/);
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
