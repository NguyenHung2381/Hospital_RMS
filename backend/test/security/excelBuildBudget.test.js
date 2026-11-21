// M-02: POST /excel/build phải có trần kích thước body riêng (đặt trước express.json toàn cục)
// và ngân sách tổng số ô; trong ngân sách thì vẫn trả file xlsx hợp lệ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');
const ExcelJS = require('exceljs');

// Bỏ qua xác thực thật — chỉ kiểm giới hạn của route
const authPath = require.resolve('../../src/middlewares/auth');
require.cache[authPath] = {
	id: authPath,
	filename: authPath,
	loaded: true,
	exports: { authenticate: (_req, _res, next) => next() },
};
const excelRouter = require('../../src/modules/system/excel.routes');

const withServer = async (fn) => {
	const app = express();
	// Cùng thứ tự mount như app.js
	app.use('/api/v1/excel', express.json({ limit: '2mb' }));
	app.use(express.json({ limit: '10mb' }));
	app.use('/api/v1/excel', excelRouter);
	app.use((err, _req, res, _next) =>
		res.status(err.statusCode || err.status || 500).json({ m: err.message }),
	);
	const server = app.listen(0);
	try {
		await fn(`http://127.0.0.1:${server.address().port}/api/v1/excel/build`);
	} finally {
		server.closeAllConnections();
		server.close();
	}
};
const post = (url, body) =>
	fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});

test('app.js: parser /excel nhỏ đứng trước express.json toàn cục', () => {
	const src = fs.readFileSync(path.join(__dirname, '../../src/app.js'), 'utf8');
	const small = src.indexOf("'/api/v1/excel', express.json({ limit: '2mb' })");
	const global = src.indexOf("express.json({ limit: '10mb' })");
	assert.ok(small > 0 && global > small);
});

test('build: body > 2 MB bị từ chối 413 trước khi dựng workbook', async () => {
	await withServer(async (url) => {
		const rows = Array.from({ length: 3000 }, () => ['x'.repeat(1000)]);
		const r = await post(url, { headers: ['a'], rows });
		assert.equal(r.status, 413);
	});
});

test('build: vượt ngân sách ô (50000 dòng × 60 cột) → 400', async () => {
	await withServer(async (url) => {
		const r = await post(url, {
			headers: Array.from({ length: 60 }, (_, i) => `c${i}`),
			rows: Array.from({ length: 50000 }, () => []),
		});
		assert.equal(r.status, 400);
	});
});

test('build: trong ngân sách vẫn trả xlsx đọc lại được', async () => {
	await withServer(async (url) => {
		const r = await post(url, {
			fileName: 'thu',
			sheetName: 'S/1',
			headers: ['Tên', 'Số'],
			rows: [['A', 1], ['B', 2], ['C']],
		});
		assert.equal(r.status, 200);
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(Buffer.from(await r.arrayBuffer()));
		const ws = wb.worksheets[0];
		assert.equal(ws.name, 'S 1');
		assert.equal(ws.getCell('A1').value, 'Tên');
		assert.equal(ws.getCell('B3').value, 2);
		assert.equal(ws.getCell('A4').value, 'C');
	});
});
