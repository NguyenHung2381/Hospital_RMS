// Nhật ký hoạt động của cổng đăng ký ĐTLT công khai (utils/logRedact.js + activityLogger):
//   - M-04: upload bị từ chối ⇒ field multipart `data` (chuỗi JSON có CCCD, ngày sinh, SĐT)
//     vẫn còn nguyên trong req.body — log phải che cả JSON lồng trong chuỗi;
//   - M-05: mã đăng ký (trên đường dẫn) và email yếu tố thứ hai không được ở lại log.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// UPLOADS_DIR phải đặt trước khi require middleware upload (đọc lúc nạp module)
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-reg-log-'));
process.env.UPLOADS_DIR = root;
const express = require('express');
require('../../src/modules/settings/systemSettingService').getValue = async () => undefined;
const auditLogger = require('../../src/config/auditLogger');
const lines = [];
auditLogger.info = (obj) => lines.push(obj);
const activityLogger = require('../../src/middlewares/activityLogger');
const {
	registrationFormUpload,
	registrationFileUpload,
} = require('../../src/modules/training/registration/registrationUpload');
const { redactBody, redactActivityRecord } = require('../../src/utils/logRedact');

const CCCD = '001099000001';
const DOB = '1999-01-01';
const PHONE = '0900000001';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

const startApp = () => {
	const app = express();
	app.use(express.json());
	app.use(activityLogger);
	app.post('/api/v1/public/course-registration', registrationFormUpload, (req, res) =>
		res.json({ ok: true }),
	);
	app.post(
		'/api/v1/public/course-registration/:code/files/:kind',
		registrationFileUpload,
		(req, res) => res.json({ ok: true }),
	);
	app.use((err, _req, res, _next) =>
		res.status(err.statusCode || 500).json({ message: err.message }),
	);
	return new Promise((resolve) => {
		const server = app.listen(0, '127.0.0.1', () => resolve(server));
	});
};
const send = (server, p, form) =>
	fetch(`http://127.0.0.1:${server.address().port}${p}`, { method: 'POST', body: form });
const waitLog = () => new Promise((r) => setTimeout(r, 60));
const assertNoPii = (text, label) => {
	for (const v of [CCCD, DOB, PHONE]) assert.ok(!text.includes(v), `${label}: còn ${v}`);
};

test('M-04: đăng ký công khai bị từ chối file (nội dung không khớp đuôi) ⇒ log không còn CCCD/ngày sinh/SĐT', async () => {
	lines.length = 0;
	const server = await startApp();
	const form = new FormData();
	form.append(
		'data',
		JSON.stringify({
			source: 'external',
			full_name: 'Nguyen Van Dummy',
			course_id: 'KH1',
			national_id: CCCD,
			dob: DOB,
			phone: PHONE,
		}),
	);
	form.append('files[degree]', new Blob([PDF]), 'bang.jpg');
	const res = await send(server, '/api/v1/public/course-registration', form);
	await waitLog();
	server.close();
	assert.equal(res.status, 400);
	assert.equal(lines.length, 1);
	assertNoPii(JSON.stringify(lines[0]), 'log');
	const data = JSON.parse(JSON.parse(lines[0].body).data);
	assert.equal(data.national_id, '[hidden]');
	assert.equal(data.course_id, 'KH1', 'trường thường vẫn giữ');
});

test('M-04: nộp file hồ sơ bị từ chối (đuôi .docx) ⇒ yếu tố CCCD trong `data` bị che', async () => {
	lines.length = 0;
	const server = await startApp();
	const form = new FormData();
	form.append('data', JSON.stringify({ national_id: CCCD }));
	form.append('file', new Blob([PDF]), 'x.docx');
	const res = await send(
		server,
		'/api/v1/public/course-registration/DKABCDEFGHJK/files/degree',
		form,
	);
	await waitLog();
	server.close();
	assert.equal(res.status, 400);
	assertNoPii(JSON.stringify(lines[0]), 'log');
});

test('M-04: redactBody che JSON lồng trong chuỗi; chuỗi không có gì phải che giữ nguyên', () => {
	const out = redactBody({ data: JSON.stringify({ a: 1, nested: { phone: PHONE } }) });
	assert.deepEqual(JSON.parse(out.data), { a: 1, nested: { phone: '[hidden]' } });
	const plain = '{ "a": 1 }';
	assert.equal(redactBody({ data: plain }).data, plain);
	assert.equal(redactBody({ note: '{không phải json' }).note, '{không phải json');
});

test('M-04: che lại log cũ có `data` dạng chuỗi JSON — cả khi body bị cắt ngắn', () => {
	const rec = redactActivityRecord({
		stream: 'audit',
		path: '/api/v1/topics',
		body: JSON.stringify({ data: JSON.stringify({ national_id: CCCD, dob: DOB, phone: PHONE }) }),
	});
	assertNoPii(rec.body, 'body parse được');

	const cut = JSON.stringify({
		data: JSON.stringify({ national_id: CCCD, dob: DOB, phone: PHONE, note: 'x'.repeat(50) }),
	}).slice(0, 120);
	const out = redactActivityRecord({ stream: 'audit', path: '/api/v1/topics', body: `${cut}…` });
	assertNoPii(out.body, 'body bị cắt');
});

test('M-04: script redact-activity-logs làm sạch dòng log cũ có `data` chứa CCCD', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-logs-m04-'));
	const leak = JSON.stringify({
		stream: 'audit',
		path: '/api/v1/public/course-registration',
		body: JSON.stringify({ data: JSON.stringify({ national_id: CCCD, dob: DOB, phone: PHONE }) }),
	});
	const file = path.join(dir, 'audit.2026-10-01.1.log');
	fs.writeFileSync(file, `${leak}\n`);
	execFileSync(
		process.execPath,
		[path.join(__dirname, '../../scripts/redact-activity-logs.js'), '--apply', '--all'],
		{ env: { ...process.env, LOG_DIR: dir }, encoding: 'utf8' },
	);
	assertNoPii(fs.readFileSync(file, 'utf8'), 'file log');
	fs.rmSync(dir, { recursive: true, force: true });
});
