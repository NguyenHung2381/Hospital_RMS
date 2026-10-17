const test = require('node:test');
const assert = require('node:assert');
const s = require('../../src/utils/attendanceShift');

// Giờ VN (UTC+7) → Date. 2026-10-12 là Thứ 2.
const vn = (iso) => new Date(`${iso}+07:00`);
const shift = (id, start_time, end_time, extra = {}) => ({
	id,
	name: `Ca ${id}`,
	code: `C${id}`,
	start_time,
	end_time,
	checkin_before_min: 30,
	checkout_after_min: 120,
	grace_min: 5,
	...extra,
});
const sang = shift(1, '07:00', '13:00');
const chieu = shift(2, '13:00', '19:00');
const dem = shift(3, '19:00', '07:00');
const truc24 = shift(4, '07:00', '07:00');
const shiftsById = new Map([sang, chieu, dem, truc24].map((x) => [x.id, x]));
const hanhChinh = { days: { 1: [1, 2], 2: [1, 2], 3: [1, 2], 4: [1, 2], 5: [1, 2], 6: [], 7: [] } };

test('durationMin & instanceOf: ca thường, qua đêm, 24 giờ', () => {
	assert.strictEqual(s.durationMin(sang), 360);
	assert.strictEqual(s.durationMin(dem), 720);
	assert.strictEqual(s.durationMin(truc24), 1440);
	const i = s.instanceOf(dem, '2026-10-12');
	assert.strictEqual(i.start_at.toISOString(), vn('2026-10-12T19:00:00').toISOString());
	assert.strictEqual(i.end_at.toISOString(), vn('2026-10-13T07:00:00').toISOString());
	assert.strictEqual(i.open_at.toISOString(), vn('2026-10-12T18:30:00').toISOString());
	assert.strictEqual(i.close_at.toISOString(), vn('2026-10-13T09:00:00').toISOString());
});

test('weekdayOf / dateKeyVN / addDays', () => {
	assert.strictEqual(s.weekdayOf('2026-10-12'), 1);
	assert.strictEqual(s.weekdayOf('2026-10-18'), 7);
	assert.strictEqual(s.dateKeyVN(new Date('2026-10-11T17:30:00Z')), '2026-10-12'); // 00:30 VN
	assert.strictEqual(s.addDays('2026-10-31', 1), '2026-11-01');
});

test('shiftIdsForDay: phân ca ngày ghi đè mẫu tuần; dòng NULL = nghỉ', () => {
	assert.deepStrictEqual(s.shiftIdsForDay(hanhChinh, [], '2026-10-12'), {
		source: 'pattern',
		shiftIds: [1, 2],
	});
	assert.deepStrictEqual(
		s.shiftIdsForDay(hanhChinh, [{ work_date: '2026-10-12', shift_id: null }], '2026-10-12'),
		{
			source: 'roster',
			shiftIds: [],
		},
	);
	assert.deepStrictEqual(
		s.shiftIdsForDay(null, [{ work_date: '2026-10-17', shift_id: 3 }], '2026-10-17'),
		{
			source: 'roster',
			shiftIds: [3],
		},
	);
	assert.strictEqual(s.shiftIdsForDay(null, [], '2026-10-12'), null);
});

test('checkOptions: chấm vào trong khoảng cho phép, chấm ra khi đã có bản ghi', () => {
	const base = { pattern: hanhChinh, assignments: [], shiftsById, records: [] };
	assert.deepStrictEqual(s.checkOptions({ ...base, now: vn('2026-10-12T06:00:00') }), []); // quá sớm
	const o1 = s.checkOptions({ ...base, now: vn('2026-10-12T06:45:00') });
	assert.deepStrictEqual(
		o1.map((o) => [o.shift_id, o.action]),
		[[1, 'check_in']],
	);
	// 12:45: ca sáng đã vào → chấm ra; ca chiều mở từ 12:30 → chấm vào. 2 lựa chọn.
	const records = [{ work_date: '2026-10-12', shift_id: 1 }];
	const o2 = s.checkOptions({ ...base, records, now: vn('2026-10-12T12:45:00') });
	assert.deepStrictEqual(
		o2.map((o) => [o.shift_id, o.action]),
		[
			[1, 'check_out'],
			[2, 'check_in'],
		],
	);
	// Thứ 7 mẫu không có ca → không chấm được
	assert.deepStrictEqual(s.checkOptions({ ...base, now: vn('2026-10-17T09:00:00') }), []);
	// Hết ca mà chưa vào → không chấm vào nữa
	assert.deepStrictEqual(
		s.checkOptions({ ...base, now: vn('2026-10-12T19:30:00') }).map((o) => o.shift_id),
		[],
	);
});

test('checkOptions: ca đêm chấm ra sáng hôm sau thuộc ngày bắt đầu ca', () => {
	const assignments = [{ work_date: '2026-10-17', shift_id: 3 }];
	const base = { pattern: hanhChinh, assignments, shiftsById };
	const vao = s.checkOptions({ ...base, records: [], now: vn('2026-10-17T18:50:00') });
	assert.deepStrictEqual(
		vao.map((o) => [o.work_date, o.shift_id, o.action]),
		[['2026-10-17', 3, 'check_in']],
	);
	// Chủ nhật 07:20: mẫu tuần CN không có ca, nhưng ca đêm thứ 7 vẫn mở để chấm ra
	const ra = s.checkOptions({
		...base,
		records: [{ work_date: '2026-10-17', shift_id: 3 }],
		now: vn('2026-10-18T07:20:00'),
	});
	assert.deepStrictEqual(
		ra.map((o) => [o.work_date, o.shift_id, o.action]),
		[['2026-10-17', 3, 'check_out']],
	);
});

test('checkOptions: trực 24h & chấm tự do khi không có lịch ca', () => {
	const assignments = [{ work_date: '2026-10-12', shift_id: 4 }];
	const ra = s.checkOptions({
		pattern: null,
		assignments,
		shiftsById,
		records: [{ work_date: '2026-10-12', shift_id: 4 }],
		now: vn('2026-10-13T07:10:00'),
	});
	// 13/10 không có lịch ca → thêm lựa chọn chấm tự do của hôm nay
	assert.deepStrictEqual(
		ra.map((o) => [o.work_date, o.shift_id, o.action]),
		[
			['2026-10-12', 4, 'check_out'],
			['2026-10-13', null, 'check_in'],
		],
	);
	const free = s.checkOptions({
		pattern: null,
		assignments: [],
		shiftsById,
		records: [],
		now: vn('2026-10-12T23:00:00'),
	});
	assert.deepStrictEqual(
		free.map((o) => [o.shift_id, o.action]),
		[[null, 'check_in']],
	);
});

test('lateMin / earlyMin có du di', () => {
	const i = s.instanceOf(sang, '2026-10-12');
	assert.strictEqual(s.lateMin(i, vn('2026-10-12T07:05:00')), 0);
	assert.strictEqual(s.lateMin(i, vn('2026-10-12T07:12:30')), 12);
	assert.strictEqual(s.lateMin(i, vn('2026-10-12T06:40:00')), 0);
	assert.strictEqual(s.earlyMin(i, vn('2026-10-12T12:56:00')), 0);
	assert.strictEqual(s.earlyMin(i, vn('2026-10-12T12:30:00')), 30);
	assert.strictEqual(s.earlyMin(i, vn('2026-10-12T14:00:00')), 0);
});

test('validateShift & normalizePatternDays', () => {
	assert.strictEqual(s.validateShift(sang), null);
	assert.match(s.validateShift({ ...sang, name: ' ' }), /tên ca/);
	assert.match(s.validateShift({ ...sang, code: '' }), /Ký hiệu/);
	assert.match(s.validateShift({ ...sang, start_time: '7:00' }), /HH:mm/);
	assert.match(s.validateShift({ ...sang, checkin_before_min: -1 }), /Chấm vào sớm/);
	assert.deepStrictEqual(s.normalizePatternDays({ 1: [2, 2, '3'], 7: 'x' }), {
		1: [2, 3],
		2: [],
		3: [],
		4: [],
		5: [],
		6: [],
		7: [],
	});
});
