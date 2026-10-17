const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// UPLOADS_DIR phải đặt trước khi require middleware (đọc lúc nạp module)
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-public-upload-'));
process.env.UPLOADS_DIR = root;
const express = require('express');
// Cấu hình hệ thống không cần DB — dùng mặc định của utils/uploadPolicy.js
require('../../src/services/systemSettingService').getValue = async () => undefined;
const { publicUpload, moveUploadedFiles } = require('../../src/middlewares/uploadPublic');

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const tmpDir = path.join(root, '_tmp', 'public');
const tmpFiles = () => (fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir) : []);

const startApp = (handler) => {
	const app = express();
	app.use(express.json());
	app.post('/x', publicUpload, handler);
	app.use((err, _req, res, _next) =>
		res.status(err.statusCode || 500).json({ message: err.message }),
	);
	return new Promise((resolve) => {
		const server = app.listen(0, () => resolve(server));
	});
};

const post = (server, body) =>
	fetch(`http://127.0.0.1:${server.address().port}/x`, {
		method: 'POST',
		body,
		...(typeof body === 'string' ? { headers: { 'Content-Type': 'application/json' } } : {}),
	});

const waitCleanup = () => new Promise((r) => setTimeout(r, 50));

test('multipart: field data (JSON) thành req.body, file tạm bị xoá nếu không được chuyển đi', async () => {
	let seen;
	const server = await startApp((req, res) => {
		seen = { body: req.body, files: req.files.length };
		res.json({ ok: true });
	});
	const form = new FormData();
	form.append('data', JSON.stringify({ title: 'Đề tài', members: [{ full_name: 'A' }] }));
	form.append('files', new Blob([PDF]), 'thuyet-minh.pdf');
	const res = await post(server, form);
	server.close();
	assert.strictEqual(res.status, 200);
	assert.deepStrictEqual(seen.body, { title: 'Đề tài', members: [{ full_name: 'A' }] });
	assert.strictEqual(seen.files, 1);
	await waitCleanup();
	assert.deepStrictEqual(tmpFiles(), []);
});

test('file đã chuyển sang thư mục chính thức thì còn nguyên', async () => {
	const dest = path.join(root, 'topics', 'DT001');
	const server = await startApp(async (req, res) => {
		await moveUploadedFiles(req.files, dest);
		res.json({ ok: true });
	});
	const form = new FormData();
	form.append('data', '{}');
	form.append('files', new Blob([PDF]), 'a.pdf');
	const res = await post(server, form);
	server.close();
	assert.strictEqual(res.status, 200);
	await waitCleanup();
	assert.strictEqual(fs.readdirSync(dest).length, 1);
	assert.deepStrictEqual(tmpFiles(), []);
});

test('JSON thường (không file) vẫn đi qua như cũ', async () => {
	let seen;
	const server = await startApp((req, res) => {
		seen = req.body;
		res.json({ ok: true });
	});
	const res = await post(server, JSON.stringify({ a: 1 }));
	server.close();
	assert.strictEqual(res.status, 200);
	assert.deepStrictEqual(seen, { a: 1 });
});

test('đuôi file không cho phép / nội dung giả mạo đuôi bị từ chối 400', async () => {
	const server = await startApp((_req, res) => res.json({ ok: true }));
	const bad = new FormData();
	bad.append('data', '{}');
	bad.append('files', new Blob(['<script>']), 'x.html');
	const fake = new FormData();
	fake.append('data', '{}');
	fake.append('files', new Blob(['not a pdf']), 'x.pdf');
	const [r1, r2] = [await post(server, bad), await post(server, fake)];
	server.close();
	assert.strictEqual(r1.status, 400);
	assert.strictEqual(r2.status, 400);
	await waitCleanup();
	assert.deepStrictEqual(tmpFiles(), []);
});

test('data không phải JSON hợp lệ → 400', async () => {
	const server = await startApp((_req, res) => res.json({ ok: true }));
	const form = new FormData();
	form.append('data', 'not json');
	const res = await post(server, form);
	server.close();
	assert.strictEqual(res.status, 400);
});
