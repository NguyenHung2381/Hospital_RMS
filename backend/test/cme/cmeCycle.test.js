// Chu kỳ CME 05 năm liên tục (Thông tư 32/2023/TT-BYT Điều 3): hàm thuần, không CSDL.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
	computeCycle,
	daysLeftOf,
	classifyStatus,
	evaluateCycle,
	normalizeYears,
} = require('../../src/modules/cme/cmeCycle');

const cycle = (issuedDate, today, cycleYears) => {
	const c = computeCycle({ issuedDate, today, cycleYears });
	return `${c.cycle_start}..${c.cycle_end} ${c.basis}`;
};

test('có ngày cấp: chu kỳ hiện tại là khoảng 5 năm chứa hôm nay, tính từ ngày cấp', () => {
	// ví dụ trong yêu cầu: cấp 15/03/2019 → 15/03/2024 – 14/03/2029
	assert.equal(cycle('2019-03-15', '2026-11-20'), '2024-03-15..2029-03-14 license');
	// chưa qua ngày kỷ niệm đầu tiên → còn trong chu kỳ đầu
	assert.equal(cycle('2019-03-15', '2021-01-01'), '2019-03-15..2024-03-14 license');
});

test('đúng ngày kỷ niệm: chu kỳ mới bắt đầu; hôm trước vẫn thuộc chu kỳ cũ', () => {
	assert.equal(cycle('2019-03-15', '2024-03-15'), '2024-03-15..2029-03-14 license');
	assert.equal(cycle('2019-03-15', '2024-03-14'), '2019-03-15..2024-03-14 license');
	// ngày cuối của chu kỳ và ngày đầu của chu kỳ kế tiếp
	assert.equal(cycle('2019-03-15', '2029-03-14'), '2024-03-15..2029-03-14 license');
	assert.equal(cycle('2019-03-15', '2029-03-15'), '2029-03-15..2034-03-14 license');
	// hôm nay chính là ngày cấp
	assert.equal(cycle('2026-11-20', '2026-11-20'), '2026-11-20..2031-11-19 license');
});

test('ngày cấp 01/01: chu kỳ khớp năm lịch', () => {
	assert.equal(cycle('2020-01-01', '2026-11-20'), '2025-01-01..2029-12-31 license');
});

test('ngày cấp 29/02: năm đích không nhuận kẹp về 28/02, năm nhuận trả về 29/02', () => {
	assert.equal(cycle('2020-02-29', '2020-02-29'), '2020-02-29..2025-02-27 license');
	assert.equal(cycle('2020-02-29', '2025-02-27'), '2020-02-29..2025-02-27 license');
	assert.equal(cycle('2020-02-29', '2025-02-28'), '2025-02-28..2030-02-27 license');
	assert.equal(cycle('2020-02-29', '2026-11-20'), '2025-02-28..2030-02-27 license');
	// mốc thứ 4 (sau 20 năm) lại là năm nhuận
	assert.equal(cycle('2020-02-29', '2040-02-28'), '2035-02-28..2040-02-28 license');
	assert.equal(cycle('2020-02-29', '2040-02-29'), '2040-02-29..2045-02-27 license');
});

test('chu kỳ kết thúc ngày 29/02 của năm nhuận', () => {
	assert.equal(cycle('2019-03-01', '2024-02-29'), '2019-03-01..2024-02-29 license');
	assert.equal(cycle('2019-03-01', '2024-03-01'), '2024-03-01..2029-02-28 license');
});

test('không có ngày cấp: N năm lịch gần nhất tính đến hết năm nay', () => {
	assert.equal(cycle(null, '2026-11-20'), '2022-01-01..2026-12-31 calendar');
	assert.equal(cycle(undefined, '2026-01-01'), '2022-01-01..2026-12-31 calendar');
	assert.equal(cycle('', '2026-12-31'), '2022-01-01..2026-12-31 calendar');
	// ngày cấp không đọc được coi như không có
	assert.equal(cycle('không rõ', '2026-11-20'), '2022-01-01..2026-12-31 calendar');
	assert.equal(cycle('2019-02-30', '2026-11-20'), '2022-01-01..2026-12-31 calendar');
});

test('N khác 5', () => {
	assert.equal(cycle(null, '2026-11-20', 3), '2024-01-01..2026-12-31 calendar');
	assert.equal(cycle(null, '2026-11-20', 1), '2026-01-01..2026-12-31 calendar');
	assert.equal(cycle(null, '2026-11-20', 10), '2017-01-01..2026-12-31 calendar');
	assert.equal(cycle('2019-03-15', '2026-11-20', 3), '2025-03-15..2028-03-14 license');
	assert.equal(cycle('2019-03-15', '2026-11-20', 10), '2019-03-15..2029-03-14 license');
	// cài đặt hệ thống đọc ra là chuỗi
	assert.equal(cycle('2019-03-15', '2026-11-20', '2'), '2025-03-15..2027-03-14 license');
});

test('N sai (0, âm, không nguyên, rác) → mặc định 5', () => {
	for (const bad of [0, -1, 2.5, 'abc', null, undefined, 1000]) {
		assert.equal(normalizeYears(bad), 5, String(bad));
	}
	assert.equal(cycle(null, '2026-11-20', 0), '2022-01-01..2026-12-31 calendar');
});

test('ngày là Date (cột DATE của db.pg: 00:00 UTC) hoạt động như chuỗi', () => {
	assert.equal(
		cycle(new Date(Date.UTC(2019, 2, 15)), '2026-11-20'),
		'2024-03-15..2029-03-14 license',
	);
	assert.equal(
		computeCycle({ issuedDate: null, today: new Date(Date.UTC(2026, 10, 20)) }).cycle_end,
		'2026-12-31',
	);
});

test('ngày cấp nằm trong tương lai (nhập sai): chu kỳ đầu tính từ ngày đó', () => {
	assert.equal(cycle('2027-06-01', '2026-11-20'), '2027-06-01..2032-05-31 license');
});

test('today không hợp lệ thì ném lỗi', () => {
	assert.throws(() => computeCycle({ issuedDate: null, today: 'hôm nay' }), TypeError);
});

test('daysLeftOf: 0 vào ngày cuối chu kỳ', () => {
	assert.equal(daysLeftOf('2026-12-31', '2026-12-31'), 0);
	assert.equal(daysLeftOf('2026-12-31', '2026-11-20'), 41);
	assert.equal(daysLeftOf('2024-03-01', '2024-02-28'), 2); // qua 29/02 nhuận
});

test('classifyStatus: đủ giờ luôn là met dù sắp hết hạn', () => {
	assert.equal(classifyStatus({ missing: 0, cycleEnd: '2026-11-21', today: '2026-11-20' }), 'met');
	assert.equal(classifyStatus({ missing: -5, cycleEnd: '2026-11-21', today: '2026-11-20' }), 'met');
});

test('classifyStatus: mốc 60 ngày (hồ sơ gia hạn)', () => {
	const at = (cycleEnd) => classifyStatus({ missing: 1, cycleEnd, today: '2026-11-20' });
	// còn đúng 60 ngày → overdue_window; 61 ngày → at_risk
	assert.equal(at('2027-01-19'), 'overdue_window');
	assert.equal(at('2027-01-20'), 'at_risk');
	// ngày cuối chu kỳ vẫn thiếu
	assert.equal(at('2026-11-20'), 'overdue_window');
});

test('classifyStatus: mốc 12 tháng tính theo lịch', () => {
	const at = (cycleEnd, today = '2026-11-20') => classifyStatus({ missing: 1, cycleEnd, today });
	assert.equal(at('2027-11-20'), 'at_risk');
	assert.equal(at('2027-11-21'), 'on_track');
	// hôm nay 29/02 (nhuận) + 1 năm = 28/02 năm sau
	assert.equal(at('2025-02-28', '2024-02-29'), 'at_risk');
	assert.equal(at('2025-03-01', '2024-02-29'), 'on_track');
});

test('evaluateCycle: tính thiếu, làm tròn, trạng thái', () => {
	const r = evaluateCycle({
		issuedDate: '2019-03-15',
		today: '2026-11-20',
		requiredHours: 120,
		earned: 90.004,
		earnedUndated: 10,
	});
	assert.deepEqual(r, {
		cycle_start: '2024-03-15',
		cycle_end: '2029-03-14',
		basis: 'license',
		required: 120,
		earned: 90,
		earned_undated: 10,
		missing: 30,
		days_left: daysLeftOf('2029-03-14', '2026-11-20'),
		status: 'on_track',
	});

	const met = evaluateCycle({
		issuedDate: null,
		today: '2026-11-20',
		requiredHours: 120,
		earned: 135.5,
	});
	assert.equal(met.missing, 0);
	assert.equal(met.status, 'met');
	assert.equal(met.basis, 'calendar');

	const none = evaluateCycle({ issuedDate: null, today: '2026-11-20', requiredHours: 120 });
	assert.equal(none.earned, 0);
	assert.equal(none.missing, 120);
	// năm lịch không có hạn gia hạn thật: thiếu giờ là 'at_risk', không phải 'overdue_window'
	assert.equal(none.status, 'at_risk');
});
