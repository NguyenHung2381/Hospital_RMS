// Trang /activity-logs đọc log qua chỉ mục trong RAM (modules/audit/activityLogIndex.js):
// file đang ghi chỉ đọc phần mới nối thêm, dòng ghi dở để lần sau, file mới (xoay vòng)
// được thêm vào, file bị ghi lại từ đầu / bị xoá thì không còn dữ liệu cũ. Bản đầy đủ
// (body…) của dòng trả về đọc lại từ file.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-audit-'));
process.env.LOG_DIR = dir; // LOG_DIR đọc lúc nạp module ⇒ đặt TRƯỚC khi require
const svc = require('../../src/modules/audit/activityLogService');

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const T0 = Date.parse('2026-11-20T08:00:00.000Z');
let seq = 0;
// 1 dòng audit như auditLogger ghi (ts có phần thập phân như performance.now())
const line = (over = {}) => {
	const ts = T0 + ++seq * 1000 + 0.25;
	return `${JSON.stringify({
		stream: 'audit',
		time: new Date(ts).toISOString(),
		ts,
		method: 'GET',
		path: `/api/v1/topics/DT${seq}`,
		route: '/api/v1/topics/:id',
		status_code: 200,
		duration_ms: 12,
		ip: '10.0.0.5',
		actor_id: 'NV01',
		actor_username: 'nv01',
		actor_name: 'Người Một',
		// activityLogger ghi body dạng chuỗi JSON (đã che trường nhạy cảm)
		body: JSON.stringify({ note: `ghi chú ${seq}` }),
		...over,
	})}\n`;
};
const file = (name) => path.join(dir, name);
const setMtime = (name, ms) => fs.utimesSync(file(name), ms / 1000, ms / 1000);

test('ghi nối thêm: lần sau thấy dòng mới; dòng đang ghi dở chỉ tính khi đủ', async () => {
	fs.writeFileSync(file('audit.2026-11-20.1.log'), line() + line({ method: 'POST' }));
	let r = await svc.getAll({ page: 1 });
	assert.equal(r.total, 2);
	assert.equal(r.data[0].method, 'POST'); // mới nhất trước
	assert.equal(r.data[0].body, JSON.stringify({ note: 'ghi chú 2' })); // bản đầy đủ đọc lại từ file

	const third = line({ status_code: 404 });
	fs.appendFileSync(file('audit.2026-11-20.1.log'), third.slice(0, 40)); // đang ghi dở
	r = await svc.getAll({ page: 1 });
	assert.equal(r.total, 2);

	fs.appendFileSync(file('audit.2026-11-20.1.log'), third.slice(40));
	r = await svc.getAll({ page: 1, status: '4xx' });
	assert.equal(r.total, 1);
	assert.equal(r.data[0].path, '/api/v1/topics/DT3');
	assert.match(r.data[0].summary, /#DT3/);
});

test('xoay vòng: file mới cộng vào, phân trang + thống kê trên cả 2 file', async () => {
	setMtime('audit.2026-11-20.1.log', T0 + 10_000);
	fs.writeFileSync(file('audit.2026-11-21.1.log'), line({ actor_id: 'NV02' }) + line());
	setMtime('audit.2026-11-21.1.log', T0 + 20_000);

	const p1 = await svc.getAll({ page: 1, limit: 2 });
	const p2 = await svc.getAll({ page: 2, limit: 2 });
	const p9 = await svc.getAll({ page: 9, limit: 2 }); // vượt quá → trang cuối
	assert.equal(p1.total, 5);
	assert.equal(p1.total_pages, 3);
	assert.deepEqual(
		[...p1.data, ...p2.data].map((x) => x.path),
		['/api/v1/topics/DT5', '/api/v1/topics/DT4', '/api/v1/topics/DT3', '/api/v1/topics/DT2'],
	);
	assert.equal(p9.page, 3);
	assert.deepEqual(
		p9.data.map((x) => x.path),
		['/api/v1/topics/DT1'],
	);

	const stats = await svc.getStats({ from: T0 });
	assert.equal(stats.totals.requests, 5);
	assert.equal(stats.totals.users, 2);
	assert.equal(stats.totals.errors, 1);
	assert.equal(stats.sessions.length, 2);
	assert.equal(stats.top_users[0].last_at, new Date(T0 + 5000.25).toISOString());

	// Tìm kiếm (đọc bản đầy đủ từ file cho dòng đã qua các bộ lọc khác): theo đường dẫn,
	// theo nội dung gửi lên (body), không phân biệt hoa thường, kết hợp bộ lọc khác
	const paths = async (q) => (await svc.getAll({ page: 1, ...q })).data.map((x) => x.path);
	assert.deepEqual(await paths({ search: 'dt4' }), ['/api/v1/topics/DT4']);
	assert.deepEqual(await paths({ search: 'GHI CHÚ 4' }), ['/api/v1/topics/DT4']);
	assert.deepEqual(await paths({ search: 'ghi chú', method: 'POST' }), ['/api/v1/topics/DT2']);
	assert.deepEqual(await paths({ search: 'không có' }), []);
});

test('tìm kiếm theo lỗi, và body không phải chuỗi không thành "[object Object]"', async () => {
	fs.writeFileSync(
		file('audit.2026-11-22.1.log'),
		line({ status_code: 500, error: 'Mất kết nối CSDL', body: null }) +
			line({ body: { ma_de_tai: 'DTX99' } }),
	);
	setMtime('audit.2026-11-22.1.log', T0 + 25_000);
	const paths = async (search) => (await svc.getAll({ page: 1, search })).data.map((x) => x.path);
	assert.deepEqual(await paths('mất kết nối'), ['/api/v1/topics/DT6']);
	assert.deepEqual(await paths('dtx99'), ['/api/v1/topics/DT7']);
	assert.deepEqual(await paths('object object'), []);
	fs.rmSync(file('audit.2026-11-22.1.log'));
});

test('file bị ghi lại từ đầu / bị xoá: không còn dòng cũ', async () => {
	fs.writeFileSync(file('audit.2026-11-21.1.log'), line({ method: 'DELETE' }));
	setMtime('audit.2026-11-21.1.log', T0 + 30_000);
	let r = await svc.getAll({ page: 1 });
	assert.equal(r.total, 4); // 3 dòng file cũ + 1 dòng file ghi lại
	assert.equal(r.data[0].method, 'DELETE');

	fs.rmSync(file('audit.2026-11-20.1.log'));
	r = await svc.getAll({ page: 1 });
	assert.equal(r.total, 1);

	// Bỏ chỉ mục → dựng lại từ file cho cùng kết quả
	svc._clearIndex();
	assert.equal((await svc.getAll({ page: 1 })).total, 1);
});
