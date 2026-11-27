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
// Học viên đang học khóa KH1 mọi ngày, với mẫu ca tuần `pattern`
const inCourse = (pattern) => () => ({ course_id: 'KH1', course_name: 'Khóa 1', pattern });

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
	const base = { courseOn: inCourse(hanhChinh), assignments: [], shiftsById, records: [] };
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
	const base = { courseOn: inCourse(hanhChinh), assignments, shiftsById };
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
		courseOn: inCourse(null),
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
		courseOn: inCourse(null),
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

test('checkOptions: ngoài thời gian khóa học thì không chấm được; lựa chọn mang khóa học', () => {
	// Khóa kết thúc 12/10: ca đêm 12/10 vẫn chấm ra sáng 13/10, nhưng 13/10 không chấm tự do
	const courseOn = (d) =>
		d <= '2026-10-12' ? { course_id: 'KH1', course_name: 'Khóa 1', pattern: null } : null;
	const opts = s.checkOptions({
		courseOn,
		assignments: [{ work_date: '2026-10-12', shift_id: 3 }],
		shiftsById,
		records: [{ work_date: '2026-10-12', shift_id: 3 }],
		now: vn('2026-10-13T07:10:00'),
	});
	assert.deepStrictEqual(
		opts.map((o) => [o.work_date, o.shift_id, o.course_id, o.action]),
		[['2026-10-12', 3, 'KH1', 'check_out']],
	);
	assert.deepStrictEqual(
		s.checkOptions({
			courseOn: () => null,
			assignments: [],
			shiftsById,
			records: [],
			now: vn('2026-10-12T09:00:00'),
		}),
		[],
	);
});

test('periodOn: lượt học phủ ngày, ưu tiên khóa bắt đầu muộn nhất', () => {
	const periods = [
		{ course_id: 'A', start_date: '2026-10-01', end_date: '2026-10-31' },
		{ course_id: 'B', start_date: '2026-10-15', end_date: null },
		{ course_id: 'R', start_date: null, end_date: '2026-10-05' },
	];
	assert.strictEqual(s.periodOn(periods, '2026-09-30').course_id, 'R');
	assert.strictEqual(s.periodOn(periods, '2026-10-03').course_id, 'A');
	assert.strictEqual(s.periodOn(periods, '2026-10-20').course_id, 'B');
	assert.strictEqual(s.periodOn(periods, '2027-01-01').course_id, 'B');
	assert.strictEqual(s.periodOn(periods.slice(0, 1), '2026-11-01'), null);
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
	assert.match(s.validateShift({ ...sang, checkin_before_min: -1 }), /Điểm danh vào sớm/);
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

// ─── Lượt chấm từ máy chấm công ───────────────────────────────────────────────
const sang2 = shift(5, '07:00', '11:30');
const chieu2 = shift(6, '13:00', '17:00');
const byId2 = new Map([sang2, chieu2, dem].map((x) => [x.id, x]));
const haiCa = { days: { 1: [5, 6], 2: [5, 6], 3: [5, 6], 4: [5, 6], 5: [5, 6], 6: [], 7: [] } };
const assign = (times, extra = {}) =>
	s
		.assignPunches({
			punches: times.map((t) => ({ at: vn(t), device_id: 7 })),
			courseOn: inCourse(haiCa),
			assignments: [],
			shiftsById: byId2,
			...extra,
		})
		.map((g) => ({
			key: `${g.work_date}|${g.shift_id}`,
			times: g.punches.map((p) => p.at.toISOString().slice(11, 16)),
		}));

test('assignPunches: ca sáng / ca chiều, lượt giữa trưa vào ca gần hơn', () => {
	assert.deepStrictEqual(
		assign(['2026-10-12T06:55', '2026-10-12T11:32', '2026-10-12T12:45', '2026-10-12T17:03']),
		[
			{ key: '2026-10-12|5', times: ['23:55', '04:32'] },
			{ key: '2026-10-12|6', times: ['05:45', '10:03'] },
		],
	);
	// Ngoài mọi khung (quá sớm) ⇒ bỏ; thứ 7 không có ca ⇒ bỏ
	assert.deepStrictEqual(assign(['2026-10-12T05:00', '2026-10-17T08:00']), []);
});

test('assignPunches: hết ca mà chưa vào thì không nhận; đã có giờ vào (web) thì là giờ ra', () => {
	assert.deepStrictEqual(assign(['2026-10-12T12:00']), []);
	const existing = [{ work_date: '2026-10-12', shift_id: 5, check_in_at: vn('2026-10-12T07:01') }];
	assert.deepStrictEqual(assign(['2026-10-12T12:00'], { existing }), [
		{ key: '2026-10-12|5', times: ['05:00'] },
	]);
	// Lượt về sai thứ tự vẫn đúng: lượt vào đến sau lượt ra trong cùng lô
	assert.deepStrictEqual(assign(['2026-10-12T11:40', '2026-10-12T07:02']), [
		{ key: '2026-10-12|5', times: ['00:02', '04:40'] },
	]);
});

test('assignPunches: ca đêm thuộc ngày bắt đầu ca; không có lịch ca ⇒ 1 dòng tự do', () => {
	const demTuan = { days: { 1: [3], 2: [3], 3: [3], 4: [3], 5: [3], 6: [3], 7: [3] } };
	assert.deepStrictEqual(
		assign(['2026-10-12T18:50', '2026-10-13T07:10'], { courseOn: inCourse(demTuan) }),
		[{ key: '2026-10-12|3', times: ['11:50', '00:10'] }],
	);
	assert.deepStrictEqual(
		assign(['2026-10-17T09:00', '2026-10-17T15:00'], { courseOn: inCourse(null) }),
		[{ key: '2026-10-17|null', times: ['02:00', '08:00'] }],
	);
	// Ngày không học khóa nào ⇒ bỏ
	assert.deepStrictEqual(assign(['2026-10-12T07:00'], { courseOn: () => null }), []);
});

test('mergeCheckTimes: vào sớm nhất, ra muộn nhất, chấm lặp không tính giờ ra', () => {
	const p = (t, device_id = 7) => ({ at: vn(t), device_id });
	const hm = (x) => x && x.at.toISOString().slice(11, 16);
	// Bấm 3 lần trong 1 phút ⇒ chỉ có giờ vào
	let m = s.mergeCheckTimes(null, [
		p('2026-10-12T09:15'),
		p('2026-10-12T09:15:30'),
		p('2026-10-12T09:16'),
	]);
	assert.strictEqual(hm(m.in), '02:15');
	assert.strictEqual(m.out, null);
	assert.strictEqual(m.changed, true);
	m = s.mergeCheckTimes(null, [p('2026-10-12T07:02'), p('2026-10-12T11:31', 8)]);
	assert.deepStrictEqual([hm(m.in), hm(m.out), m.out.device_id], ['00:02', '04:31', 8]);
	// Dòng bấm trên web (có IP) + lượt máy sớm hơn ⇒ giờ vào thành của máy, giờ web thành giờ ra
	const web = {
		check_in_at: vn('2026-10-12T07:20'),
		check_in_ip: '192.168.1.5',
		check_in_distance_m: 12,
		check_out_at: null,
	};
	m = s.mergeCheckTimes(web, [p('2026-10-12T07:01')]);
	assert.deepStrictEqual(
		[hm(m.in), m.in.device_id, hm(m.out), m.out.ip],
		['00:01', 7, '00:20', '192.168.1.5'],
	);
	// Chạy lại với cùng lượt ⇒ không đổi
	const saved = {
		check_in_at: m.in.at,
		check_in_device_id: 7,
		check_out_at: m.out.at,
		check_out_ip: '192.168.1.5',
	};
	assert.strictEqual(s.mergeCheckTimes(saved, [p('2026-10-12T07:01')]).changed, false);
	assert.strictEqual(s.mergeCheckTimes(null, []), null);
});
