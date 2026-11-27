// Dashboard chung (getOverviewStats) khi server chạy giờ UTC (container Docker):
// @from tính theo ngày giờ VN (todayVN) nhưng nhãn 12 tháng lại tính theo giờ máy
// (new Date()). Đầu tháng theo giờ VN (00:00–07:00) hai mốc lệch nhau 1 tháng.
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');
const db = require('../../src/config/db');

const log = install(async () => []);
db.queryAll = async (req, statements) => {
	await req.query(statements.join(';\n'));
	return statements.map((_, i) => (i === 0 ? [{}] : []));
};
const svc = require('../../src/modules/dashboard/dashboardService');
const { invalidate } = require('../../src/utils/cache');

const at = async (iso) => {
	test.mock.timers.enable({ apis: ['Date'], now: Date.parse(iso) });
	try {
		await invalidate('dash:');
		const s = await svc.getOverviewStats();
		return { months: s.monthly_activity.map((m) => m.month), from: log.at(-1).inputs.from };
	} finally {
		test.mock.timers.reset();
	}
};

test('giữa tháng: nhãn tháng và @from cùng một cửa sổ 12 tháng', async () => {
	const { months, from } = await at('2026-11-15T05:00:00Z');
	assert.equal(months[11], '2026-11');
	assert.equal(months[0], '2025-12');
	assert.equal(from.toISOString().slice(0, 10), '2025-12-01');
});

test('01/12 lúc 03:00 giờ VN (30/11 20:00 UTC): tháng cuối phải là 2026-12 như @from', async () => {
	const { months, from } = await at('2026-11-30T20:00:00Z');
	assert.equal(from.toISOString().slice(0, 10), '2026-01-01');
	assert.equal(months[0], '2026-01');
	assert.equal(months[11], '2026-12');
});
