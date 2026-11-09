// Hồi quy M-08 (audit run-4): import sổ thực hành khớp ghi danh theo Mã thực hành nhưng không
// được chuyển ghi danh (kèm chứng chỉ, điểm, kết quả luân khoa) sang học viên khác theo CCCD của
// dòng — việc đó vượt quyền courses:approve. Dòng có CCCD không khớp chủ ghi danh bị bỏ qua và
// cảnh báo ở bản xem trước; writeRecord không còn ghi trainee_id và ràng buộc đúng chủ.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { install } = require('../auth/fakeDb');

const CCCD_A = '001099000001';
const CCCD_B = '001099000002';
const ownerUpdateOk = true; // UPDATE course_enrollments khớp 1 dòng khi đúng chủ ghi danh

const log = install(async (text, inputs) => {
	if (/SELECT id, name, is_rolling FROM courses/.test(text))
		return [{ id: 'C1', name: 'GPHN', is_rolling: true }];
	if (/FROM course_enrollments WHERE practice_code IS NOT NULL/.test(text))
		return [{ id: 'E1', course_id: 'C1', trainee_id: 'T_A', practice_code: '100.BS' }];
	if (/FROM trainees WHERE national_id IS NOT NULL/.test(text))
		return [
			{ id: 'T_A', national_id: CCCD_A, hidden_at: null },
			{ id: 'T_B', national_id: CCCD_B, hidden_at: null },
		];
	if (/UPDATE course_enrollments/.test(text))
		return ownerUpdateOk && inputs.trainee_id === 'T_A' ? [{ id: inputs.id }] : [];
	return [];
});

// Ghi hồ sơ học viên là việc của traineeService — chỉ ghi lại id được sửa / tạo
const traineeService = require('../../src/modules/training/trainees/traineeService');
const touched = [];
traineeService.update = async (id) => {
	touched.push(id);
};
traineeService.create = async () => {
	touched.push('NEW');
	return { id: 'T_NEW' };
};

const {
	importBook,
	buildPreview,
} = require('../../src/modules/training/courses/practiceBookImportService');
const { writeRecord } = require('../../src/modules/training/courses/practiceBookWriter');

const book = async (rows) => {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Sheet1');
	ws.addRow(['Mã thực hành', 'Họ và tên', 'CCCD', 'Khoa thực hành 1']);
	for (const r of rows) ws.addRow(r);
	return wb.xlsx.writeBuffer();
};
const enrollUpdates = (n) => log.slice(n).filter((e) => /UPDATE course_enrollments/.test(e.text));

test('M-08: import có CCCD của học viên khác với mã thực hành đã có chủ → bỏ qua + cảnh báo (xem trước)', async () => {
	const n = log.length;
	touched.length = 0;
	const r = await importBook(
		'C1',
		{ buffer: await book([['100.BS', 'Trainee B', CCCD_B, '']]), dry_run: true },
		'U_ACTOR',
	);
	assert.equal(r.summary.records_update, 0);
	assert.equal(r.summary.skipped, 1);
	assert.ok(r.warnings.some((w) => /Mã thực hành thuộc học viên khác \(CCCD không khớp\)/.test(w)));
	assert.equal(enrollUpdates(n).length, 0);
});

test('M-08: import thật với CCCD không khớp → không đổi ghi danh, không sửa hồ sơ học viên của dòng đó', async () => {
	const n = log.length;
	touched.length = 0;
	const r = await importBook(
		'C1',
		{ buffer: await book([['100.BS', 'Trainee B', CCCD_B, '']]), dry_run: false },
		'U_ACTOR',
	);
	assert.equal(r.written, 0);
	assert.equal(enrollUpdates(n).length, 0, 'không câu UPDATE course_enrollments nào');
	assert.deepEqual(touched, [], 'học viên B (theo CCCD của dòng) không bị sửa / tạo');
});

test('M-08: dòng không có CCCD nhưng mã thực hành đã có chủ → cũng bị bỏ qua', async () => {
	const n = log.length;
	const r = await importBook(
		'C1',
		{ buffer: await book([['100.BS', 'Trainee A', '', '']]), dry_run: false },
		'U_ACTOR',
	);
	assert.equal(r.written, 0);
	assert.equal(enrollUpdates(n).length, 0);
});

test('M-08 đối chứng: CCCD đúng chủ ghi danh → cập nhật hồ sơ, UPDATE không ghi trainee_id', async () => {
	const n = log.length;
	touched.length = 0;
	const r = await importBook(
		'C1',
		{ buffer: await book([['100.BS', 'Trainee A', CCCD_A, '']]), dry_run: false },
		'U_ACTOR',
	);
	assert.equal(r.written, 1);
	assert.deepEqual(touched, ['T_A']);
	const ups = enrollUpdates(n);
	assert.equal(ups.length, 1);
	const set = ups[0].text.slice(ups[0].text.indexOf('SET'), ups[0].text.indexOf('WHERE'));
	assert.doesNotMatch(set, /trainee_id/);
	assert.match(
		ups[0].text,
		/WHERE id = @id AND course_id = @course_id AND trainee_id = @trainee_id/,
	);
	assert.equal(ups[0].inputs.trainee_id, 'T_A');
});

test('M-08: writeRecord (kiểm tra lại trong transaction) từ chối khi chủ ghi danh khác', async () => {
	const it = {
		record: { practice_code: '100.BS' },
		enrollment_id: 'E1',
		program_id: null,
		rotations: [],
	};
	const n = log.length;
	await assert.rejects(writeRecord({}, it, 'T_B', 'C1', 'U_ACTOR'), { statusCode: 409 });
	assert.ok(
		!log.slice(n).some((e) => /enrollment_rotations/.test(e.text)),
		'không thay vòng luân khoa',
	);
	// đúng chủ → ghi được
	assert.equal(await writeRecord({}, it, 'T_A', 'C1', 'U_ACTOR'), 'E1');
});

test('M-08: buildPreview — chủ ghi danh khớp thì giữ, lệch / học viên mới thì bỏ qua', () => {
	const rec = (row) => ({
		row,
		practice_code: '100.BS',
		full_name: 'X',
		rotations: [],
		main_mentor: null,
	});
	const lookups = {
		course: { id: 'C1' },
		matchDept: () => null,
		programByCode: new Map(),
		linkedPrograms: new Set(),
		userByStaffNo: new Map(),
		enrollmentByCode: new Map([['100.BS', { id: 'E1', course_id: 'C1', trainee_id: 'T_A' }]]),
		roundByProgramDept: new Map(),
	};
	const run = (t) => buildPreview([rec(2)], [t], lookups).items[0];
	assert.equal(run({ row: 2, trainee_id: 'T_A', action: 'update' }).skip, false);
	assert.equal(run({ row: 2, trainee_id: 'T_B', action: 'update' }).skip, true);
	assert.equal(run({ row: 2, trainee_id: null, action: 'new' }).skip, true);
});
