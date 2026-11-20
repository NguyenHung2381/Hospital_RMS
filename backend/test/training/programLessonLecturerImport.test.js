const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
	parseWorkbook,
	buildPreview,
	splitTitle,
	splitNames,
} = require('../../src/modules/training/programs/programLessonLecturerImportService');

test('splitTitle tách học hàm / học vị khỏi họ tên', () => {
	assert.deepEqual(splitTitle('ThS.BS Nguyễn Văn A'), { degree: 'ThS.BS', name: 'Nguyễn Văn A' });
	assert.deepEqual(splitTitle('PGS. TS. Trần Thị B'), { degree: 'PGS. TS', name: 'Trần Thị B' });
	assert.deepEqual(splitTitle('BS CK II Lê Văn C'), { degree: 'BS CK II', name: 'Lê Văn C' });
	assert.deepEqual(splitTitle('BSCKII. Phạm D'), { degree: 'BSCKII', name: 'Phạm D' });
	assert.deepEqual(splitTitle('  Nguyễn   Văn A '), { degree: null, name: 'Nguyễn Văn A' });
	// Chỉ có chữ viết tắt / tên 1 từ: không cắt
	assert.deepEqual(splitTitle('BS An'), { degree: null, name: 'BS An' });
});

test('splitNames tách nhiều giảng viên, bỏ trùng tên', () => {
	assert.deepEqual(
		splitNames('ThS. Nguyễn Văn A; BS Trần Thị B\nnguyễn văn a, Lê Văn C').map((p) => p.name),
		['Nguyễn Văn A', 'Trần Thị B', 'Lê Văn C'],
	);
	assert.deepEqual(splitNames('  '), []);
});

const LOOKUPS = () => ({
	program: { id: 'CT1', code: 'ĐTLT_1', name: 'Chương trình 1', department_id: 'D1' },
	lessons: [
		{ lesson_id: 'B1', code: 'ĐTLT_1_01', title: 'Bài một', lesson_kind: 'theory', lecturers: [] },
		{
			lesson_id: 'B2',
			code: 'ĐTLT_1_02',
			title: 'Bài hai',
			lesson_kind: 'theory',
			lecturers: [
				{ lecturer_id: 'GV1', role: 'main', full_name: 'Nguyễn Văn A' },
				{ lecturer_id: 'GV2', role: 'assistant', full_name: 'Trần Thị B' },
			],
		},
		{ lesson_id: 'B3', code: '', title: 'Bài ba', lesson_kind: 'theory', lecturers: [] },
		{ lesson_id: 'V1', code: 'TH_V1', title: 'Vòng 1', lesson_kind: 'rotation', lecturers: [] },
		{
			lesson_id: 'B4',
			code: 'ĐTLT_1_04',
			title: 'Bài bốn',
			lesson_kind: 'theory',
			lecturers: [{ lecturer_id: 'GV2', role: 'main', full_name: 'Trần Thị B' }],
		},
	],
	lecturers: [
		{ id: 'GV1', user_id: 'U1', full_name: 'Nguyễn Văn A', is_active: true, department_id: 'D1' },
		// Họ tên trong danh mục ghi kèm học vị — vẫn khớp theo phần tên
		{
			id: 'GV2',
			user_id: null,
			full_name: 'GS.TS. Trần Thị B',
			is_active: true,
			department_id: null,
		},
		// Trùng tên: 1 người ở khoa của chương trình, 1 người khoa khác
		{ id: 'GV3', user_id: 'U3', full_name: 'Lê Văn C', is_active: true, department_id: 'D1' },
		{ id: 'GV4', user_id: 'U4', full_name: 'Lê Văn C', is_active: true, department_id: 'D2' },
		// Trùng tên, không ai ở khoa của chương trình
		{ id: 'GV5', user_id: 'U5', full_name: 'Phạm Thị D', is_active: true, department_id: 'D2' },
		{ id: 'GV6', user_id: null, full_name: 'Phạm Thị D', is_active: true, department_id: null },
		{ id: 'GV7', user_id: null, full_name: 'Hoàng Văn E', is_active: false, department_id: null },
		// Hồ sơ giảng viên ghi tên khác tên tài khoản U8
		{ id: 'GV8', user_id: 'U8', full_name: 'Vũ Thị H (Nội)', is_active: true, department_id: 'D1' },
	],
	users: [
		{ id: 'U7', full_name: 'Đỗ Văn G', department_id: 'D1', is_active: true },
		{ id: 'U8', full_name: 'Vũ Thị H', department_id: 'D1', is_active: true },
		// Trùng tên 2 nhân sự cùng khoa
		{ id: 'U9', full_name: 'Bùi Văn K', department_id: 'D1', is_active: true },
		{ id: 'U10', full_name: 'Bùi Văn K', department_id: 'D1', is_active: true },
	],
});

const row = (r, code, title, main, assistants = '') => ({
	r,
	code,
	title,
	main: splitNames(main),
	assistants: splitNames(assistants),
});
const preview = (rows, options = { canCreateLecturer: true }) =>
	buildPreview(rows, LOOKUPS(), options);
const itemOf = (p, lessonId) => p.items.find((i) => i.lesson_id === lessonId);

test('khớp bài theo mã rồi theo tên; vòng thực hành và bài lạ bị bỏ qua', () => {
	const p = preview([
		row(5, 'ĐTLT_1_01', 'tên ghi khác', 'Nguyễn Văn A'),
		row(6, '', 'BÀI BA', 'Trần Thị B'),
		row(7, 'TH_V1', 'Vòng 1', 'Nguyễn Văn A'),
		row(8, 'KHONG_CO', 'Bài lạ', 'Nguyễn Văn A'),
		row(9, 'ĐTLT_1_01', 'Bài một', 'Trần Thị B'),
	]);
	assert.deepEqual(
		p.items.map((i) => [i.lesson_id, i.status, i.main.lecturer_id]),
		[
			['B1', 'set', 'GV1'],
			['B3', 'set', 'GV2'],
		],
	);
	assert.match(p.warnings.join('\n'), /Dòng 7: .*vòng thực hành/);
	assert.match(p.warnings.join('\n'), /Dòng 8: .*không thuộc chương trình/);
	assert.match(p.warnings.join('\n'), /Dòng 9: .*lặp lại/);
});

test('dòng giống hiện tại không đổi; ô trống gỡ giảng viên đang gán', () => {
	const p = preview([
		row(5, 'ĐTLT_1_02', '', 'ThS. Nguyễn Văn A', 'Trần Thị B'),
		row(6, 'ĐTLT_1_04', '', ''),
		row(7, 'ĐTLT_1_01', '', ''),
	]);
	assert.equal(itemOf(p, 'B2').status, 'unchanged');
	assert.equal(itemOf(p, 'B4').status, 'clear');
	assert.equal(itemOf(p, 'B1').status, 'unchanged');
	assert.match(p.warnings.join('\n'), /Dòng 6: .*sẽ gỡ 1 giảng viên/);
});

test('đổi vai trò chính / phụ là thay đổi; chính trùng phụ chỉ giữ vai trò chính', () => {
	const p = preview([
		row(5, 'ĐTLT_1_02', '', 'Trần Thị B', 'Nguyễn Văn A; Trần Thị B'),
		row(6, 'ĐTLT_1_01', '', 'Nguyễn Văn A; Trần Thị B', 'Trần Thị B'),
	]);
	const b2 = itemOf(p, 'B2');
	assert.equal(b2.status, 'set');
	assert.equal(b2.main.lecturer_id, 'GV2');
	assert.deepEqual(
		b2.assistants.map((a) => a.lecturer_id),
		['GV1'],
	);
	// Ô giảng viên chính ghi 2 người: người sau thành giảng viên phụ (không lặp)
	const b1 = itemOf(p, 'B1');
	assert.equal(b1.main.lecturer_id, 'GV1');
	assert.deepEqual(
		b1.assistants.map((a) => a.lecturer_id),
		['GV2'],
	);
	assert.match(p.warnings.join('\n'), /Dòng 6: ô giảng viên chính có 2 người/);
});

test('trùng tên giảng viên: lấy người thuộc khoa của chương trình, không thì bỏ qua dòng', () => {
	const p = preview([
		row(5, 'ĐTLT_1_01', '', 'Lê Văn C'),
		row(6, 'ĐTLT_1_02', '', 'Phạm Thị D', 'Nguyễn Văn A'),
		row(7, '', 'Bài ba', 'Hoàng Văn E'),
	]);
	assert.equal(itemOf(p, 'B1').main.lecturer_id, 'GV3');
	// Bỏ qua cả dòng: giảng viên đang gán của bài giữ nguyên
	assert.equal(itemOf(p, 'B2').status, 'skipped');
	assert.match(p.warnings.join('\n'), /Dòng 6: .*Phạm Thị D: trùng tên 2 giảng viên/);
	assert.equal(itemOf(p, 'B3').status, 'skipped');
	assert.match(p.warnings.join('\n'), /Dòng 7: .*đã ngừng hoạt động/);
});

test('tên chưa có trong danh mục: tạo giảng viên mới, gắn tài khoản khi khớp nhân sự', () => {
	const p = preview([
		row(5, 'ĐTLT_1_01', '', 'BSCKII. Đỗ Văn G', 'TS. Ngô Thị M; Bùi Văn K'),
		row(6, 'ĐTLT_1_02', '', 'Vũ Thị H', 'đỗ văn g'),
	]);
	const b1 = itemOf(p, 'B1');
	assert.equal(b1.status, 'set');
	assert.equal(b1.main.status, 'new');
	assert.equal(b1.main.user.id, 'U7');
	assert.equal(b1.main.degree, 'BSCKII');
	assert.deepEqual(
		b1.assistants.map((a) => [a.status, a.user?.id ?? null]),
		[
			['new', null],
			['new', null],
		],
	);
	// Nhân sự U8 đã là giảng viên GV8 (tên hồ sơ khác) → dùng lại, không tạo mới
	assert.equal(itemOf(p, 'B2').main.lecturer_id, 'GV8');
	// Mỗi người chỉ tạo 1 lần dù có ở nhiều dòng
	assert.deepEqual(
		p.newPeople.map((n) => n.name).sort(),
		['Bùi Văn K', 'Ngô Thị M', 'Đỗ Văn G'].sort(),
	);
	assert.equal(itemOf(p, 'B2').assistants[0], b1.main);
	assert.match(p.warnings.join('\n'), /"Ngô Thị M": không có trong nhân sự/);
	assert.match(p.warnings.join('\n'), /"Bùi Văn K": trùng tên 2 nhân sự cùng khoa/);
});

test('thiếu quyền thêm giảng viên: dòng có tên mới bị bỏ qua', () => {
	const p = preview([row(5, 'ĐTLT_1_01', '', 'Đỗ Văn G'), row(6, '', 'Bài ba', 'Nguyễn Văn A')], {
		canCreateLecturer: false,
	});
	assert.equal(itemOf(p, 'B1').status, 'skipped');
	assert.equal(itemOf(p, 'B3').status, 'set');
	assert.equal(p.newPeople.length, 0);
	assert.match(p.warnings.join('\n'), /cần quyền thêm giảng viên/);
});

test('parseWorkbook đọc file mẫu: dòng tiêu đề nằm dưới phần chú thích', async () => {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Giảng viên');
	ws.addRow(['Giảng viên giảng dạy — ĐTLT_1 · Chương trình 1']);
	ws.addRow(['Mỗi dòng 1 bài học…']);
	ws.addRow([]);
	ws.addRow([
		'STT',
		'Mã bài học',
		'Tên bài học',
		'Giảng viên chính',
		'Giảng viên phụ (nhiều người cách nhau bằng dấu ;)',
	]);
	ws.addRow([1, ' đtlt_1_01 ', 'Bài một', 'ThS. Nguyễn Văn A', 'Trần Thị B\nLê Văn C']);
	ws.addRow([2, 'ĐTLT_1_02', 'Bài hai', null, null]);
	const rows = await parseWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
	assert.equal(rows.length, 2);
	assert.equal(rows[0].code, 'ĐTLT_1_01');
	assert.deepEqual(rows[0].main, [{ degree: 'ThS', name: 'Nguyễn Văn A' }]);
	assert.deepEqual(
		rows[0].assistants.map((a) => a.name),
		['Trần Thị B', 'Lê Văn C'],
	);
	assert.deepEqual([rows[1].main, rows[1].assistants], [[], []]);
});
