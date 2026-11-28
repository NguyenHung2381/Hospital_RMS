// Ngày lễ tự tính theo năm — đối chiếu với lịch âm và thông báo nghỉ lễ chính thức các năm đã qua.
const test = require('node:test');
const assert = require('node:assert/strict');
const { vnHolidays, lunarToSolar } = require('../../src/utils/vnHolidays');

const weekdays = (list) =>
	list.filter((h) => ![0, 6].includes(new Date(`${h.date}T00:00:00Z`).getUTCDay())).map((h) => h.date);

test('mùng 1 Tết và Giỗ Tổ (10/3 âm lịch) đúng lịch âm', () => {
	const tet = { 2023: '2023-01-22', 2024: '2024-02-10', 2025: '2025-01-29', 2026: '2026-02-17', 2027: '2027-02-06', 2033: '2033-01-31' };
	for (const [y, d] of Object.entries(tet)) assert.equal(lunarToSolar(1, 1, +y), d, `Tết ${y}`);
	const gioTo = { 2023: '2023-04-29', 2024: '2024-04-18', 2025: '2025-04-07', 2026: '2026-04-26' };
	for (const [y, d] of Object.entries(gioTo)) assert.equal(lunarToSolar(10, 3, +y), d, `Giỗ Tổ ${y}`);
});

test('5 ngày làm việc nghỉ Tết khớp thông báo chính thức 2023–2026', () => {
	const official = {
		2023: ['2023-01-20', '2023-01-23', '2023-01-24', '2023-01-25', '2023-01-26'],
		2024: ['2024-02-08', '2024-02-09', '2024-02-12', '2024-02-13', '2024-02-14'],
		2025: ['2025-01-27', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31'],
		2026: ['2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20'],
	};
	for (const [y, days] of Object.entries(official))
		assert.deepEqual(weekdays(vnHolidays(+y).filter((h) => h.name === 'Tết Nguyên đán')), days, `Tết ${y}`);
});

test('Quốc khánh 2 ngày: 2024 (2/9 là T2) ⇒ 2–3/9, 2025 (T3) ⇒ 1–2/9', () => {
	const qk = (y) => vnHolidays(y).filter((h) => h.name.startsWith('Quốc khánh')).map((h) => h.date);
	assert.deepEqual(qk(2024), ['2024-09-02', '2024-09-03']);
	assert.deepEqual(qk(2025), ['2025-09-01', '2025-09-02']);
});

test('lễ rơi vào cuối tuần ⇒ nghỉ bù ngày làm việc kế tiếp, không chồng lên lễ khác', () => {
	// 2023: 1/1 (CN) ⇒ bù 2/1; Giỗ Tổ 29/4 (T7), 30/4 (CN), 1/5 (T2) ⇒ bù 2/5, 3/5; Quốc khánh 2/9 (T7) ⇒ 1/9 + bù 4/9
	// — khớp thông báo nghỉ lễ 2023 (31/12–2/1, 29/4–3/5, 1/9–4/9)
	const y2023 = vnHolidays(2023).filter((h) => h.compensatory).map((h) => h.date);
	assert.deepEqual(y2023, ['2023-01-02', '2023-05-02', '2023-05-03', '2023-09-04']);
	// 2026: Giỗ Tổ 26/4 (CN) ⇒ bù 27/4
	assert.ok(vnHolidays(2026).some((h) => h.date === '2026-04-27' && h.compensatory));
});

test('chỉ trả ngày thuộc đúng năm, sắp theo ngày, không trùng', () => {
	for (const y of [2024, 2025, 2026, 2027, 2028]) {
		const dates = vnHolidays(y).map((h) => h.date);
		assert.ok(dates.every((d) => d.startsWith(`${y}-`)));
		assert.deepEqual(dates, [...new Set(dates)].sort());
	}
});
