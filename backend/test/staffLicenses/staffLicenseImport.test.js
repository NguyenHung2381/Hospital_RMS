// Nhập file "Danh sách người hành nghề" (staffLicenseImportService) với CSDL giả.
// Dòng tiêu đề lấy đúng nguyên văn file thật 2.xlsx (09/2026); dữ liệu ẩn danh.
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { install } = require('../auth/fakeDb');

// Đồng bộ persons sau khi ghi ngày sinh không thuộc phạm vi test này
process.env.PERSON_DUAL_WRITE = 'false';

const HEADER = [
	'TT',
	'MNV',
	'Mã nhân viên', // thực chất chứa số CCHN
	'CCCD',
	'Họ và tên',
	'K/P/TT đến T8.2026',
	'Văn bằng chuyên môn T8.2025',
	'Ngày tháng năm sinh',
	'Phạm vi hành nghề NỐI cả QĐ bổ sung PV',
	'Phạm vi hành nghề ĐƠN',
	'Số CCHN ',
	'Nơi cấp khác Nghệ An',
	'Ngày cấp chứng chỉ hành nghề',
	'Quyết định bổ sung phạm vi',
	'Điều chỉnh phạm vi HĐCM trong CCHN',
	'Mã hoá phạm vi điều chỉnh theo 2148 (BHXH)',
	'Ngày điều chỉnh phạm vi',
	'Nơi cấp QĐ điều chỉnh',
];
const CCCD_1 = '040000000001';
const CCCD_2 = '040000000002';

async function buildFile() {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('HN');
	ws.addRow(HEADER);
	ws.addRow([
		1,
		1001,
		'000111/NA-CCHN',
		CCCD_1,
		'Nguyễn Văn An',
		'Khoa Nội A',
		'Bác sĩ',
		new Date(Date.UTC(1975, 4, 20)),
		'Khám bệnh, chữa bệnh nội khoa; bổ sung siêu âm',
		'Khám bệnh, chữa bệnh nội khoa',
		'000111/NA-CCHN',
		null,
		'15/03/2015',
		'QĐ 12/QĐ-SYT',
		'Nội khoa, siêu âm',
		101.23,
		'01/06/2020',
		'Sở Y tế Nghệ An',
	]);
	ws.addRow([
		2,
		1002,
		'000222/NA-CCHN',
		CCCD_2,
		'Trần Thị Bình',
		'Khoa Ngoại',
		'Điều dưỡng',
		26546, // serial Excel = 04/09/1972
		null,
		'Thực hiện phạm vi hoạt động chuyên môn điều dưỡng',
		'000222/NA-CCHN',
		'Sở Y tế Hà Tĩnh',
		'02/11/2018',
	]);
	ws.addRow([3, 'ĐHV3', '', '', 'Lê Văn Cường']);
	const r = ws.addRow([4, 1003, '', '', 'Phạm Thị Dung', 'Khoa Nhi']);
	r.getCell(8).value = { error: '#N/A' };
	return wb.xlsx.writeBuffer();
}

const USERS = [
	{
		user_id: 'NV1001',
		staff_number: 1001,
		full_name: 'Nguyễn Văn An',
		department_name: 'Nội A',
		license_id: 'LIC1',
		license_no: '000111/NA-CCHN',
		practice_scope: 'Khám bệnh, chữa bệnh nội khoa',
		date_of_birth: null,
	},
	{
		user_id: 'NV1002',
		staff_number: 1002,
		full_name: 'Trần Thị Bình',
		department_name: 'Nhi',
		license_id: null,
		date_of_birth: null,
	},
	{
		user_id: 'NV1003',
		staff_number: 1003,
		full_name: 'Phạm Thị Dung',
		department_name: 'Nhi',
		license_id: null,
		date_of_birth: null,
	},
];

const log = install(async (text) => (text.includes('FROM users u') ? USERS : []));
const {
	importExcel,
	COLUMN_MATCHERS,
} = require('../../src/modules/staffLicenses/staffLicenseImportService');
const { findHeader, loadWorkbook } = require('../../src/utils/excelImport');

test('nhận diện đúng các cột của 2.xlsx; MNV lấy cột "MNV" chứ không phải "Mã nhân viên"; bỏ CCCD', async () => {
	const wb = await loadWorkbook(await buildFile());
	const { cols } = findHeader(wb, COLUMN_MATCHERS, (c) => !!(c.staff_no && c.license_no));
	assert.equal(cols.staff_no, 2);
	assert.equal(cols.full_name, 5);
	assert.equal(cols.department_hint, 6);
	assert.equal(cols.qualification, 7);
	assert.equal(cols.dob, 8);
	assert.equal(cols.practice_scope, 9);
	assert.equal(cols.practice_scope_single, 10);
	assert.equal(cols.license_no, 11);
	assert.equal(cols.issuing_authority_other, 12);
	assert.equal(cols.issued_date, 13);
	assert.equal(cols.scope_decision_no, 14);
	assert.equal(cols.adjusted_scope, 15);
	assert.equal(cols.scope_code, 16);
	assert.equal(cols.scope_adjusted_date, 17);
	assert.equal(cols.issuing_authority, undefined); // "Nơi cấp QĐ điều chỉnh" không phải nơi cấp CCHN
	assert.ok(!Object.values(cols).includes(4), 'cột CCCD không được nhận');
	assert.ok(!Object.values(cols).includes(3), 'cột "Mã nhân viên" (chứa số CCHN) không được nhận');
});

test('dry run: phạm vi NỐI ưu tiên hơn ĐƠN, nơi cấp mặc định Nghệ An, ngày sinh serial, cảnh báo lệch khoa', async () => {
	const res = await importExcel({ buffer: await buildFile(), dry_run: true }, 'ADMIN');
	assert.equal(res.summary.total, 4);
	assert.deepEqual(
		res.skipped.map((s) => s.row),
		[4],
	);
	const [a, b] = res.rows;

	assert.equal(a.staff_number, 1001);
	assert.equal(a.status, 'changed');
	assert.equal(a.values.practice_scope, 'Khám bệnh, chữa bệnh nội khoa; bổ sung siêu âm');
	assert.equal(a.values.issuing_authority, 'Sở Y tế Nghệ An');
	assert.equal(a.values.issued_date, '2015-03-15');
	assert.equal(a.values.scope_code, '101.23');
	assert.equal(a.values.scope_adjusted_date, '2020-06-01');
	assert.equal(a.user_values.date_of_birth, '1975-05-20');
	assert.ok(!a.changes.some((c) => c.field === 'license_no'), 'số CCHN không đổi');
	assert.deepEqual(a.warnings, []);

	assert.equal(b.staff_number, 1002);
	assert.equal(b.status, 'new');
	assert.equal(b.values.license_no, '000222/NA-CCHN');
	assert.equal(b.values.practice_scope, 'Thực hiện phạm vi hoạt động chuyên môn điều dưỡng');
	assert.equal(b.values.issuing_authority, 'Sở Y tế Hà Tĩnh');
	assert.equal(b.user_values.date_of_birth, '1972-09-04');
	assert.ok(b.warnings.some((w) => w.includes('Khoa Ngoại') && w.includes('Nhi')));

	// MNV 1003: ô ngày sinh #N/A, không có CCHN → không có gì để cập nhật
	assert.ok(!res.rows.some((r) => r.staff_number === 1003));
	assert.ok(!res.warnings.some((w) => w.includes('#N/A')));

	assert.ok(res.columns.includes('scope_code') && res.columns.includes('date_of_birth'));
	const json = JSON.stringify(res);
	assert.ok(!json.includes(CCCD_1) && !json.includes(CCCD_2), 'không đọc CCCD');
});

test('ghi: cập nhật CCHN + users.date_of_birth, không ghi CCCD, không đổi khoa', async () => {
	log.length = 0;
	const res = await importExcel({ buffer: await buildFile(), dry_run: false }, 'ADMIN');
	assert.equal(res.written, 2);
	const writes = log.filter((l) => /UPDATE|INSERT/.test(l.text));
	const licUpdate = writes.find((l) => l.text.includes('UPDATE staff_practice_licenses'));
	assert.equal(licUpdate.inputs.user_id, 'NV1001');
	assert.equal(licUpdate.inputs.scope_code, '101.23');
	const licInsert = writes.find((l) => l.text.includes('INSERT INTO staff_practice_licenses'));
	assert.equal(licInsert.inputs.user_id, 'NV1002');
	const userUpdates = writes.filter((l) => l.text.includes('UPDATE users SET'));
	assert.deepEqual(
		userUpdates.map((l) => [l.inputs.user_id, l.inputs.date_of_birth]),
		[
			['NV1001', '1975-05-20'],
			['NV1002', '1972-09-04'],
		],
	);
	assert.ok(!writes.some((l) => /department_id/.test(l.text)), 'không đổi khoa');
	const all = JSON.stringify(log);
	assert.ok(!all.includes(CCCD_1) && !all.includes(CCCD_2), 'không ghi CCCD');
});
