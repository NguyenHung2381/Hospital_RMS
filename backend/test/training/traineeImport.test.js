const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
	parseWorkbook,
	buildPreview,
} = require('../../src/modules/training/trainees/traineeImportService');

// Dòng tiêu đề như sổ thực hành GPHN (3.xlsx), cắt bớt nhóm cột vòng khoa; dữ liệu giả.
const HEADER = [
	'TT',
	'Mã học viên',
	'Mã thực hành',
	'Họ và tên',
	'Giới tính',
	'Ngày sinh',
	'Năm sinh',
	'Trình độ chuyên môn',
	'Hộ khẩu thường trú',
	'Nơi sinh \n(Tỉnh)',
	'CMT/CCCD',
	'Ngày cấp',
	'Nơi cấp',
	'Điện thoại',
	'Năm tốt nghiệp',
	'Trường đào tạo',
	'Ngày cấp bằng',
	'Ngày tốt nghiệp',
	'Khoa thực hành 1',
	'Ngày cấp CCHN 1',
	'ông/bà 1',
	'Ghi chú',
];

async function buffer(rows) {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Sheet1');
	ws.addRow(HEADER);
	rows.forEach((r) => ws.addRow(r));
	return wb.xlsx.writeBuffer();
}

const row = (code, name, gender, cccd) => [
	1,
	code,
	`${code}.BS`,
	name,
	gender,
	'15/08/1999',
	1999,
	'Bác sĩ đa khoa',
	'Xóm 1, xã A',
	'Nghệ An',
	cccd,
	'12/11/2024',
	'Bộ Công an',
	'0900000000',
	2023,
	'Trường Đại học Y',
	new Date(Date.UTC(2023, 6, 13)),
	'13/07/2023',
	'Cấp cứu',
	'27/04/2015',
	'ông',
	'BV YHCT',
];

test('nhận đủ cột của sổ thực hành: CMT/CCCD, ông/bà, ngày/nơi cấp đúng cột', async () => {
	const { rows, matchedColumns } = await parseWorkbook(
		await buffer([row('226', 'Học Viên A', 'ông', '040099000001')]),
	);
	for (const f of [
		'legacy_code',
		'national_id',
		'national_id_issued_date',
		'national_id_issued_place',
		'permanent_address',
		'birth_province',
		'graduated_date',
		'degree_issued_date',
	])
		assert.ok(matchedColumns.includes(f), `thiếu cột ${f}`);
	const [r] = rows;
	assert.equal(r.legacy_code, '226');
	assert.equal(r.gender, 'male');
	assert.equal(r.national_id, '040099000001');
	assert.equal(r.national_id_issued_date, '2024-11-12'); // "Ngày cấp", không phải "Ngày cấp CCHN 1"
	assert.equal(r.national_id_issued_place, 'Bộ Công an');
	assert.equal(r.birth_province, 'Nghệ An');
	assert.equal(r.degree_issued_date, '2023-07-13');
	assert.equal(r.graduated_date, '2023-07-13');
	assert.equal(r.dob, '1999-08-15');
});

test('CCCD đã có → cập nhật; CCCD lặp trong file → gộp vào cùng học viên; CCCD mất số 0 đầu', async () => {
	const { rows } = await parseWorkbook(
		await buffer([
			row('226', 'Học Viên A', 'ông', '040099000001'),
			row('227', 'Học Viên B', 'bà', '40199000002'), // Excel làm mất số 0 đầu
			row('349', 'Học Viên B', 'bà', '040199000002'),
		]),
	);
	const preview = buildPreview(rows, {
		typeByName: new Map(),
		deptByName: new Map(),
		traineeByNationalId: new Map([['040099000001', { id: 'HV1', hidden_at: null }]]),
	});
	assert.deepEqual(
		preview.map((p) => [p.action, p.trainee_id, p.gender, p.national_id]),
		[
			['update', 'HV1', 'male', '040099000001'],
			['new', null, 'female', '040199000002'],
			['duplicate', null, 'female', '040199000002'],
		],
	);
	assert.match(preview[2].warnings[0], /Trùng CCCD với dòng 3/);
});
