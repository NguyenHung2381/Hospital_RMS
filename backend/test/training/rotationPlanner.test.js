const test = require('node:test');
const assert = require('node:assert/strict');
const {
	endOf,
	planSchedule,
	describeSpan,
	findWarnings,
} = require('../../src/modules/training/courses/rotationPlanner');

test('endOf: cộng tháng/tuần/ngày, tính cả ngày đầu (khớp sổ thực hành)', () => {
	assert.equal(endOf('2025-06-16', 3, 'month'), '2025-09-15'); // 16/06 → 15/09: 03 tháng
	assert.equal(endOf('2025-09-16', 1, 'month'), '2025-10-15');
	assert.equal(endOf('2026-01-31', 1, 'month'), '2026-02-27'); // cuối tháng không tràn sang tháng sau
	assert.equal(endOf('2026-03-01', 1.5, 'month'), '2026-04-15');
	assert.equal(endOf('2026-06-03', 1, 'week'), '2026-06-09');
	assert.equal(endOf('2026-06-03', 10, 'day'), '2026-06-12');
});

test('planSchedule: nối tiếp các vòng, vòng chia nhiều khoa chia đều thời lượng', () => {
	const lessons = new Map([
		['HSCC', { duration_value: 3, duration_unit: 'month', allow_split: false }],
		['NOI', { duration_value: 1, duration_unit: 'month', allow_split: false }],
		['CK', { duration_value: 2, duration_unit: 'month', allow_split: true }],
	]);
	const rows = [
		{ id: 'a', lesson_id: 'HSCC', duration_text: '03 tháng' },
		{ id: 'b', lesson_id: 'NOI', duration_text: null },
		{ id: 'c', lesson_id: 'CK', duration_text: null },
		{ id: 'd', lesson_id: 'CK', duration_text: null },
	];
	assert.deepEqual(planSchedule(rows, lessons, '2025-06-16'), [
		{ id: 'a', start_date: '2025-06-16', end_date: '2025-09-15' },
		{ id: 'b', start_date: '2025-09-16', end_date: '2025-10-15' },
		{ id: 'c', start_date: '2025-10-16', end_date: '2025-11-15' }, // 2 tháng (61 ngày) / 2 khoa
		{ id: 'd', start_date: '2025-11-16', end_date: '2025-12-15' }, // khoa cuối khớp đúng ngày cuối vòng
	]);
	assert.equal(describeSpan('2025-06-16', '2025-12-15'), '06 tháng');
});

test('planSchedule dừng ở dòng không xác định được thời lượng', () => {
	const rows = [
		{ id: 'a', lesson_id: 'X', duration_text: '1.5 tuần' },
		{ id: 'b', lesson_id: 'Y', duration_text: null },
	];
	assert.deepEqual(planSchedule(rows, new Map(), '2026-06-22'), [
		{ id: 'a', start_date: '2026-06-22', end_date: '2026-07-02' },
	]);
});

test('describeSpan ra chữ như sổ thực hành', () => {
	assert.equal(describeSpan('2025-06-16', '2025-09-15'), '03 tháng');
	assert.equal(describeSpan('2026-06-22', '2026-07-02'), '1,5 tuần');
	assert.equal(describeSpan('2026-06-03', '2026-06-09'), '01 tuần');
	assert.equal(describeSpan('2026-06-03', '2026-06-07'), '05 ngày');
	assert.equal(describeSpan(null, '2026-06-07'), null);
	// driver mssql trả cột DATE thành Date
	assert.equal(
		describeSpan(new Date('2025-06-16T00:00:00Z'), new Date('2025-09-15T00:00:00Z')),
		'03 tháng',
	);
});

test('findWarnings: khoa ngoài danh sách, NHD thiếu CCHN, ngoài thời gian, quá tải, trùng ngày', () => {
	const rows = [
		{
			id: 'a',
			lesson_id: 'HSCC',
			department_id: 'K_NOI',
			department_name: 'Nội',
			start_date: '2025-06-16',
			end_date: '2025-09-15',
			mentor_user_id: 'U1',
			mentor_license_no: null,
		},
		{
			id: 'b',
			lesson_id: 'NOI',
			department_id: 'K_NOI',
			department_name: 'Nội tim mạch',
			start_date: '2025-09-10',
			end_date: '2025-10-15',
			mentor_user_id: 'U2',
			mentor_license_no: '001/NA-CCHN',
		},
	];
	const w = findWarnings(rows, {
		enrollment: {
			start_date: new Date('2025-06-16T00:00:00Z'),
			end_date: new Date('2025-10-01T00:00:00Z'),
		},
		allowedDepartments: new Map([['HSCC', ['K_CAPCUU', 'K_HSTC']]]),
		mentorLoad: new Map([['b', 5]]),
		maxLoad: 5,
	});
	assert.deepEqual(w.get('a'), [
		'Khoa không nằm trong danh sách khoa của vòng.',
		'Người hướng dẫn chưa có số CCHN.',
		'Trùng ngày với vòng Nội tim mạch.',
	]);
	assert.deepEqual(w.get('b'), [
		'Nằm ngoài thời gian thực hành của hồ sơ.',
		'Người hướng dẫn đang kèm 6 học viên cùng lúc (tối đa 5).',
		'Trùng ngày với vòng Nội.',
	]);
});
