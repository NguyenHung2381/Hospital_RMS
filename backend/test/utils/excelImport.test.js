const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
	readSheet,
	parseDateCell,
	parseDateText,
	excelSerialToYmd,
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

test('parseDateText bỏ giờ phía sau, loại ngày không có thật', () => {
	assert.equal(parseDateText('05/03/2025 08:00'), '2025-03-05');
	assert.equal(parseDateText('5-3-2025 8:00:15'), '2025-03-05');
	assert.equal(parseDateText('29/02/2024'), '2024-02-29');
	assert.equal(parseDateText('29/02/2025'), null);
	assert.equal(parseDateText('31/04/2025'), null);
	assert.equal(parseDateText('00/01/2025'), null);
});

test('parseCredits / parseStaffNumber', () => {
	assert.equal(parseCredits('3,5'), 3.5);
	assert.equal(parseCredits(''), null);
	assert.equal(parseStaffNumber('NV-00123'), 123);
	assert.equal(parseStaffNumber('abc'), null);
});

test('parseDateCell đọc Date, số serial Excel (cả dạng chữ), chuỗi dd/mm/yyyy; năm trơn không phải serial', async () => {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('S');
	ws.addRow([new Date(Date.UTC(1984, 8, 12)), 26546, '26546', '5/1/1990', 1989, '1989', 'abc']);
	ws.getCell('H1').value = { formula: 'A1', result: 26546 };
	ws.getCell('I1').value = { error: '#N/A' };
	const cell = (c) => ws.getRow(1).getCell(c);
	assert.equal(parseDateCell(cell(1)), '1984-09-12');
	assert.equal(parseDateCell(cell(2)), '1972-09-04');
	assert.equal(parseDateCell(cell(3)), '1972-09-04');
	assert.equal(parseDateCell(cell(4)), '1990-01-05');
	assert.equal(parseDateCell(cell(5)), null);
	assert.equal(parseDateCell(cell(6)), null);
	assert.equal(parseDateCell(cell(7)), null);
	assert.equal(parseDateCell(cell(8)), '1972-09-04');
	assert.equal(parseDateCell(cell(9)), null);
	assert.equal(excelSerialToYmd(45658), '2025-01-01');
	assert.deepEqual(parseDob(cell(5)), { dob: null, dob_text: '1989' });
});

// Zip 1 mục tự dựng — `declared` = kích thước giải nén GHI trong mục lục (có thể khai man)
const zipOf = (name, raw, declared = raw.length) => {
	const zlib = require('zlib');
	const data = zlib.deflateRawSync(raw);
	const fname = Buffer.from(name);
	const local = Buffer.alloc(30);
	local.writeUInt32LE(0x04034b50, 0);
	local.writeUInt16LE(8, 8);
	local.writeUInt32LE(data.length, 18);
	local.writeUInt32LE(declared, 22);
	local.writeUInt16LE(fname.length, 26);
	const cd = Buffer.alloc(46);
	cd.writeUInt32LE(0x02014b50, 0);
	cd.writeUInt16LE(8, 10);
	cd.writeUInt32LE(data.length, 20);
	cd.writeUInt32LE(declared, 24);
	cd.writeUInt16LE(fname.length, 28);
	cd.writeUInt32LE(0, 42);
	const cdStart = local.length + fname.length + data.length;
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(1, 8);
	eocd.writeUInt16LE(1, 10);
	eocd.writeUInt32LE(cd.length + fname.length, 12);
	eocd.writeUInt32LE(cdStart, 16);
	return Buffer.concat([local, fname, data, cd, fname, eocd]);
};

test('chặn file Excel "bom nén" trước khi ExcelJS bung ra bộ nhớ', async () => {
	const { loadWorkbook, assertUnzippedSize } = require('../../src/utils/excelImport');
	const is400 = (re) => (e) => e.statusCode === 400 && re.test(e.message);

	// File thật vẫn đọc được
	const wb = await loadWorkbook(Buffer.from(await buffer([['Họ và tên'], ['Nguyễn Văn A']])));
	assert.equal(wb.worksheets[0].getRow(2).getCell(1).text, 'Nguyễn Văn A');

	// 30MB chữ "a" nén còn ~30KB — kể cả khi mục lục khai man kích thước = 1 byte
	const bomb = zipOf('xl/worksheets/sheet1.xml', Buffer.alloc(30 * 1024 * 1024, 'a'), 1);
	assert.ok(bomb.length < 100 * 1024);
	await assert.rejects(loadWorkbook(bomb), is400(/quá lớn/));
	assert.doesNotThrow(() => assertUnzippedSize(zipOf('a.xml', Buffer.alloc(1024, 'a'))));

	// Không phải zip / zip hỏng
	await assert.rejects(
		loadWorkbook(Buffer.from('not a zip at all, just text....')),
		is400(/không đọc được/),
	);
	await assert.rejects(loadWorkbook(bomb.subarray(0, 200)), is400(/không đọc được/));
});
