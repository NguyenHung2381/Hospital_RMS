// Thống kê / sổ cấp CME của Hội thảo (seminarStatsService) với CSDL giả: bộ lọc
// bảng tổng hợp, năm mặc định, phân trang sổ CME, chỉnh số cuối của sổ không được
// nhỏ hơn số đã cấp.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');
const db = require('../../src/config/db');

require('../../src/modules/events/eventService').broadcast = () => {};

let maxSeq = 0;
const log = install(async (text) => {
	if (text.includes('MAX(cme_seq)')) return [{ max_seq: maxSeq }];
	if (text.includes('COUNT(*) AS total,')) return [{ total: 3, total_credits: 0 }];
	return [];
});
let sets;
db.queryAll = async (req, statements) => {
	await req.query(statements.join(';\n'));
	return sets;
};
const svc = require('../../src/modules/seminars/seminarStatsService');

test('statsHosted: chỉ hội thảo BV tổ chức; lọc năm / từ ngày / đến ngày qua tham số', async () => {
	log.length = 0;
	await svc.statsHosted();
	assert.match(log[0].text, /WHERE s\.scope = 'hosted'\s+ORDER BY/);

	await svc.statsHosted({ year: '2026', from: '2026-01-01', to: '2026-06-30' });
	const q = log[1];
	assert.match(
		q.text,
		/s\.scope = 'hosted' AND s\.event_year = @year AND s\.start_date >= @from AND s\.start_date <= @to/,
	);
	assert.deepEqual([q.inputs.year, q.inputs.from, q.inputs.to], [2026, '2026-01-01', '2026-06-30']);
	assert.match(q.text, /COALESCE\(s\.manual_participant_count/, 'số nhập tay được ưu tiên');
});

test('statsCme: không truyền năm ⇒ năm hiện tại; chỉ đếm lượt đã cấp số', async () => {
	log.length = 0;
	const r = await svc.statsCme();
	assert.equal(r.year, new Date().getFullYear());
	assert.equal(r.total, 3);
	assert.match(log[0].text, /WHERE cme_year = @year AND cme_seq IS NOT NULL/);
	assert.equal((await svc.statsCme({ year: '2024' })).year, 2024);
});

test('cmeRegister: mặc định lấy hết sổ (limit 0), có phân trang khi truyền limit, tìm kiếm qua tham số', async () => {
	sets = [[{ id: 1 }], [{ total: 1 }], []];
	const all = await svc.cmeRegister({ year: '2025' });
	assert.equal(all.year, 2025);
	assert.equal(all.last_seq, 0, 'chưa có sổ ⇒ 0');
	assert.deepEqual(all.entries, [{ id: 1 }]);
	assert.equal(all.pagination.total, 1);

	sets = [[], [{ total: 40 }], [{ last_seq: 57 }]];
	const p = await svc.cmeRegister({ year: '2025', page: 2, limit: 10, search: "Lan' OR 1=1" });
	assert.equal(p.last_seq, 57);
	assert.deepEqual([p.pagination.page, p.pagination.limit], [2, 10]);
	const q = log.at(-1);
	assert.equal(q.inputs.offset, 10);
	assert.equal(q.inputs.search, "%Lan' OR 1=1%");
	assert.ok(!q.text.includes("Lan'"));
	assert.match(q.text, /ORDER BY p\.cme_seq/);
});

test('updateRegisterSeq: năm / số không hợp lệ ⇒ 400; nhỏ hơn số đã cấp ⇒ 409; hợp lệ ⇒ upsert kèm người sửa', async () => {
	for (const [y, s] of [
		['', 5],
		['abc', 5],
		[2026, -1],
		[2026, 'x'],
	])
		await assert.rejects(svc.updateRegisterSeq(y, s, 'A'), { statusCode: 400 }, `${y}/${s}`);

	maxSeq = 120;
	log.length = 0;
	await assert.rejects(svc.updateRegisterSeq(2026, 119, 'A'), {
		statusCode: 409,
		message: /≥ 120/,
	});
	assert.ok(!log.some((l) => l.text.includes('cme_year_register')));

	const r = await svc.updateRegisterSeq('2026', '120', 'ADMIN');
	assert.deepEqual(r, { year: 2026, last_seq: 120 });
	const up = log.find((l) => l.text.includes('cme_year_register'));
	assert.deepEqual([up.inputs.year, up.inputs.seq, up.inputs.actor_id], [2026, 120, 'ADMIN']);
});
