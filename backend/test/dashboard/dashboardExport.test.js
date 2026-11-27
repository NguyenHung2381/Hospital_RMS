// Xuất Excel thống kê đề tài (POST /dashboard/export-stats): chọn sheet theo
// sections, tên sheet khoa hợp lệ với Excel (≤31 ký tự, không ký tự cấm, không
// trùng), năm/sections rác ⇒ giá trị mặc định.
const test = require('node:test');
const assert = require('node:assert/strict');

const response = require('../../src/utils/response');
let sent = null;
response.sendWorkbook = async (_res, wb, name) => {
	sent = { wb, name };
};
const dashboardService = require('../../src/modules/dashboard/dashboardService');
let askedYear;
const {
	buildDashboardStatsWorkbook,
	ALL_SECTIONS,
} = require('../../src/modules/dashboard/exports/dashboardStatsWorkbook');
const { exportStats } = require('../../src/modules/dashboard/dashboardExportController');

const dept = (name, over = {}) => ({
	name,
	specialty_group: 'Nội',
	total: 4,
	de_tai: 3,
	bai_bao: 1,
	approved: 1,
	by_status: { submitted: 3, approved: 1, rejected: 0, supplement: 0, cancelled: 0 },
	categories: [{ name: 'LS', count: 4 }],
	approval_rate: 0.25,
	council_progress: { expected: 0, completed: 0 },
	...over,
});
const STATS = {
	overview: { total: 9, by_status: { approved: 2, submitted: 7 } },
	by_article_type: [
		{ type: 'de_tai', count: 8 },
		{ type: 'bai_bao', count: 1 },
	],
	by_department: [
		dept('Khoa Hồi sức tích cực / Chống độc: Trung tâm [A]'),
		dept('Khoa Hồi sức tích cực / Chống độc: Trung tâm [B]', {
			council_progress: { expected: 5, completed: 2 },
		}),
		dept('Tổng quan'),
		dept('   '),
	],
};
dashboardService.getStats = async (year) => {
	askedYear = year;
	return STATS;
};

const names = (wb) => wb.worksheets.map((ws) => ws.name);
const cellsOf = (ws) => {
	const out = [];
	ws.eachRow((row) => row.eachCell((c) => out.push(c.value)));
	return out;
};

test('đủ sections: 3 sheet tổng hợp + 1 sheet / khoa, tên sheet hợp lệ và không trùng', () => {
	const wb = buildDashboardStatsWorkbook(STATS, { year: 2026, sections: ALL_SECTIONS });
	const n = names(wb);
	assert.deepEqual(n.slice(0, 3), ['Tổng quan', 'Theo hệ', 'Theo khoa-phòng-TT']);
	assert.equal(n.length, 3 + STATS.by_department.length);
	assert.equal(new Set(n).size, n.length, 'không trùng tên');
	for (const s of n) {
		assert.ok(s.length <= 31, `"${s}" ≤ 31 ký tự`);
		assert.ok(!/[\\/*?[\]:]/.test(s), `"${s}" không có ký tự cấm`);
	}
	assert.ok(n.includes('Tổng quan (2)'), 'khoa trùng tên sheet có sẵn ⇒ thêm hậu tố');
	assert.ok(n.includes('Khoa'), 'tên rỗng ⇒ "Khoa"');
});

test('sheet Tổng quan: tiêu đề theo năm, số đề tài / bài báo / tổng', () => {
	const wb = buildDashboardStatsWorkbook(STATS, { year: 2025, sections: ['overview'] });
	assert.deepEqual(names(wb), ['Tổng quan']);
	const v = cellsOf(wb.worksheets[0]);
	assert.ok(v.some((x) => typeof x === 'string' && x.endsWith('NĂM 2025')));
	const at = (label) => v[v.indexOf(label) + 1];
	assert.equal(at('Đề tài NCKH'), 8);
	assert.equal(at('Bài báo & tập san'), 1);
	assert.equal(at('Tổng cộng'), 9);
	assert.equal(at('Từ chối'), 0, 'trạng thái thiếu ⇒ 0');
});

test('sheet chi tiết khoa: chỉ có dòng tiến độ hội đồng khi có ghế cần chấm', () => {
	const wb = buildDashboardStatsWorkbook(STATS, {
		year: 2026,
		sections: ['by_department_detail'],
	});
	const [a, b] = wb.worksheets.map(cellsOf);
	assert.ok(!a.includes('Tiến độ đánh giá hội đồng'));
	assert.equal(b[b.indexOf('Tiến độ đánh giá hội đồng') + 1], '2/5');
});

test('bỏ chọn hết / sections lạ ⇒ vẫn có sheet Tổng quan', () => {
	for (const sections of [[], ['drop_table']]) {
		const wb = buildDashboardStatsWorkbook(STATS, { year: 2026, sections });
		assert.deepEqual(names(wb), ['Tổng quan']);
	}
});

test('controller: năm rác ⇒ năm hiện tại, sections không phải mảng ⇒ đủ sheet, tên file theo năm', async () => {
	await exportStats({ body: { year: 'all', sections: 'overview' } }, {}, assert.fail);
	const y = new Date().getFullYear();
	assert.equal(askedYear, y);
	assert.equal(sent.name, `thong-ke-de-tai-${y}.xlsx`);
	assert.equal(names(sent.wb).length, 3 + STATS.by_department.length);

	await exportStats({ body: { year: '2024', sections: ['by_specialty_group'] } }, {}, assert.fail);
	assert.equal(askedYear, 2024);
	assert.equal(sent.name, 'thong-ke-de-tai-2024.xlsx');
	assert.deepEqual(names(sent.wb), ['Theo hệ']);
});

test('controller: thiếu body vẫn xuất được', async () => {
	await exportStats({}, {}, assert.fail);
	assert.ok(sent.name.startsWith('thong-ke-de-tai-'));
});
