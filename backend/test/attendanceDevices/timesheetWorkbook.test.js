const { test } = require('node:test');
const assert = require('node:assert/strict');
const w = require('../../src/modules/attendanceDevices/exports/timesheetWorkbook');
const { summarize } = require('../../src/modules/attendanceDevices/timesheetService');

const day = (o) => ({
	pin: '20260001',
	trainee_id: 'HV20260001',
	trainee_name: 'Nguyễn Văn An',
	first_time: '07:31:05',
	last_time: '16:45:00',
	span_minutes: 553,
	punch_count: 2,
	matched_count: 1,
	times: '07:31 · 16:45',
	devices: 'Máy tầng 1',
	courses: 'Hồi sức cơ bản',
	...o,
});

const DAYS = [
	day({ work_date: '2026-11-26' }),
	day({
		work_date: '2026-11-25',
		punch_count: 1,
		last_time: '07:31:05',
		span_minutes: 0,
		times: '07:31',
	}),
	day({
		work_date: '2026-11-26',
		pin: '123',
		trainee_id: null,
		trainee_name: null,
		courses: null,
		punch_count: 3,
	}),
];

test('viDate / spanText / verifyLabel', () => {
	assert.equal(w.viDate('2026-11-26'), '26/11/2026');
	assert.equal(w.viDate(null), '');
	assert.equal(w.spanText(553), '9 giờ 13 phút');
	assert.equal(w.spanText(45), '45 phút');
	assert.equal(w.spanText(0), '');
	assert.equal(w.verifyLabel(1), 'Vân tay');
	assert.equal(w.verifyLabel(9), 'Kiểu 9');
	assert.equal(w.verifyLabel(null), '');
});

test('fileNameOf: 1 ngày / khoảng ngày', () => {
	assert.equal(w.fileNameOf('2026-11-26', '2026-11-26'), 'bang-cong-2026-11-26.xlsx');
	assert.equal(
		w.fileNameOf('2026-11-01', '2026-11-26'),
		'bang-cong-2026-11-01-den-2026-11-26.xlsx',
	);
});

test('summarizeByPerson: số ngày, tổng lượt; người không khớp đứng cuối', () => {
	const p = w.summarizeByPerson(DAYS);
	assert.equal(p.length, 2);
	assert.deepEqual(
		{
			pin: p[0].pin,
			day_count: p[0].day_count,
			punches: p[0].punches,
			first: p[0].first,
			last: p[0].last,
		},
		{ pin: '20260001', day_count: 2, punches: 3, first: '2026-11-25', last: '2026-11-26' },
	);
	assert.equal(p[1].pin, '123');
});

test('summarize: tổng trên trang', () => {
	assert.deepEqual(summarize(DAYS), { punches: 6, people: 2, days: 2, unknown_pins: 1 });
});

test('buildTimesheetWorkbook: 3 sheet, dòng 1 lượt không có giờ ra', () => {
	const wb = w.buildTimesheetWorkbook({
		from: '2026-11-25',
		to: '2026-11-26',
		device: null,
		days: DAYS,
		punches: [
			{
				work_date: '2026-11-26',
				punch_time: '07:31:05',
				pin: '20260001',
				trainee_id: 'HV20260001',
				trainee_name: 'Nguyễn Văn An',
				match_status: 'matched',
				verify_mode: 1,
				device_name: 'Máy tầng 1',
				course_name: 'Hồi sức cơ bản',
				session_date: '2026-11-26',
				start_time: '07:30',
			},
		],
	});
	assert.deepEqual(
		wb.worksheets.map((s) => s.name),
		['Tổng hợp', 'Bảng công', 'Lượt chấm'],
	);
	const ws = wb.getWorksheet('Bảng công');
	assert.match(String(ws.getCell(2, 1).value), /Từ 25\/11\/2026 đến 26\/11\/2026 · Tất cả máy/);
	// Dữ liệu từ dòng 4, cũ → mới: 25/11 (1 lượt) trước
	const first = ws.getRow(4);
	assert.equal(first.getCell(2).value, '25/11/2026');
	assert.equal(first.getCell(6).value, '07:31');
	assert.equal(first.getCell(7).value, '');
	assert.equal(ws.getRow(5).getCell(7).value, '16:45');
	assert.equal(ws.getRow(6).getCell(4).value, 'Không khớp học viên');
	const punch = wb.getWorksheet('Lượt chấm').getRow(4);
	assert.equal(punch.getCell(9).value, 'Đã ghép buổi học');
	assert.equal(punch.getCell(10).value, 'Hồi sức cơ bản · 26/11/2026 07:30');
});

test('shiftText: ca, giờ vào/ra, muộn / sớm / chưa chấm ra', () => {
	assert.equal(
		w.shiftText({
			shift_name: 'Ca sáng',
			shift_start: '07:00',
			shift_end: '11:30',
			check_in: '07:12',
			check_out: '11:31',
			late_min: 12,
			early_min: null,
			missing_out: false,
		}),
		'Ca sáng 07:00–11:30: vào 07:12, ra 11:31 (muộn 12 phút)',
	);
	assert.equal(
		w.shiftText({ shift_name: null, check_in: '09:00', check_out: null, missing_out: true }),
		'Tự do: vào 09:00 (chưa chấm ra)',
	);
});
