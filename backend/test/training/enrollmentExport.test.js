// Xuất danh sách học viên của khóa ra Excel:
//   - dựng workbook: chế độ toàn khóa (1 sheet, cột Chương trình) / theo chương trình (mỗi chương trình 1 sheet);
//   - cột CCCD chỉ có khi includeNationalId; ngày không lệch (DATE / timestamp đọc bằng getter UTC);
//   - sắp theo tên (từ cuối) kiểu tiếng Việt; tên sheet ≤ 31 ký tự, bỏ ký tự cấm, không trùng;
//   - chuẩn hóa tùy chọn + lọc trạng thái / chương trình (CSDL giả cho phần đọc dữ liệu).
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { install } = require('../auth/fakeDb');
const {
	buildCourseEnrollmentWorkbook,
	fileNameOf,
	safeSheetName,
	sortByName,
	fmtDate,
	UNASSIGNED_SHEET,
} = require('../../src/modules/training/courses/exports/courseEnrollmentWorkbook');

// CSDL giả phải cài TRƯỚC khi nạp service (service destructure getPool lúc nạp module)
const world = { programs: [], rows: [] };
install(async (text) => {
	if (/FROM course_programs cp/.test(text)) return world.programs;
	if (/FROM course_enrollments e/.test(text)) return world.rows;
	return [];
});
const svc = require('../../src/modules/training/courses/enrollmentExportService');

const row = (over) => ({
	full_name: 'Nguyễn Văn An',
	dob: new Date(Date.UTC(1990, 4, 7)),
	gender: 'male',
	national_id: '012345678901',
	phone: '0912345678',
	email: 'an@example.com',
	workplace: 'BV Đa khoa X',
	department_name: null,
	qualification: 'Bác sĩ',
	is_internal: false,
	program_id: 'P1',
	program_code: 'ĐTLT-1',
	program_name: 'Chương trình 1',
	status: 'approved',
	// timestamp lưu giờ VN, đọc ra như UTC: 23:30 vẫn phải là ngày 20
	registered_at: new Date(Date.UTC(2026, 10, 20, 23, 30)),
	...over,
});

const course = {
	name: 'Khóa Tim mạch 01',
	start_date: new Date(Date.UTC(2026, 11, 1)),
	end_date: new Date(Date.UTC(2026, 11, 31)),
};
const programs = [
	{ id: 'P1', code: 'ĐTLT-1', name: 'Chương trình 1' },
	{ id: 'P2', code: null, name: 'Chương trình hai không mã' },
];

const reload = async (wb) => {
	const out = new ExcelJS.Workbook();
	await out.xlsx.load(await wb.xlsx.writeBuffer());
	return out;
};
const headers = (ws) => ws.getRow(ws.headRow || 3).values.slice(1);
const cell = (ws, r, c) => ws.getRow(r).getCell(c).value;

test('fmtDate: đọc theo getter UTC, không lệch ngày', () => {
	assert.equal(fmtDate(new Date(Date.UTC(2026, 10, 20, 23, 30))), '20/11/2026');
	assert.equal(fmtDate(new Date(Date.UTC(1990, 4, 7))), '07/05/1990');
	assert.equal(fmtDate(null), '');
});

test('sortByName: theo tên (từ cuối) rồi họ tên, tiếng Việt', () => {
	const names = sortByName([
		{ full_name: 'Trần Văn Bình' },
		{ full_name: 'Lê Thị An' },
		{ full_name: 'Nguyễn Văn Ân' },
		{ full_name: 'Phạm Thị Ba' },
		{ full_name: 'Hoàng Văn An' },
	]).map((x) => x.full_name);
	assert.deepEqual(names, [
		'Hoàng Văn An',
		'Lê Thị An',
		'Nguyễn Văn Ân',
		'Phạm Thị Ba',
		'Trần Văn Bình',
	]);
});

test('safeSheetName: bỏ ký tự cấm, cắt 31 ký tự, không trùng', () => {
	const used = new Set();
	assert.equal(safeSheetName('A/B:C*D?[E]\\F', used), 'A B C D E F');
	const long = 'x'.repeat(40);
	const a = safeSheetName(long, used);
	const b = safeSheetName(long, used);
	assert.equal(a.length, 31);
	assert.ok(b.length <= 31 && b !== a && b.endsWith('(2)'));
	// Trùng không phân biệt hoa-thường với 'A B C D E F' ở trên
	assert.equal(safeSheetName('a b c d e f', used), 'a b c d e f (2)');
	assert.equal(safeSheetName('', used), 'Sheet');
});

test('fileNameOf: slug không dấu', () => {
	assert.equal(
		fileNameOf('Khóa Đào tạo Tim mạch 01'),
		'danh-sach-hoc-vien-khoa-dao-tao-tim-mach-01.xlsx',
	);
	assert.equal(fileNameOf('???'), 'danh-sach-hoc-vien-khoa-hoc.xlsx');
});

test('chế độ toàn khóa: 1 sheet, có cột Chương trình, sắp theo chương trình rồi theo tên', async () => {
	const wb = buildCourseEnrollmentWorkbook({
		mode: 'course',
		course,
		programs,
		includeNationalId: true,
		rows: [
			row({
				full_name: 'Trần Văn Bình',
				program_id: 'P2',
				program_code: null,
				program_name: 'Chương trình hai không mã',
			}),
			row({ full_name: 'Lê Thị Cúc', program_id: 'P1' }),
			row({ full_name: 'Nguyễn Văn An', program_id: 'P1' }),
			row({ full_name: 'Phạm Văn Dũng', program_id: null, program_code: null, program_name: null }),
		],
	});
	const out = await reload(wb);
	assert.deepEqual(
		out.worksheets.map((w) => w.name),
		['Danh sách học viên'],
	);
	const ws = out.worksheets[0];
	assert.equal(cell(ws, 1, 1), 'DANH SÁCH HỌC VIÊN');
	assert.equal(cell(ws, 2, 1), 'Khóa Tim mạch 01 · 01/12/2026 – 31/12/2026 · 4 học viên');
	assert.deepEqual(headers(ws), [
		'STT',
		'Họ và tên',
		'Ngày sinh',
		'Giới tính',
		'Số CCCD',
		'Điện thoại',
		'Email',
		'Đơn vị công tác / Khoa',
		'Trình độ',
		'Đối tượng',
		'Chương trình',
		'Trạng thái',
		'Ngày đăng ký',
	]);
	const names = [4, 5, 6, 7].map((r) => cell(ws, r, 2));
	assert.deepEqual(names, ['Nguyễn Văn An', 'Lê Thị Cúc', 'Trần Văn Bình', 'Phạm Văn Dũng']);
	assert.deepEqual(
		[4, 5, 6, 7].map((r) => cell(ws, r, 1)),
		[1, 2, 3, 4],
	);
	assert.equal(cell(ws, 4, 3), '07/05/1990');
	assert.equal(cell(ws, 4, 4), 'Nam');
	assert.equal(cell(ws, 4, 5), '012345678901');
	assert.equal(cell(ws, 4, 11), 'Chương trình 1');
	assert.equal(cell(ws, 6, 11), 'Chương trình hai không mã');
	assert.equal(cell(ws, 7, 11), '');
	assert.equal(cell(ws, 4, 12), 'Đã duyệt');
	assert.equal(cell(ws, 4, 13), '20/11/2026');
});

test('không có quyền nhạy cảm: bỏ hẳn cột Số CCCD', async () => {
	const wb = buildCourseEnrollmentWorkbook({
		mode: 'course',
		course,
		programs,
		includeNationalId: false,
		rows: [row({})],
	});
	const ws = (await reload(wb)).worksheets[0];
	assert.ok(!headers(ws).includes('Số CCCD'));
	const all = [];
	ws.eachRow((r) => r.eachCell((c) => all.push(String(c.value))));
	assert.ok(!all.includes('012345678901'));
});

test('đối tượng và đơn vị: nội viện lấy tên khoa, ngoại viện lấy workplace', async () => {
	const wb = buildCourseEnrollmentWorkbook({
		mode: 'course',
		course,
		programs,
		rows: [
			row({ full_name: 'A An', is_internal: true, department_name: 'Khoa Nội', workplace: null }),
			row({
				full_name: 'B Bình',
				is_internal: false,
				department_name: 'Khoa Lạ',
				workplace: 'BV Huyện',
			}),
		],
	});
	const ws = (await reload(wb)).worksheets[0];
	assert.equal(cell(ws, 4, 7), 'Khoa Nội');
	assert.equal(cell(ws, 4, 9), 'Nội viện');
	assert.equal(cell(ws, 5, 7), 'BV Huyện');
	assert.equal(cell(ws, 5, 9), 'Ngoại viện');
});

test('chế độ theo chương trình: mỗi chương trình 1 sheet, sheet rỗng vẫn có, chưa xếp riêng', async () => {
	const wb = buildCourseEnrollmentWorkbook({
		mode: 'program',
		course,
		programs,
		rows: [
			row({ full_name: 'Lê Thị Cúc', program_id: 'P1' }),
			row({ full_name: 'Nguyễn Văn An', program_id: 'P1' }),
			row({ full_name: 'Phạm Văn Dũng', program_id: null, program_code: null, program_name: null }),
		],
	});
	const out = await reload(wb);
	assert.deepEqual(
		out.worksheets.map((w) => w.name),
		['Chương trình 1', 'Chương trình hai không mã', UNASSIGNED_SHEET],
	);
	const p1 = out.getWorksheet('Chương trình 1');
	assert.equal(cell(p1, 2, 1), 'Khóa Tim mạch 01 · Chương trình 1 · 2 học viên');
	assert.ok(!headers(p1).includes('Chương trình'));
	assert.deepEqual(
		[4, 5].map((r) => cell(p1, r, 2)),
		['Nguyễn Văn An', 'Lê Thị Cúc'],
	);
	const empty = out.getWorksheet('Chương trình hai không mã');
	assert.equal(empty.rowCount, 3);
	assert.match(String(cell(empty, 2, 1)), /0 học viên$/);
	assert.equal(out.getWorksheet(UNASSIGNED_SHEET).rowCount, 4);
});

test('chế độ theo chương trình: không có chương trình lẫn học viên ⇒ 1 sheet trống có tiêu đề', async () => {
	const out = await reload(
		buildCourseEnrollmentWorkbook({ mode: 'program', course, programs: [], rows: [] }),
	);
	assert.equal(out.worksheets.length, 1);
	assert.equal(cell(out.worksheets[0], 1, 1), 'DANH SÁCH HỌC VIÊN');
});

test('chế độ theo chương trình: tên trùng / quá dài vẫn ra sheet khác nhau', async () => {
	const dup = [
		{ id: 'A', code: 'MA1', name: 'Siêu âm cơ bản' },
		{ id: 'B', code: 'MA2', name: 'siêu âm cơ bản' },
		{ id: 'C', code: null, name: 'Chương trình đào tạo rất dài hơn ba mươi mốt ký tự nhiều' },
	];
	const out = await reload(
		buildCourseEnrollmentWorkbook({ mode: 'program', course, programs: dup, rows: [] }),
	);
	const names = out.worksheets.map((w) => w.name);
	assert.equal(new Set(names.map((n) => n.toLowerCase())).size, 3);
	assert.ok(names.every((n) => n.length <= 31));
});

test('normalizeOptions: mặc định course + approved, bỏ trạng thái lạ', () => {
	assert.deepEqual(svc.normalizeOptions({}), {
		mode: 'course',
		statuses: ['approved'],
		programIds: [],
	});
	assert.deepEqual(
		svc.normalizeOptions({
			mode: 'program',
			statuses: ['pending', 'pending', 'bogus', 'waitlisted'],
			program_ids: ['P1', 'P1', ''],
		}),
		{ mode: 'program', statuses: ['pending', 'waitlisted'], programIds: ['P1'] },
	);
	assert.deepEqual(svc.normalizeOptions({ statuses: ['bogus'] }).statuses, ['approved']);
	assert.equal(svc.normalizeOptions({ mode: 'xxx' }).mode, 'course');
});

test('filterRows / filterPrograms', () => {
	const rows = [
		row({ status: 'approved', program_id: 'P1' }),
		row({ status: 'pending', program_id: 'P2' }),
		row({ status: 'approved', program_id: null }),
	];
	assert.equal(svc.filterRows(rows, { statuses: ['approved'], programIds: [] }).length, 2);
	assert.equal(svc.filterRows(rows, { statuses: ['approved'], programIds: ['P1'] }).length, 1);
	assert.equal(
		svc.filterRows(rows, { statuses: ['approved', 'pending'], programIds: ['P2'] }).length,
		1,
	);
	assert.deepEqual(
		svc.filterPrograms(programs, ['P2']).map((p) => p.id),
		['P2'],
	);
	assert.equal(svc.filterPrograms(programs, []).length, 2);
});

test('getExportData: đọc từ CSDL giả rồi lọc theo tùy chọn', async () => {
	world.programs = programs;
	world.rows = [
		row({ status: 'approved', program_id: 'P1', is_internal: 1 }),
		row({ status: 'pending', program_id: 'P1' }),
		row({ status: 'approved', program_id: 'P2' }),
	];
	const data = await svc.getExportData('C1', { mode: 'program', program_ids: ['P1'] });
	assert.equal(data.mode, 'program');
	assert.deepEqual(
		data.programs.map((p) => p.id),
		['P1'],
	);
	assert.equal(data.rows.length, 1);
	assert.equal(data.rows[0].is_internal, true);
});
