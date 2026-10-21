const test = require('node:test');
const assert = require('node:assert/strict');
const {
	endOf,
	planSchedule,
	describeSpan,
	findWarnings,
	deriveTemplate,
	arrangeRotations,
	pickMentor,
	practiceLocation,
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
	assert.equal(describeSpan('2026-03-01', '2026-04-15'), '1,5 tháng'); // sổ ghi "1.5 tháng"
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

// Hồ sơ trong sổ: [khoa, ngày bắt đầu, ngày kết thúc, thời lượng ghi]
const rec = (...rots) => ({
	rotations: rots.map(([name, s, e, d]) => ({
		department_id: name,
		department_name: `Khoa ${name}`,
		start_date: s ?? null,
		end_date: e ?? null,
		duration_text: d ?? null,
	})),
});

test('deriveTemplate: gom khoa theo nhóm TH, ưu tiên hồ sơ đi đủ thời gian, chuyên khoa lẻ là vòng chia nhiều khoa', () => {
	const full = rec(
		['Cấp cứu', null, null, '03 tháng'],
		['Nội tim mạch 2', null, null, '01 tháng'],
		['Ngoại tiêu hóa', null, null, '02 tháng'],
		['Phụ Sản', null, null, '02 tháng'],
		['Nhi Sơ sinh', null, null, '02 tháng'],
		['Mắt', '2026-06-03', '2026-06-12'],
		['Da liễu', '2026-06-13', '2026-08-02'],
	);
	const other = rec(
		['Chống độc', null, null, '03 tháng'],
		['Nội tiêu hóa', null, null, '01 tháng'],
		['Ngoại tiêu hóa', null, null, '02 tháng'],
		['Phụ Sản', null, null, '02 tháng'],
		['Nhi Sơ sinh', null, null, '02 tháng'],
		['Mắt', '2026-06-03', '2026-06-12'],
		['Da liễu', '2026-06-13', '2026-08-02'],
	);
	// Sổ ghi dần: nhiều hồ sơ mới có 1 khoa — không được lấy làm mẫu
	const partial = rec(['Nội tim mạch 2', null, null, '01 tháng']);
	const t = deriveTemplate([full, other, partial, partial, partial], 365);
	assert.deepEqual(
		t.map((r) => [r.title, r.duration_text, r.allow_split, r.department_ids]),
		[
			['Hồi sức cấp cứu', '03 tháng', false, ['Cấp cứu', 'Chống độc']],
			['Nội khoa', '01 tháng', false, ['Nội tim mạch 2', 'Nội tiêu hóa']],
			['Ngoại tiêu hóa', '02 tháng', false, ['Ngoại tiêu hóa']],
			['Phụ Sản', '02 tháng', false, ['Phụ Sản']],
			['Nhi Sơ sinh', '02 tháng', false, ['Nhi Sơ sinh']],
			['Chuyên khoa khác', '02 tháng', true, ['Mắt', 'Da liễu']],
		],
	);
	assert.equal(deriveTemplate([], 365), null);
});

test('arrangeRotations: xếp so le — khoa / thứ tự vòng tránh chỗ đã đông', () => {
	const lessons = new Map([
		[
			'HSCC',
			{
				duration_value: 1,
				duration_unit: 'month',
				allow_split: false,
				department_ids: ['CC', 'CD'],
			},
		],
		[
			'NOI',
			{ duration_value: 1, duration_unit: 'month', allow_split: false, department_ids: ['NOI'] },
		],
	]);
	const rows = [
		{ id: 'a', lesson_id: 'HSCC', duration_text: '01 tháng', department_id: null },
		{ id: 'b', lesson_id: 'NOI', duration_text: '01 tháng', department_id: 'NOI' },
	];
	// Cả 2 khoa HSCC tháng 7 đều có người, khoa Nội trống ⇒ đi Nội trước, HSCC sau
	const busy = [
		{ department_id: 'CC', start_date: '2026-07-01', end_date: '2026-07-31' },
		{ department_id: 'CD', start_date: '2026-07-01', end_date: '2026-07-31' },
		{ department_id: 'CC', start_date: '2026-08-01', end_date: '2026-08-31' },
	];
	assert.deepEqual(arrangeRotations(rows, lessons, '2026-07-01', busy), [
		{ id: 'b', start_date: '2026-07-01', end_date: '2026-07-31', department_id: 'NOI' },
		{ id: 'a', start_date: '2026-08-01', end_date: '2026-08-31', department_id: 'CD' },
	]);
	// Chưa ai học ⇒ giữ thứ tự mẫu, khoa đầu danh sách
	assert.deepEqual(
		arrangeRotations(rows, lessons, '2026-07-01', []).map((p) => [p.id, p.department_id]),
		[
			['a', 'CC'],
			['b', 'NOI'],
		],
	);
	// Ép vào Nội trước (học khoa khác rồi mới sang Cấp cứu) dù chưa ai học; vòng không có trong hồ sơ ⇒ bỏ qua
	assert.deepEqual(
		arrangeRotations(rows, lessons, '2026-07-01', [], 'NOI').map((p) => [p.id, p.start_date]),
		[
			['b', '2026-07-01'],
			['a', '2026-08-01'],
		],
	);
	assert.equal(arrangeRotations(rows, lessons, '2026-07-01', [], 'KHAC')[0].id, 'a');
	// Vòng thiếu thời lượng ⇒ không xếp được
	assert.equal(
		arrangeRotations([{ id: 'x', lesson_id: 'Z', duration_text: null }], lessons, '2026-07-01', []),
		null,
	);
});

test('Tự xếp rồi Tính lại ngày: ngày các vòng giữ nguyên (vòng chia nhiều khoa không ghi thời lượng riêng)', () => {
	const depts = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'];
	const lessons = new Map([
		[
			'NOI',
			{ duration_value: 1, duration_unit: 'month', allow_split: false, department_ids: ['NOI'] },
		],
		['CK', { duration_value: 2, duration_unit: 'month', allow_split: true, department_ids: depts }],
	]);
	const rows = [
		{ id: 'n', lesson_id: 'NOI', duration_text: null, department_id: 'NOI' },
		...depts.map((d) => ({ id: d, lesson_id: 'CK', duration_text: null, department_id: d })),
	];
	const plan = arrangeRotations(rows, lessons, '2026-07-01', []);
	// Khoa chuyên khoa ~10 ngày — describeSpan ra "1,5 tuần" (= 11 ngày) nên không được ghi vào duration_text
	assert.equal(describeSpan(plan[1].start_date, plan[1].end_date), '1,5 tuần');
	const byId = new Map(rows.map((r) => [r.id, r]));
	const again = planSchedule(
		plan.map((p) => byId.get(p.id)),
		lessons,
		plan[0].start_date,
	);
	assert.deepEqual(
		again,
		plan.map(({ id, start_date, end_date }) => ({ id, start_date, end_date })),
	);
});

test('pickMentor: NHD đang kèm ít nhất trong khoảng ngày, hoà thì theo thứ tự ưu tiên', () => {
	const busy = [
		{ mentor_user_id: 'U1', start_date: '2026-07-01', end_date: '2026-07-31' },
		{ mentor_user_id: 'U1', start_date: '2026-07-10', end_date: '2026-08-10' },
		{ mentor_user_id: 'U2', start_date: '2026-07-01', end_date: '2026-07-31' },
	];
	assert.equal(pickMentor(['U1', 'U2', 'U3'], busy, '2026-07-05', '2026-07-20'), 'U3');
	assert.equal(pickMentor(['U1', 'U2'], busy, '2026-07-05', '2026-07-20'), 'U2');
	assert.equal(pickMentor(['U1', 'U2'], busy, '2026-09-01', '2026-09-30'), 'U1');
	assert.equal(pickMentor([], busy, '2026-09-01', '2026-09-30'), null);
});

test('practiceLocation: ghi như cột "Địa điểm thực hành" của sổ', () => {
	assert.equal(practiceLocation([{ department_name: 'Khoa Cấp Cứu' }]), 'Tại khoa Cấp Cứu');
	assert.equal(
		practiceLocation([
			{ department_name: 'Khoa Cấp Cứu' },
			{ department_name: 'Khoa Nội Tim Mạch 2' },
			{ department_name: 'Khoa Mắt', round_title: 'Chuyên khoa khác', allow_split: true },
			{ department_name: 'Khoa Da Liễu', round_title: 'Chuyên khoa khác', allow_split: true },
		]),
		'Tại các khoa: Cấp Cứu, Nội Tim Mạch 2, Chuyên khoa khác',
	);
	assert.equal(practiceLocation([]), null);
});
