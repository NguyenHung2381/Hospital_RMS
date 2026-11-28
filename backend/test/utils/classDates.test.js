const test = require('node:test');
const assert = require('node:assert/strict');
const {
	suggestClassDates,
	parseHolidays,
	holidayCalendar,
	validateSetting,
} = require('../../src/utils/classDates');

// 2026-10-22 là thứ Năm
test('bắt đầu = thứ Hai đầu tiên sau 7 ngày chuẩn bị', () => {
	const r = suggestClassDates({ today: '2026-10-22', prepDays: 7 });
	assert.equal(r.start_date, '2026-11-02');
	assert.equal(r.end_date, null);
});

test('thứ Hai trùng ngày lễ ⇒ dời sang ngày làm việc kế tiếp', () => {
	const r = suggestClassDates({ today: '2026-10-22', prepDays: 7, holidays: '02/11' });
	assert.equal(r.start_date, '2026-11-03');
});

test('theo thời lượng chương trình: 1 tháng từ 02/11 ⇒ hết 01/12', () => {
	const r = suggestClassDates({ today: '2026-10-22', durationValue: 1, durationUnit: 'month' });
	assert.equal(r.end_date, '2026-12-01');
	assert.equal(r.warning, null);
});

test('ngày kết thúc rơi vào cuối tuần ⇒ lùi về thứ Sáu', () => {
	// 2 tuần từ 02/11 ⇒ 15/11 (CN) ⇒ 13/11 (T6)
	const r = suggestClassDates({ today: '2026-10-22', durationValue: 2, durationUnit: 'week' });
	assert.equal(r.end_date, '2026-11-13');
	assert.equal(r.workdays, 10);
});

test('không có thời lượng ⇒ theo tiết: 40 tiết = 5 ngày học, bỏ lễ', () => {
	const r = suggestClassDates({ today: '2026-10-22', totalHours: 40, holidays: '2026-11-04' });
	assert.equal(r.start_date, '2026-11-02');
	assert.equal(r.end_date, '2026-11-09');
	assert.equal(r.needed_days, 5);
});

test('thời lượng ngắn hơn số tiết ⇒ cảnh báo, vẫn giữ theo thời lượng', () => {
	const r = suggestClassDates({
		today: '2026-10-22',
		durationValue: 1,
		durationUnit: 'week',
		totalHours: 80,
	});
	assert.equal(r.end_date, '2026-11-06');
	assert.match(r.warning, /5 ngày học, ít hơn 10 ngày/);
});

test('đọc danh sách ngày lễ nhiều dạng', () => {
	const h = parseHolidays('01/01, 30/4\n02/09/2026; 2027-02-05\nlinh tinh');
	assert.deepEqual([...h.yearly].sort(), ['01-01', '04-30']);
	assert.deepEqual([...h.dates].sort(), ['2026-09-02', '2027-02-05']);
});

test('dấu "-" bỏ ngày; mục sai / ngày không có thật bị đánh dấu', () => {
	const h = parseHolidays('-03/09/2026, -01/05, 31/02, 29/02, abc');
	assert.deepEqual([...h.exDates], ['2026-09-03']);
	assert.deepEqual([...h.exYearly], ['05-01']);
	assert.deepEqual([...h.yearly], ['02-29']);
	assert.deepEqual(h.invalid, ['31/02', 'abc']);
});

test('tự tính ngày lễ: thứ Hai khai giảng rơi vào Tết ⇒ dời qua hết Tết', () => {
	// 03/02/2026 + 7 ngày ⇒ T2 16/02 — 16–20/02/2026 nghỉ Tết
	const off = suggestClassDates({ today: '2026-02-03', prepDays: 7 });
	assert.equal(off.start_date, '2026-02-16');
	const on = suggestClassDates({ today: '2026-02-03', prepDays: 7, autoHolidays: true });
	assert.equal(on.start_date, '2026-02-23');
});

test('ngày nhập tay có "-" bỏ được ngày tự tính', () => {
	const cal = holidayCalendar({ text: '-27/04/2026, 24/11', auto: true });
	assert.equal(cal.isHoliday('2026-04-27'), false); // nghỉ bù Giỗ Tổ đã bỏ
	assert.equal(cal.isHoliday('2026-04-30'), true);
	assert.equal(cal.isHoliday('2027-11-24'), true); // thêm tay hằng năm
	const list = cal.list(2026);
	assert.equal(list.find((x) => x.date === '2026-04-27').removed, true);
	assert.equal(list.find((x) => x.date === '2026-11-24').source, 'manual');
});

test('validateSetting báo mục không hiểu, khóa khác bỏ qua', () => {
	assert.equal(validateSetting('TRAINING_HOLIDAYS', '01/01, -03/09/2026'), null);
	assert.match(
		validateSetting('TRAINING_HOLIDAYS', '01/01, 32/13') ?? '',
		/Không hiểu ngày: 32\/13/,
	);
	assert.equal(validateSetting('CME_MIN_HOURS', 'x'), null);
});
