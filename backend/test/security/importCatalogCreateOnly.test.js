// Hồi quy L-15 (run-4): import danh mục chương trình (POST /training-programs/import-catalog)
// chỉ yêu cầu quyền TẠO, nhưng commit từng ghi đè chương trình/vòng đã có. Vai trò chỉ có
// training_programs:create phải chỉ tạo được mã mới; có thêm training_programs:update mới
// được cập nhật bản ghi cũ. Chạy qua route thật + authorizePermission thật, CSDL giả, và
// ghi nhận các lệnh ghi của programService thay vì thực thi.
process.env.JWT_SECRET = 'test-secret';
// Tắt ClamAV như test/upload/secureUpload.test.js: .env dev đặt CLAMAV_HOST=clamav (chỉ
// phân giải được trong mạng Docker) nên chạy trên máy host upload sẽ bị từ chối fail-closed.
process.env.CLAMAV_HOST = '';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const ExcelJS = require('exceljs');
const { install } = require('../auth/fakeDb');

install(async (text) => {
	if (/SELECT id, name FROM departments/.test(text)) return [];
	if (/SELECT id FROM training_types/.test(text)) return [{ id: 'TRNTP-GPHN' }];
	if (/SELECT id FROM trainee_types/.test(text)) return [];
	// Đã có trong CSDL: chương trình GPHN_BS_1, vòng TH_BS_HSCC (gắn vào GPHN_BS_1)
	if (/SELECT id, code FROM training_programs WHERE code IS NOT NULL/.test(text))
		return [{ id: 'P_EXIST', code: 'GPHN_BS_1' }];
	if (/SELECT id, code FROM program_lessons/.test(text))
		return [{ id: 'L_EXIST', code: 'TH_BS_HSCC' }];
	if (/SELECT id, lesson_id, program_id FROM lesson_programs/.test(text))
		return [{ id: 'LP1', lesson_id: 'L_EXIST', program_id: 'P_EXIST' }];
	return [];
});

// Chặn xác thực thật: route dùng authenticate (đã được thay) và authorizePermission (thật).
const auth = require('../../src/middlewares/auth');
let currentPerms = new Set();
auth.authenticate = (req, _res, next) => {
	req.user = { id: 'U_CO', permissions: currentPerms };
	next();
};

const programService = require('../../src/modules/training/programs/trainingProgramService');
const calls = [];
const record =
	(name, ret) =>
	(...args) => {
		calls.push({ name, args });
		return ret;
	};
programService.update = record('update', {});
programService.updateLesson = record('updateLesson', {});
programService.updateLessonLink = record('updateLessonLink', {});
programService.create = record('create', { id: 'P_NEW' });
programService.createLesson = record('createLesson', { id: 'L_NEW' });
programService.linkLesson = record('linkLesson', { id: 'LP_NEW' });

const router = require('../../src/modules/training/programs/trainingPrograms.routes');
const app = express();
app.use('/api/v1/training-programs', router);

// Bảng có: GPHN_BS_1 (đã có), GPHN_BS_2 (mới); vòng TH_BS_HSCC (đã có), TH_MOI (mới,
// thuộc chương trình đã có), TH_MOI_2 (mới, thuộc chương trình mới).
const buildWorkbook = async () => {
	const wb = new ExcelJS.Workbook();
	const s1 = wb.addWorksheet('Ma CT');
	s1.addRow(['Mã Chương trình đào tạo', 'Tên Chương trình đào tạo', 'Học phí', 'Thời lượng']);
	s1.addRow(['GPHN_BS_1', 'Ten moi', '99.000.000', '1 tháng']);
	s1.addRow(['GPHN_BS_2', 'Chuong trinh moi', '10.000.000', '2 tháng']);
	const s2 = wb.addWorksheet('Bai hoc');
	s2.addRow(['Mã', 'Nội dung', 'Thời gian']);
	s2.addRow(['GPHN_BS_1', 'mo chuong trinh', '']);
	s2.addRow(['TH_BS_HSCC', 'Vong ghi de', '1 tháng']);
	s2.addRow(['TH_MOI', 'Vong moi thuoc chuong trinh cu', '1 tháng']);
	s2.addRow(['GPHN_BS_2', 'mo chuong trinh moi', '']);
	s2.addRow(['TH_MOI_2', 'Vong moi thuoc chuong trinh moi', '2 tháng']);
	return Buffer.from(await wb.xlsx.writeBuffer());
};

const withServer = async (fn) => {
	const srv = app.listen(0, '127.0.0.1');
	await new Promise((r) => srv.once('listening', r));
	try {
		return await fn(`http://127.0.0.1:${srv.address().port}/api/v1/training-programs`);
	} finally {
		await new Promise((r) => srv.close(r));
	}
};

const importAs = async (perms, { dry_run = '0' } = {}) => {
	currentPerms = new Set(perms);
	calls.length = 0;
	const buf = await buildWorkbook();
	const form = new FormData();
	form.append(
		'file',
		new Blob([buf], {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		}),
		'ct.xlsx',
	);
	form.append('dry_run', dry_run);
	return withServer(async (base) => {
		const res = await fetch(`${base}/import-catalog`, { method: 'POST', body: form });
		const body = await res.json();
		return { status: res.status, body, data: body.data ?? body };
	});
};

const WRITE_NAMES = [
	'update',
	'updateLesson',
	'updateLessonLink',
	'create',
	'createLesson',
	'linkLesson',
];
const names = () => calls.map((c) => c.name);

test('vai trò chỉ có create: không ghi đè chương trình/vòng đã có, vẫn tạo mới được', async () => {
	const r = await importAs(['training_programs:create', 'training_programs:read']);
	assert.equal(r.status, 200);
	const n = names();
	// Không lệnh sửa nào chạm bản ghi đã có
	assert.equal(n.includes('update'), false);
	assert.equal(n.includes('updateLesson'), false);
	assert.equal(n.includes('updateLessonLink'), false);
	// Chỉ tạo: chương trình mới, vòng mới thuộc chương trình mới + liên kết tương ứng
	const created = calls.filter((c) => c.name === 'create').map((c) => c.args[0].code);
	assert.deepEqual(created, ['GPHN_BS_2']);
	const lessonCreated = calls.filter((c) => c.name === 'createLesson').map((c) => c.args[0].code);
	assert.deepEqual(lessonCreated, ['TH_MOI_2']);
	const linked = calls.filter((c) => c.name === 'linkLesson');
	assert.deepEqual(
		linked.map((c) => [c.args[0], c.args[1]]),
		[['P_NEW', 'L_NEW']],
	);
	// Vòng TH_MOI thuộc chương trình đã có không được gắn thêm vào chương trình đó
	assert.equal(n.filter((x) => WRITE_NAMES.includes(x)).length, 3);

	assert.equal(r.data.programs_created, 1);
	assert.equal(r.data.programs_updated, 0);
	assert.equal(r.data.lessons_updated, 0);
	assert.equal(r.data.summary.programs_skipped, 1);
	assert.equal(r.data.summary.lessons_skipped, 2);
	assert.ok(r.data.warnings.some((w) => w.includes('GPHN_BS_1') && w.includes('bỏ qua')));
});

test('vai trò chỉ có create: dry-run đánh dấu bản ghi đã có là skipped và không ghi gì', async () => {
	const r = await importAs(['training_programs:create', 'training_programs:read'], {
		dry_run: '1',
	});
	assert.equal(r.status, 200);
	assert.equal(names().filter((x) => WRITE_NAMES.includes(x)).length, 0);
	const statusOf = (list, code) => list.find((x) => x.code === code)?.status;
	assert.equal(statusOf(r.data.programs, 'GPHN_BS_1'), 'skipped');
	assert.equal(statusOf(r.data.programs, 'GPHN_BS_2'), 'new');
	assert.equal(statusOf(r.data.lessons, 'TH_BS_HSCC'), 'skipped');
	assert.equal(statusOf(r.data.lessons, 'TH_MOI'), 'skipped');
	assert.equal(statusOf(r.data.lessons, 'TH_MOI_2'), 'new');
});

test('vai trò có cả create và update: vẫn cập nhật bản ghi đã có như trước', async () => {
	const r = await importAs([
		'training_programs:create',
		'training_programs:update',
		'training_programs:read',
	]);
	assert.equal(r.status, 200);
	const updated = calls.filter((c) => c.name === 'update').map((c) => c.args[0]);
	assert.deepEqual(updated, ['P_EXIST']);
	assert.equal(calls.filter((c) => c.name === 'updateLesson').length, 1);
	assert.equal(calls.filter((c) => c.name === 'updateLessonLink').length, 1);
	assert.equal(r.data.programs_updated, 1);
	assert.equal(r.data.summary.programs_skipped, 0);
	assert.equal(r.data.summary.lessons_skipped, 0);
});

test('superuser (system:manage) được cập nhật như trước', async () => {
	const r = await importAs(['system:manage']);
	assert.equal(r.status, 200);
	assert.equal(calls.filter((c) => c.name === 'update').length, 1);
});
