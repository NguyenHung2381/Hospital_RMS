// Chuẩn bị chuyển sang PostgreSQL: số chỗ dùng cú pháp chỉ SQL Server mới có
// (đếm bởi scripts/check-tsql-usage.js) chỉ được GIẢM so với mốc trong
// scripts/tsql-usage-baseline.json. Sửa bớt được thì chạy
// `npm run check:tsql -- --update` để hạ mốc.
// Xem database/POSTGRESQL_MIGRATION_PLAN.md mục 6.
const test = require('node:test');
const assert = require('node:assert/strict');
const { PATTERNS, countUsage, readBaseline } = require('../../scripts/check-tsql-usage');

test('số chỗ dùng cú pháp T-SQL không tăng so với mốc', () => {
	const usage = countUsage();
	const baseline = readBaseline();
	const over = [];
	const lowered = [];
	for (const { key, pg } of PATTERNS) {
		const max = baseline[key];
		assert.ok(
			Number.isInteger(max),
			`Thiếu mốc cho "${key}" — chạy npm run check:tsql -- --update`,
		);
		const now = usage[key].total;
		if (now > max) {
			const files = Object.entries(usage[key].files)
				.map(([f, n]) => `${f} (${n})`)
				.join(', ');
			over.push(`${key}: ${now} > ${max} — dùng ${pg}. File: ${files}`);
		} else if (now < max) lowered.push(`${key} ${max}→${now}`);
	}
	assert.deepEqual(over, [], `Thêm cú pháp chỉ SQL Server mới có:\n${over.join('\n')}`);
	if (lowered.length) {
		console.log(`ℹ Đã giảm (${lowered.join(', ')}) — chạy npm run check:tsql -- --update.`);
	}
});
