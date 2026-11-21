// Middleware upload hồ sơ đăng ký khóa đào tạo liên tục (uploadRegistration.js), multipart thật qua Express:
//   - đuôi ngoài PDF / JPG / PNG bị từ chối (không theo "Định dạng file" của Cấu hình hệ thống);
//   - mỗi loại 1 phần files[<kind>]: 2 file cùng loại / tên phần lạ / quá 4 file ⇒ 400 câu riêng;
//   - nội dung phải khớp đuôi (secureUpload): .jpg mà nội dung PDF ⇒ 400;
//   - file tạm bị xóa sau khi trả response (kể cả khi lỗi), file đã chuyển đi thì còn nguyên;
//   - data (JSON) thành req.body; request không phải multipart đi thẳng qua.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// UPLOADS_DIR phải đặt trước khi require middleware (đọc lúc nạp module)
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-reg-upload-'));
process.env.UPLOADS_DIR = root;
const express = require('express');
const settings = {};
require('../../src/modules/settings/systemSettingService').getValue = async (k) => settings[k];
const {
	registrationFormUpload,
	registrationFileUpload,
} = require('../../src/modules/training/registration/registrationUpload');
const { moveUploadedFiles } = require('../../src/utils/uploadPaths');
const {
	UPLOADABLE_KINDS,
	FORM_FIELD,
} = require('../../src/modules/training/registration/registrationFileKinds');
const {
	collectByKind,
} = require('../../src/modules/training/registration/registrationFileService');

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const tmpDir = path.join(root, '_tmp', 'public');
const tmpFiles = () => (fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir) : []);
const waitCleanup = () => new Promise((r) => setTimeout(r, 60));

const startApp = (handler) => {
	const app = express();
	app.use(express.json());
	app.post('/form', registrationFormUpload, handler);
	app.post('/one', registrationFileUpload, handler);
	app.use((err, _req, res, _next) =>
		res.status(err.statusCode || 500).json({ message: err.message }),
	);
	return new Promise((resolve) => {
		const server = app.listen(0, '127.0.0.1', () => resolve(server));
	});
};
const send = (server, p, form) =>
	fetch(`http://127.0.0.1:${server.address().port}${p}`, { method: 'POST', body: form });
const blob = (bytes, type = 'application/octet-stream') => new Blob([bytes], { type });
const echo = (req, res) =>
	res.json({
		body: req.body,
		kinds: Object.keys(collectByKind(req.files)),
		single: req.file?.originalname ?? null,
	});

test('multipart: files[<kind>] đủ loại ⇒ qua, data (JSON) thành body; file tạm bị xóa nếu không chuyển đi', async () => {
	const server = await startApp(echo);
	const form = new FormData();
	form.append('data', JSON.stringify({ source: 'external', course_id: 'KH1' }));
	form.append('files[national_id]', blob(PDF), 'cccd.pdf');
	form.append('files[degree]', blob(JPG), 'bang.jpg');
	form.append('files[license]', blob(PNG), 'cchn.png');
	form.append('files[decision]', blob(PDF), 'qd.pdf');
	const res = await send(server, '/form', form);
	server.close();
	assert.equal(res.status, 200, await res.clone().text());
	const out = await res.json();
	assert.deepEqual(out.body, { source: 'external', course_id: 'KH1' });
	assert.deepEqual(out.kinds.sort(), ['degree', 'decision', 'license', 'national_id'].sort());
	await waitCleanup();
	assert.deepEqual(tmpFiles(), []);
});

test('đuôi .docx ⇒ 400 "Hồ sơ chỉ nhận file PDF, JPG hoặc PNG." dù Cấu hình hệ thống cho phép .docx', async () => {
	settings.UPLOAD_ALLOWED_EXTENSIONS = '.pdf,.docx,.doc';
	const server = await startApp(echo);
	const form = new FormData();
	form.append('data', '{}');
	form.append('files[national_id]', blob(Buffer.from('PK\x03\x04xxxx')), 'cccd.docx');
	const res = await send(server, '/form', form);
	server.close();
	assert.equal(res.status, 400);
	assert.equal((await res.json()).message, 'Hồ sơ chỉ nhận file PDF, JPG hoặc PNG.');
	await waitCleanup();
	assert.deepEqual(tmpFiles(), []);
	delete settings.UPLOAD_ALLOWED_EXTENSIONS;
});

test('jpg / jpeg / png được nhận dù Cấu hình hệ thống mặc định không có các đuôi này', async () => {
	settings.UPLOAD_ALLOWED_EXTENSIONS = '.pdf';
	const server = await startApp(echo);
	const form = new FormData();
	form.append('data', '{}');
	form.append('files[degree]', blob(JPG), 'bang.JPEG');
	form.append('files[license]', blob(PNG), 'cchn.PNG');
	const res = await send(server, '/form', form);
	server.close();
	assert.equal(res.status, 200, await res.clone().text());
	delete settings.UPLOAD_ALLOWED_EXTENSIONS;
	await waitCleanup();
});

test('2 file cùng files[degree] / tên phần lạ / quá 4 file ⇒ 400 "Mỗi loại hồ sơ chỉ nhận 1 file…"', async () => {
	const ONE = 'Mỗi loại hồ sơ chỉ nhận 1 file, đính kèm đúng ô đã quy định.';
	const server = await startApp(echo);
	// 2 file cùng loại
	let form = new FormData();
	form.append('data', '{}');
	form.append('files[degree]', blob(PDF), 'a.pdf');
	form.append('files[degree]', blob(PDF), 'b.pdf');
	let res = await send(server, '/form', form);
	assert.equal(res.status, 400);
	assert.equal((await res.json()).message, ONE);
	// Tên phần lạ (kể cả phần `files` dạng mảng cũ)
	for (const name of ['files', 'files[dossier]', 'files[khac]', 'file']) {
		form = new FormData();
		form.append('data', '{}');
		form.append(name, blob(PDF), 'a.pdf');
		res = await send(server, '/form', form);
		assert.equal(res.status, 400, name);
		assert.equal((await res.json()).message, ONE, name);
	}
	// Quá 4 file
	form = new FormData();
	form.append('data', '{}');
	for (const k of UPLOADABLE_KINDS) form.append(FORM_FIELD(k), blob(PDF), `${k}.pdf`);
	res = await send(server, '/form', form);
	assert.equal(res.status, 400, '6 file');
	assert.equal((await res.json()).message, ONE);
	server.close();
	await waitCleanup();
	assert.deepEqual(tmpFiles(), [], 'file đã ghi trước khi bị từ chối cũng bị xóa');
});

test('nội dung không khớp đuôi (.jpg nhưng là PDF) ⇒ 400 của secureUpload; file tạm bị xóa', async () => {
	const server = await startApp(echo);
	const form = new FormData();
	form.append('data', '{}');
	form.append('files[degree]', blob(PDF), 'bang.jpg');
	const res = await send(server, '/form', form);
	server.close();
	assert.equal(res.status, 400);
	assert.match((await res.json()).message, /có nội dung không đúng định dạng \.jpg/);
	await waitCleanup();
	assert.deepEqual(tmpFiles(), []);
});

test('file quá dung lượng UPLOAD_MAX_MB ⇒ 400 "Mỗi file tối đa …MB"', async () => {
	settings.UPLOAD_MAX_MB = '1';
	const server = await startApp(echo);
	const form = new FormData();
	form.append('data', '{}');
	form.append('files[degree]', blob(Buffer.concat([PDF, Buffer.alloc(1_200_000)])), 'bang.pdf');
	const res = await send(server, '/form', form);
	server.close();
	assert.equal(res.status, 400);
	assert.equal((await res.json()).message, 'Mỗi file tối đa 1MB');
	delete settings.UPLOAD_MAX_MB;
	await waitCleanup();
	assert.deepEqual(tmpFiles(), []);
});

test('file đã chuyển sang thư mục chính thức thì còn nguyên; file chưa chuyển bị xóa khi trả response', async () => {
	const dest = path.join(root, 'training', 'course_registration', 'E1');
	const server = await startApp(async (req, res) => {
		const byKind = collectByKind(req.files);
		await moveUploadedFiles([byKind.application_signed], dest); // chỉ chuyển 1 trong 2
		res.json({ ok: true });
	});
	const form = new FormData();
	form.append('data', '{}');
	form.append('files[application_signed]', blob(PDF), 'don.pdf');
	form.append('files[proposal_approved]', blob(JPG), 'tt.jpg');
	const res = await send(server, '/form', form);
	server.close();
	assert.equal(res.status, 200);
	await waitCleanup();
	assert.equal(fs.readdirSync(dest).length, 1);
	assert.deepEqual(tmpFiles(), []);
});

test('lỗi sau khi nhận file (service từ chối) ⇒ file tạm vẫn bị xóa', async () => {
	const server = await startApp((_req, res) => res.status(400).json({ message: 'từ chối' }));
	const form = new FormData();
	form.append('data', '{}');
	form.append('files[national_id]', blob(PDF), 'cccd.pdf');
	const res = await send(server, '/form', form);
	server.close();
	assert.equal(res.status, 400);
	await waitCleanup();
	assert.deepEqual(tmpFiles(), []);
});

test('data không phải JSON object ⇒ 400 "Dữ liệu đăng ký không hợp lệ"', async () => {
	const server = await startApp(echo);
	for (const data of ['rác', '[1,2]', 'null']) {
		const form = new FormData();
		form.append('data', data);
		form.append('files[degree]', blob(PDF), 'a.pdf');
		const res = await send(server, '/form', form);
		assert.equal(res.status, 400, data);
		assert.equal((await res.json()).message, 'Dữ liệu đăng ký không hợp lệ', data);
	}
	server.close();
	await waitCleanup();
	assert.deepEqual(tmpFiles(), []);
});

test('request JSON thường (không multipart) đi thẳng qua, không có file', async () => {
	const server = await startApp(echo);
	const res = await fetch(`http://127.0.0.1:${server.address().port}/form`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ source: 'internal' }),
	});
	server.close();
	assert.equal(res.status, 200);
	const out = await res.json();
	assert.deepEqual(out.body, { source: 'internal' });
	assert.deepEqual(out.kinds, []);
});

test('nộp 1 file (field `file`): nhận 1 file; thêm file / tên phần lạ ⇒ 400; đuôi sai ⇒ 400', async () => {
	const server = await startApp(echo);
	let form = new FormData();
	form.append('data', JSON.stringify({ email: 'a@b.vn' }));
	form.append('file', blob(PNG), 'don-ky.png');
	let res = await send(server, '/one', form);
	assert.equal(res.status, 200, await res.clone().text());
	const out = await res.json();
	assert.equal(out.single, 'don-ky.png');
	assert.deepEqual(out.body, { email: 'a@b.vn' });

	form = new FormData();
	form.append('data', '{}');
	form.append('file', blob(PDF), 'a.pdf');
	form.append('file', blob(PDF), 'b.pdf');
	res = await send(server, '/one', form);
	assert.equal(res.status, 400);
	assert.equal(
		(await res.json()).message,
		'Mỗi loại hồ sơ chỉ nhận 1 file, đính kèm đúng ô đã quy định.',
	);

	form = new FormData();
	form.append('data', '{}');
	form.append('files[degree]', blob(PDF), 'a.pdf');
	res = await send(server, '/one', form);
	assert.equal(res.status, 400);

	form = new FormData();
	form.append('data', '{}');
	form.append('file', blob(PDF), 'a.txt');
	res = await send(server, '/one', form);
	assert.equal(res.status, 400);
	assert.equal((await res.json()).message, 'Hồ sơ chỉ nhận file PDF, JPG hoặc PNG.');
	server.close();
	await waitCleanup();
	assert.deepEqual(tmpFiles(), []);
});

test.after(() => fs.rmSync(root, { recursive: true, force: true }));
