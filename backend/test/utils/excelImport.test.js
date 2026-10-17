const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
	readSheet,
	parseDob,
	parseCredits,
	parseStaffNumber,
} = require('../../src/utils/excelImport');

const MATCHERS = [
	['full_name', (h) => h === 'ho va ten'],
	['dob', (h) => h === 'ngay sinh'],
];

async function buffer(rows) {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('S');
	rows.forEach((r) => ws.addRow(r));
	return wb.xlsx.writeBuffer();
}

test('readSheet dò header dưới tiêu đề văn bản và bỏ dòng trống xen giữa', async () => {
	const buf = await buffer([
		['DANH SÁCH HỌC VIÊN'],
		[],
		['STT', 'Họ và tên', 'Ngày sinh'],
		[1, 'Nguyễn Văn A', '12/9/1984'],
		[],
		[2, 'Trần Thị B', '1989'],
	]);
	const { cols, rows } = await readSheet(buf, {
		matchers: MATCHERS,
		isValid: (c) => !!c.full_name,
		headerError: 'no header',
		isEmpty: (get, row) => !get(row, 'full_name'),
	});
	assert.equal(cols.full_name, 2);
	assert.deepEqual(
		rows.map(({ r, row, get }) => [r, get(row, 'full_name')]),
		[
			[4, 'Nguyễn Văn A'],
			[6, 'Trần Thị B'],
		],
	);
	assert.deepEqual(parseDob(rows[0].row.getCell(cols.dob)), { dob: '1984-09-12', dob_text: null });
	assert.deepEqual(parseDob(rows[1].row.getCell(cols.dob)), { dob: null, dob_text: '1989' });
});

test('readSheet báo lỗi 400 khi không có header', async () => {
	const buf = await buffer([['abc'], ['def']]);
	await assert.rejects(
		readSheet(buf, {
			matchers: MATCHERS,
			isValid: (c) => !!c.full_name,
			headerError: 'no header',
			isEmpty: () => false,
		}),
		(err) => err.statusCode === 400 && err.message === 'no header',
	);
});

test('parseCredits / parseStaffNumber', () => {
	assert.equal(parseCredits('3,5'), 3.5);
	assert.equal(parseCredits(''), null);
	assert.equal(parseStaffNumber('NV-00123'), 123);
	assert.equal(parseStaffNumber('abc'), null);
});
