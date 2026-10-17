// Luồng upload thật qua Express + multer + secureUpload: file sai nội dung bị
// xoá và báo lỗi, hạn mức/ngày, quét virus bằng clamd giả lập (TCP).
const os = require('os');
const path = require('path');
const fs = require('fs');
const net = require('net');
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-upload-'));
process.env.UPLOAD_DAILY_QUOTA_MB = '1';
delete process.env.CLAMAV_HOST;

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
require('../../src/services/securityEventService').log = async () => {};
// Cấu hình hệ thống giả (không cần DB) — test đổi được giữa chừng
const settings = {};
require('../../src/modules/settings/systemSettingService').getValue = async (key) => settings[key];
const upload = require('../../src/middlewares/upload');
const uploadExcel = require('../../src/middlewares/uploadExcel');
const { errorHandler } = require('../../src/middlewares/errorHandler');

let userId = 'U1';
const app = express();
app.use((req, _res, next) => {
	req.user = { id: userId };
	next();
});
app.post('/t/:topic_id/files', upload.array('files', 30), (req, res) =>
	res.json({ saved: req.files.map((f) => path.basename(f.path)) }),
);
app.post('/import', uploadExcel.single('file'), (req, res) => res.json({ size: req.file.buffer.length }));
app.use(errorHandler);
const server = app.listen(0);
const base = () => `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n');
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);

const send = (url, files) => {
	const form = new FormData();
	for (const [field, name, content] of files) form.append(field, new Blob([content]), name);
	return fetch(base() + url, { method: 'POST', body: form });
};
const topicDir = (id) => path.join(process.env.UPLOADS_DIR, 'topics', id);

test('PDF thật được lưu', async () => {
	const res = await send('/t/DT1/files', [['files', 'bao-cao.pdf', PDF]]);
	assert.equal(res.status, 200);
	assert.equal((await res.json()).saved.length, 1);
});

test('exe đổi đuôi thành .pdf: bị từ chối, KHÔNG còn file nào trên đĩa (kể cả file hợp lệ cùng lượt)', async () => {
	const res = await send('/t/DT2/files', [
		['files', 'ok.pdf', PDF],
		['files', 'virus.pdf', EXE],
	]);
	assert.equal(res.status, 400);
	assert.match((await res.json()).message, /virus\.pdf.*không đúng định dạng/);
	assert.deepEqual(fs.readdirSync(topicDir('DT2')), []);
});

test('đuôi không được phép (.html) bị chặn ngay ở bộ lọc', async () => {
	const res = await send('/t/DT3/files', [['files', 'x.html', Buffer.from('<script>')]]);
	assert.equal(res.status, 400);
});

test('import Excel: file không phải .xlsx thật bị từ chối', async () => {
	assert.equal((await send('/import', [['file', 'data.xlsx', Buffer.from('a,b,c\n')]])).status, 400);
	assert.equal((await send('/import', [['file', 'data.csv', Buffer.from('a,b')]])).status, 400);
	const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(30)]);
	assert.equal((await send('/import', [['file', 'data.xlsx', zip]])).status, 200);
});

test('vượt hạn mức dung lượng/ngày thì bị chặn (429)', async () => {
	// Hạn mức đếm theo ngày trên Redis thật (nếu có) — id riêng mỗi lượt chạy,
	// không thì lượt chạy thứ 2 trong ngày cộng dồn dung lượng của lượt trước.
	userId = `U-QUOTA-${Date.now()}`;
	const big = Buffer.concat([PDF, Buffer.alloc(700 * 1024)]);
	assert.equal((await send('/t/DT4/files', [['files', 'a.pdf', big]])).status, 200);
	assert.equal((await send('/t/DT4/files', [['files', 'b.pdf', big]])).status, 429);
	userId = 'U1';
});

// clamd giả: đọc lệnh INSTREAM, trả OK hoặc FOUND nếu nội dung có chuỗi EICAR
const fakeClamd = () =>
	new Promise((resolve) => {
		const srv = net.createServer((sock) => {
			let data = Buffer.alloc(0);
			sock.on('data', (d) => {
				data = Buffer.concat([data, d]);
				if (data.subarray(-4).equals(Buffer.alloc(4))) {
					const infected = data.includes(Buffer.from('EICAR-TEST'));
					sock.end(infected ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
				}
			});
		});
		srv.listen(0, '127.0.0.1', () => resolve(srv));
	});

test('ClamAV: file sạch qua, file nhiễm bị chặn (422) và xoá', async () => {
	const clamd = await fakeClamd();
	process.env.CLAMAV_HOST = '127.0.0.1';
	process.env.CLAMAV_PORT = String(clamd.address().port);
	try {
		assert.equal((await send('/t/DT5/files', [['files', 'sach.pdf', PDF]])).status, 200);
		const infected = Buffer.concat([PDF, Buffer.from('EICAR-TEST')]);
		const res = await send('/t/DT6/files', [['files', 'nhiem.pdf', infected]]);
		assert.equal(res.status, 422);
		assert.deepEqual(fs.readdirSync(topicDir('DT6')), []);
	} finally {
		clamd.close();
		delete process.env.CLAMAV_HOST;
	}
});

test('ClamAV bật nhưng không kết nối được: từ chối (503), không lặng lẽ bỏ qua', async () => {
	process.env.CLAMAV_HOST = '127.0.0.1';
	process.env.CLAMAV_PORT = '1'; // không có gì lắng nghe
	try {
		const res = await send('/t/DT7/files', [['files', 'a.pdf', PDF]]);
		assert.equal(res.status, 503);
		assert.deepEqual(fs.readdirSync(topicDir('DT7')), []);
	} finally {
		delete process.env.CLAMAV_HOST;
	}
});

test('mặc định chỉ nhận PDF/Word/Excel/PowerPoint/RAR/ZIP — ảnh .png bị chặn', async () => {
	const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
	const res = await send('/t/DT5/files', [['files', 'a.png', PNG]]);
	assert.equal(res.status, 400);
	assert.match((await res.json()).message, /Chỉ nhận: .*\.rar/);
	settings.UPLOAD_ALLOWED_EXTENSIONS = 'pdf, png';
	assert.equal((await send('/t/DT5/files', [['files', 'a.png', PNG]])).status, 200);
	assert.equal((await send('/t/DT5/files', [['files', 'a.docx', Buffer.from('PK')]])).status, 400);
	delete settings.UPLOAD_ALLOWED_EXTENSIONS;
});

test('vượt UPLOAD_MAX_MB trong Cấu hình hệ thống: 400 kèm giới hạn, không lưu file', async () => {
	settings.UPLOAD_MAX_MB = '1';
	process.env.UPLOAD_DAILY_QUOTA_MB = '0'; // hạn mức/ngày 1MB của test chặn trước
	const big = Buffer.concat([PDF, Buffer.alloc(1100 * 1024)]);
	const res = await send('/t/DT6/files', [['files', 'big.pdf', big]]);
	assert.equal(res.status, 400);
	assert.match((await res.json()).message, /tối đa 1MB/);
	assert.deepEqual(fs.existsSync(topicDir('DT6')) ? fs.readdirSync(topicDir('DT6')) : [], []);
	delete settings.UPLOAD_MAX_MB;
	process.env.UPLOAD_DAILY_QUOTA_MB = '1';
});

test('validateSetting: chặn định dạng ngoài tập an toàn và dung lượng sai', () => {
	const { validateSetting } = require('../../src/utils/uploadPolicy');
	assert.equal(validateSetting('UPLOAD_ALLOWED_EXTENSIONS', '.pdf,docx,RAR'), null);
	assert.match(validateSetting('UPLOAD_ALLOWED_EXTENSIONS', 'pdf,html,exe'), /\.html, \.exe/);
	assert.equal(validateSetting('UPLOAD_MAX_MB', '100'), null);
	assert.ok(validateSetting('UPLOAD_MAX_MB', '0'));
	assert.ok(validateSetting('UPLOAD_MAX_MB', 'abc'));
});
