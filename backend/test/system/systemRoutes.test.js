// Route hệ thống (modules/system): /health không lộ chi tiết lỗi CSDL, nhận báo cáo
// CSP (che URL bí mật, cắt độ dài, tối đa 10 báo cáo, giới hạn kích thước/tần suất),
// /modules và /modules/menus, /excel/build và /excel/parse. Mỗi router chạy trên
// express riêng, bỏ qua xác thực thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const ExcelJS = require('exceljs');
const { install } = require('../auth/fakeDb');

const authPath = require.resolve('../../src/middlewares/auth');
require.cache[authPath] = {
	id: authPath,
	filename: authPath,
	loaded: true,
	exports: { authenticate: (_req, _res, next) => next() },
};

let dbDown = false;
install(async () => {
	if (dbDown)
		throw Object.assign(
			new Error('password authentication failed for user "rms_app" at db-prod:5432'),
			{ code: 'ELOGIN' },
		);
	return [{ ok: 1 }];
});

const logger = require('../../src/config/logger');
const logs = [];
logger.warn = (...a) => logs.push(['warn', a.join(' ')]);
logger.error = (...a) => logs.push(['error', a.join(' ')]);

const settings = require('../../src/modules/settings/systemSettingService');
let flags = {};
settings.getValue = async (key, def) => (key in flags ? flags[key] : def);

const mount = (path, router, pre = []) => {
	const app = express();
	app.set('trust proxy', false);
	for (const p of pre) app.use(p);
	app.use(path, router);
	app.use((err, _req, res, _next) =>
		res.status(err.statusCode || err.status || 500).json({ message: err.message }),
	);
	return app;
};
const withServer = async (app, fn) => {
	const srv = app.listen(0, '127.0.0.1');
	await new Promise((r) => srv.once('listening', r));
	try {
		await fn(`http://127.0.0.1:${srv.address().port}`);
	} finally {
		srv.closeAllConnections();
		srv.close();
	}
};

const health = mount('/health', require('../../src/modules/system/health.routes'));
const csp = mount('/csp-report', require('../../src/modules/system/cspReport.routes'));
const modules = mount('/modules', require('../../src/modules/system/modules.routes'));
const excel = mount('/excel', require('../../src/modules/system/excel.routes'), [
	express.json({ limit: '2mb' }),
]);

test('GET /health: trạng thái ok, uptime dạng "Xd Xh Xm Xs", version theo GIT_SHA', async () => {
	process.env.GIT_SHA = 'abc1234';
	await withServer(health, async (base) => {
		const j = await (await fetch(`${base}/health`)).json();
		assert.equal(j.status, 'ok');
		assert.equal(j.version, 'abc1234');
		assert.match(j.uptime.formatted, /^\d+d \d+h \d+m \d+s$/);
		assert.match(j.memory.heapUsed, /^\d+(\.\d+)? (B|KB|MB|GB)$/);
	});
	delete process.env.GIT_SHA;
});

test('GET /health/db: kết nối được ⇒ 200 kèm độ trễ; lỗi ⇒ 503 không lộ thông báo lỗi, chỉ ghi log', async () => {
	await withServer(health, async (base) => {
		dbDown = false;
		const ok = await fetch(`${base}/health/db`);
		assert.equal(ok.status, 200);
		const j = await ok.json();
		assert.equal(j.status, 'connected');
		assert.equal(typeof j.latencyMs, 'number');

		dbDown = true;
		logs.length = 0;
		const bad = await fetch(`${base}/health/db`);
		assert.equal(bad.status, 503);
		const text = await bad.text();
		assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['status', 'success', 'timestamp']);
		assert.ok(!/rms_app|db-prod|password|ELOGIN/.test(text), 'không lộ tên login / máy chủ');
		assert.match(logs[0][1], /ELOGIN/);
	});
	dbDown = false;
});

const postCsp = (base, body, type = 'application/csp-report') =>
	fetch(`${base}/csp-report`, {
		method: 'POST',
		headers: { 'content-type': type },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	});

test('POST /csp-report: dạng report-uri và Reporting API ⇒ 204, ghi log các trường cần thiết, che query bí mật', async () => {
	await withServer(csp, async (base) => {
		logs.length = 0;
		const r1 = await postCsp(base, {
			'csp-report': {
				'violated-directive': 'script-src',
				'blocked-uri': 'https://evil.example/x.js',
				'document-uri': 'https://rms.example/dang-nhap?token=SECRETTOKEN123',
				'line-number': '42',
				'original-policy': 'rất dài, không cần log',
			},
		});
		assert.equal(r1.status, 204);
		const r2 = await postCsp(
			base,
			[
				{
					type: 'csp-violation',
					body: {
						effectiveDirective: 'img-src',
						blockedURL: 'data',
						documentURL: 'https://rms.example/',
					},
				},
			],
			'application/reports+json',
		);
		assert.equal(r2.status, 204);

		assert.equal(logs.length, 2);
		const first = JSON.parse(logs[0][1].replace('[CSP] vi phạm ', ''));
		assert.equal(first.directive, 'script-src');
		assert.equal(first.line, 42);
		assert.ok(!logs[0][1].includes('SECRETTOKEN123'), 'không ghi token trong URL');
		assert.ok(!logs[0][1].includes('original-policy') && !logs[0][1].includes('rất dài'));
		assert.match(logs[1][1], /"directive":"img-src"/);
	});
});

test('POST /csp-report: tối đa 10 báo cáo / lần, cắt chuỗi 300 ký tự, bỏ phần tử rác', async () => {
	await withServer(csp, async (base) => {
		logs.length = 0;
		const many = [
			null,
			'chuỗi',
			5,
			...Array.from({ length: 12 }, () => ({ 'violated-directive': 'x'.repeat(400) })),
		];
		assert.equal((await postCsp(base, many, 'application/json')).status, 204);
		// 3 phần tử rác nằm trong 10 phần tử đầu ⇒ còn 7 dòng log
		assert.equal(logs.length, 7);
		assert.equal(JSON.parse(logs[0][1].replace('[CSP] vi phạm ', '')).directive.length, 300);
	});
});

test('POST /csp-report: body > 16kb ⇒ 413; content-type khác ⇒ bỏ qua, vẫn 204', async () => {
	await withServer(csp, async (base) => {
		logs.length = 0;
		const big = await postCsp(base, { 'csp-report': { 'blocked-uri': 'x'.repeat(20000) } });
		assert.equal(big.status, 413);
		const plain = await postCsp(base, 'hello', 'text/plain');
		assert.equal(plain.status, 204);
		assert.equal(logs.filter((l) => l[0] === 'warn').length, 0);
	});
});

test('POST /csp-report: quá 100 báo cáo / 15 phút từ 1 địa chỉ ⇒ 429 rỗng', async () => {
	await withServer(csp, async (base) => {
		let last;
		for (let i = 0; i < 101; i++) last = await postCsp(base, { 'csp-report': {} });
		assert.equal(last.status, 429);
		assert.equal(await last.text(), '');
	});
});

test('GET /modules: khóa viết thường; ATTENDANCE mặc định tắt, module khác mặc định bật', async () => {
	await withServer(modules, async (base) => {
		flags = {};
		let j = await (await fetch(`${base}/modules`)).json();
		assert.deepEqual(j.data, {
			research: true,
			training: true,
			seminar: true,
			survey: true,
			attendance: false,
		});
		flags = { MODULE_TRAINING: 'false', MODULE_ATTENDANCE: 'true' };
		j = await (await fetch(`${base}/modules`)).json();
		assert.equal(j.data.training, false);
		assert.equal(j.data.attendance, true);
	});
	flags = {};
});

test('GET /modules/menus: tách danh sách mục ẩn theo cổng, bỏ khoảng trắng / mục rỗng', async () => {
	await withServer(modules, async (base) => {
		flags = { MENU_HIDDEN_ADMIN: ' surveys, ,reports ,', MENU_HIDDEN_TRAINEE: null };
		const j = await (await fetch(`${base}/modules/menus`)).json();
		assert.deepEqual(j.data, { admin: ['surveys', 'reports'], user: [], trainee: [] });
	});
	flags = {};
});

const build = (base, body) =>
	fetch(`${base}/excel/build`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});

test('POST /excel/build: cột không hợp lệ / quá 60 cột / rows không phải mảng ⇒ 400', async () => {
	await withServer(excel, async (base) => {
		for (const body of [
			{},
			{ headers: [] },
			{ headers: 'a,b' },
			{ headers: Array(61).fill('c') },
			{ headers: ['a'], rows: 'x' },
		])
			assert.equal((await build(base, body)).status, 400, JSON.stringify(body).slice(0, 40));
	});
});

test('POST /excel/build: tên file / sheet an toàn, số giữ kiểu số, ô thừa bị cắt, null ⇒ rỗng', async () => {
	await withServer(excel, async (base) => {
		const res = await build(base, {
			fileName: '../../etc/passwd "x"\r\n',
			sheetName: 'Danh sách: nhân viên/khoa [2026]?*-quá-ba-mươi-mốt',
			headers: ['Mã', 'Tên', 'Điểm'],
			rows: [
				['NV1', '=HYPERLINK("http://evil")', 9.5, 'thừa'],
				['NV2', null, 0],
				'không phải mảng',
			],
		});
		assert.equal(res.status, 200);
		const cd = res.headers.get('content-disposition');
		// "/" "\" dấu nháy và xuống dòng bị thay ⇒ không chèn header / không thoát thư mục
		assert.ok(!/[\r\n"/\\]/.test(decodeURIComponent(cd.split("''")[1])), cd);
		assert.ok(cd.endsWith('.xlsx'));

		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
		const ws = wb.worksheets[0];
		assert.ok(ws.name.length <= 31 && !/[:\\/?*[\]]/.test(ws.name), ws.name);
		assert.deepEqual(ws.getRow(1).values.slice(1), ['Mã', 'Tên', 'Điểm']);
		const r2 = ws.getRow(2);
		assert.equal(r2.getCell(3).value, 9.5);
		assert.equal(r2.getCell(4).value, null, 'cột thừa bị cắt');
		assert.equal(
			r2.getCell(2).value,
			'=HYPERLINK("http://evil")',
			'chuỗi "=..." là chữ, không thành công thức',
		);
		assert.equal(ws.getRow(3).getCell(2).value ?? '', '', 'null ⇒ ô trống');
		assert.equal(ws.getRow(3).getCell(3).value, 0);
		const all = [];
		ws.eachRow((r) => r.eachCell((c) => all.push(c.value)));
		assert.ok(!all.includes('không phải mảng'), 'dòng không phải mảng ⇒ dòng trống');
	});
});

const upload = async (base, buf, name = 'a.xlsx') => {
	const fd = new FormData();
	if (buf) fd.append('file', new Blob([buf]), name);
	return fetch(`${base}/excel/parse`, { method: 'POST', body: fd });
};

test('POST /excel/parse: chưa chọn file / không phải .xlsx ⇒ 400', async () => {
	await withServer(excel, async (base) => {
		assert.equal((await upload(base, null)).status, 400);
		assert.equal((await upload(base, Buffer.from('a,b\n1,2'), 'a.csv')).status, 400);
		assert.equal((await upload(base, Buffer.from('không phải zip'), 'gia.xlsx')).status, 400);
	});
});

test('POST /excel/parse: sheet đầu thành bảng chữ, ô ngày ⇒ dd/mm/yyyy', async () => {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('S1');
	ws.addRow(['Họ tên', 'Ngày sinh', 'Tuổi']);
	ws.addRow(['An', new Date(Date.UTC(1990, 4, 7)), 36]);
	wb.addWorksheet('S2').addRow(['bỏ qua']);
	const buf = Buffer.from(await wb.xlsx.writeBuffer());
	await withServer(excel, async (base) => {
		const res = await upload(base, buf);
		assert.equal(res.status, 200);
		const { data } = await res.json();
		assert.deepEqual(data.rows, [
			['Họ tên', 'Ngày sinh', 'Tuổi'],
			['An', '07/05/1990', '36'],
		]);
	});
});
