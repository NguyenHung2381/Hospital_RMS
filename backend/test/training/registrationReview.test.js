// Bản khai đăng ký khóa đào tạo liên tục:
//   - computeDiffs: bản khai ↔ hồ sơ học viên, chuẩn hóa ngày / khoảng trắng / hoa-thường;
//   - duyệt ghi danh: không còn chốt chặn mốc đối chiếu — lượt có bản khai duyệt được ngay,
//     cả duyệt đơn lẻ lẫn hàng loạt;
//   - annotateEnrollments: registration = null | { code, source, has_dossier (đủ hồ sơ bắt buộc), files_missing };
//   - getForReview: files (đủ các loại, file_url chỉ khi có quyền xem dữ liệu nhạy cảm) + files_missing;
//   - Tờ trình: số người đề xuất bỏ người bị từ chối, kèm 2 số tính từ CSDL.
// Chạy trên CSDL giả (test/auth/fakeDb) — service bản khai / giấy tờ bị thay.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

// ─── Thế giới giả ───────────────────────────────────────────────────────────
// enrollments: lượt ghi danh; registrations: bản khai theo mã ghi danh (vắng = ghi danh hộ)
const world = { enrollments: {}, registrations: {}, updates: [], files: {} };
const reset = () => {
	world.enrollments = {
		E_EXT: { id: 'E_EXT', course_id: 'C1', trainee_id: 'T1', status: 'pending', program_id: null },
		E_INT: { id: 'E_INT', course_id: 'C1', trainee_id: 'T2', status: 'pending', program_id: null },
		E_PLAIN: {
			id: 'E_PLAIN',
			course_id: 'C1',
			trainee_id: 'T3',
			status: 'pending',
			program_id: null,
		},
		E_DONE: {
			id: 'E_DONE',
			course_id: 'C1',
			trainee_id: 'T4',
			status: 'approved',
			program_id: null,
		},
	};
	world.registrations = {
		E_EXT: { source: 'external' },
		E_INT: { source: 'internal' },
		E_DONE: { source: 'external' },
	};
	world.updates = [];
	world.files = {};
};
reset();

install(async (text, inputs) => {
	if (/FROM course_registrations WHERE enrollment_id = @id/.test(text)) {
		const r = world.registrations[inputs.id];
		return r ? [r] : [];
	}
	// courseRegistrationService.getByEnrollment (SELECT_REGISTRATION)
	if (/FROM course_registrations r[\s\S]*WHERE r\.enrollment_id = @id/.test(text)) {
		const r = world.registrations[inputs.id];
		return r
			? [
					{
						enrollment_id: inputs.id,
						registration_code: 'DK' + inputs.id,
						snapshot: '{}',
						trainee_id: 'T1',
						...r,
					},
				]
			: [];
	}
	if (/^\s*SELECT \* FROM course_enrollments WHERE id = @id/.test(text)) {
		const e = world.enrollments[inputs.id];
		return e ? [e] : [];
	}
	if (/UPDATE course_enrollments/.test(text)) {
		world.updates.push({ id: inputs.id, status: inputs.status });
		return [];
	}
	// registrationFileService.listFiles — hồ sơ đã nộp của lượt
	if (/FROM course_registration_files crf\s+JOIN training_files/.test(text))
		return world.files[inputs.id] ?? [];
	// registrationReviewService.loadContext / loadProfile (getForReview)
	if (/AS profile_department_name/.test(text))
		return [
			{ course_id: 'C1', course_name: 'Khóa 1', program_name: null, enrollment_status: 'pending' },
		];
	if (/SELECT t\.\* FROM course_enrollments e JOIN trainees t/.test(text)) return [];
	// registrationProposalService: số đã có giấy / đang học khóa khác
	if (/JOIN certificates ce/.test(text)) return [{ n: 2 }];
	if (/e\.course_id <> @course_id/.test(text)) return [{ n: 1 }];
	return [];
});

require('../../src/modules/events/eventService').broadcast = () => {};
// courseEnrollmentService destructure getById lúc nạp ⇒ thay trước khi require
require('../../src/modules/training/courses/courseService').getById = async (id) => ({
	id,
	program_ids: [],
	training_type_id: null,
	is_rolling: false,
});

const gate = require('../../src/modules/training/registration/registrationApprovalGate');
const {
	computeDiffs,
	normalizeValue,
} = require('../../src/modules/training/registration/registrationReviewService');
const enrollmentService = require('../../src/modules/training/courses/courseEnrollmentService');
const docService = require('../../src/modules/training/registration/registrationDocumentService');
const proposalService = require('../../src/modules/training/registration/registrationProposalService');

// ─── So sánh bản khai ↔ hồ sơ ───────────────────────────────────────────────
test('computeDiffs: ngày, khoảng trắng, hoa/thường, số điện thoại khác cách viết thì không coi là lệch', () => {
	const snapshot = {
		full_name: '  Nguyễn   Văn  An ',
		dob: '1990-05-07',
		national_id_issued_date: '07/05/2021',
		phone: '0912 345 678',
		email: 'An@Example.com',
		graduated_year: 2012,
		gender: 'male',
	};
	const profile = {
		full_name: 'nguyễn văn an',
		dob: new Date('1990-05-07T00:00:00.000Z'),
		national_id_issued_date: new Date('2021-05-07T00:00:00.000Z'),
		phone: '0912.345.678',
		email: 'an@example.com',
		graduated_year: 2012,
		gender: 'male',
	};
	assert.deepEqual(computeDiffs(snapshot, profile), []);
});

test('computeDiffs: liệt kê đúng trường lệch (giá trị khai và giá trị hồ sơ), bỏ qua trường hồ sơ không có', () => {
	const diffs = computeDiffs(
		{
			full_name: 'Trần Thị B',
			dob: '1991-01-02',
			national_id: '040191000123',
			address: 'Vinh',
			degree_number: 'ABC123', // cột chưa có trong bảng trainees ⇒ bỏ qua
			hometown: 'Nghệ An', // không phải trường hồ sơ
		},
		{
			full_name: 'Trần Thị B',
			dob: new Date('1991-02-01T00:00:00.000Z'),
			national_id: null,
			address: 'Vinh',
		},
	);
	assert.deepEqual(diffs, [
		{ key: 'dob', declared: '1991-01-02', profile: '1991-02-01' },
		{ key: 'national_id', declared: '040191000123', profile: null },
	]);
});

test('computeDiffs: trường người đăng ký bỏ trống thì không báo lệch; Unicode tổ hợp = dựng sẵn', () => {
	const composed = 'Nguyễn'.normalize('NFC');
	const decomposed = 'Nguyễn'.normalize('NFD');
	assert.notEqual(composed, decomposed);
	assert.equal(normalizeValue('full_name', decomposed), normalizeValue('full_name', composed));
	assert.deepEqual(
		computeDiffs(
			{ address: '', full_name: decomposed },
			{ address: 'Hà Nội', full_name: composed },
		),
		[],
	);
});

// ─── Duyệt ghi danh có bản khai ─────────────────────────────────────────────
test('duyệt được lượt ghi danh có bản khai mà không cần mốc nào (ngoại viện lẫn nội viện chưa nộp hồ sơ)', async () => {
	reset();
	const ext = await enrollmentService.decideEnrollment('E_EXT', 'approved', 'U_ADMIN');
	assert.equal(ext.status, 'approved');
	const int = await enrollmentService.decideEnrollment('E_INT', 'approved', 'U_ADMIN');
	assert.equal(int.status, 'approved');
	assert.deepEqual(world.updates, [
		{ id: 'E_EXT', status: 'approved' },
		{ id: 'E_INT', status: 'approved' },
	]);
});

test('lượt ghi danh không có bản khai, từ chối và duyệt lại lượt đã duyệt đều chạy bình thường', async () => {
	reset();
	assert.equal(
		(await enrollmentService.decideEnrollment('E_PLAIN', 'approved', 'U_ADMIN')).status,
		'approved',
	);
	assert.equal(
		(await enrollmentService.decideEnrollment('E_EXT', 'rejected', 'U_ADMIN')).status,
		'rejected',
	);
	assert.equal(
		(await enrollmentService.decideEnrollment('E_DONE', 'approved', 'U_ADMIN')).status,
		'approved',
	);
});

test('duyệt hàng loạt: không đăng ký nào bị bỏ qua vì thiếu mốc', async () => {
	reset();
	const results = await enrollmentService.bulkDecideEnrollments(
		['E_EXT', 'E_PLAIN', 'E_INT'],
		'approved',
		'U_ADMIN',
	);
	assert.equal(results.length, 3);
	assert.ok(results.every((r) => r.status === 'approved' && !r.error && !r.skipped));
});

// ─── Danh sách ghi danh: tóm tắt bản khai ───────────────────────────────────
test('annotateEnrollments: gom cột bản khai thành registration { code, source, has_dossier, files_missing }', async () => {
	const [plain, ext, extFull, int, intOld, intHalf] = await gate.annotateEnrollments(
		[
			{ id: 'A', reg_code: null },
			{ id: 'B', reg_code: 'DKAAAA', reg_source: 'external', reg_file_kinds: null },
			{
				id: 'B2',
				reg_code: 'DKAAAB',
				reg_source: 'external',
				reg_file_kinds: 'national_id,degree,license,decision',
			},
			{ id: 'C', reg_code: 'DKBBBB', reg_source: 'internal', reg_file_kinds: 'application_signed' },
			{ id: 'D', reg_code: 'DKCCCC', reg_source: 'internal', reg_file_kinds: 'dossier' },
			{
				id: 'E',
				reg_code: 'DKDDDD',
				reg_source: 'internal',
				reg_file_kinds: 'application_signed,proposal_approved',
			},
		],
		{ sensitive: true },
	);
	assert.equal(plain.registration, null);
	assert.equal('reg_code' in plain, false);
	// Ngoại viện chưa nộp gì ⇒ thiếu đủ 4 loại (theo thứ tự khai báo)
	assert.deepEqual(ext.registration, {
		code: 'DKAAAA',
		source: 'external',
		has_dossier: false,
		files_missing: ['national_id', 'degree', 'license', 'decision'],
	});
	assert.deepEqual(extFull.registration, {
		code: 'DKAAAB',
		source: 'external',
		has_dossier: true,
		files_missing: [],
	});
	// Nội viện: thiếu tờ trình
	assert.deepEqual(int.registration, {
		code: 'DKBBBB',
		source: 'internal',
		has_dossier: false,
		files_missing: ['proposal_approved'],
	});
	// Đơn cũ có file gộp ⇒ đủ hồ sơ
	assert.deepEqual(intOld.registration, {
		code: 'DKCCCC',
		source: 'internal',
		has_dossier: true,
		files_missing: [],
	});
	assert.equal(intHalf.registration.has_dossier, true);
	assert.equal('reg_file_kinds' in int, false);
	assert.equal('reg_dossier_file_id' in int, false);
});

test('cột reg_file_kinds loại file đã xóa mềm và file ngoại viện bị từ chối', () => {
	const sqlText = gate.ENROLLMENT_COLUMNS_SQL;
	assert.match(sqlText, /course_registration_files crf/);
	assert.match(sqlText, /rf\.is_deleted = 'false'/);
	assert.match(sqlText, /COALESCE\(rd\.status, 'pending'\) <> 'rejected'/);
});

test('M-10: annotateEnrollments mặc định che mã đăng ký (route chỉ cần courses:read)', async () => {
	const [masked, plain] = await gate.annotateEnrollments([
		{ id: 'A', reg_code: 'DKQWERTYUP23', reg_source: 'internal', reg_file_kinds: null },
		{ id: 'B', reg_code: null },
	]);
	assert.equal(masked.registration.code, 'DK••••••UP23');
	assert.ok(!JSON.stringify(masked).includes('DKQWERTYUP23'));
	assert.equal(plain.registration, null);
	const [full] = await gate.annotateEnrollments(
		[{ id: 'A', reg_code: 'DKQWERTYUP23', reg_source: 'internal', reg_file_kinds: null }],
		{ sensitive: true },
	);
	assert.equal(full.registration.code, 'DKQWERTYUP23');
});

// ─── Xem bản khai: file hồ sơ ───────────────────────────────────────────────
test('getForReview: files đủ các loại + files_missing; file_url chỉ có khi có quyền trainees:read_sensitive; không còn dossier', async () => {
	reset();
	const reviewService = require('../../src/modules/training/registration/registrationReviewService');
	world.registrations.E_INT = { source: 'internal' };
	world.files.E_INT = [
		{
			kind: 'application_signed',
			uploaded_at: new Date('2026-11-19T08:00:00Z'),
			file_id: 'TF1',
			file_name: 'don.pdf',
			file_url: '/uploads/training/course_registration/E_INT/don.pdf',
			mime_type: 'application/pdf',
			review_status: null,
		},
	];
	const allowed = { permissions: new Set(['trainees:read_sensitive']) };
	const withPerm = await reviewService.getForReview('E_INT', allowed);
	assert.equal('dossier' in withPerm, false);
	assert.deepEqual(withPerm.files_missing, ['proposal_approved']);
	assert.deepEqual(
		withPerm.files.map((x) => [x.kind, x.file_name, x.file_url]),
		[
			['application_signed', 'don.pdf', '/uploads/training/course_registration/E_INT/don.pdf'],
			['proposal_approved', null, null],
		],
	);
	const without = await reviewService.getForReview('E_INT', { permissions: new Set() });
	// M-10: mã đăng ký + email là yếu tố tra cứu ở cổng công khai ⇒ chỉ read_sensitive thấy đủ mã
	assert.equal(withPerm.registration_code, 'DKE_INT');
	assert.equal(without.registration_code, 'DK••••••_INT');
	assert.ok(!JSON.stringify(without).includes('DKE_INT'));
	assert.equal(without.files[0].file_name, 'don.pdf');
	assert.equal(without.files[0].file_url, null, 'thiếu quyền ⇒ không có link xem file');
	assert.deepEqual(without.files_missing, ['proposal_approved']);

	// Ngoại viện: file bị từ chối tính là thiếu nhưng vẫn hiện trạng thái duyệt
	world.registrations.E_EXT = { source: 'external' };
	world.files.E_EXT = ['national_id', 'degree', 'license', 'decision'].map((kind) => ({
		kind,
		uploaded_at: new Date('2026-11-19T08:00:00Z'),
		file_id: 'TF_' + kind,
		file_name: kind + '.jpg',
		file_url: '/uploads/' + kind + '.jpg',
		mime_type: 'image/jpeg',
		review_status: kind === 'degree' ? 'rejected' : 'pending',
	}));
	const ext = await reviewService.getForReview('E_EXT', allowed);
	assert.deepEqual(ext.files_missing, ['degree']);
	assert.equal(ext.files.find((x) => x.kind === 'degree').review_status, 'rejected');
	assert.equal(ext.files.length, 4);
});

test('dossierForEnrollment: đọc file kind = dossier; không có ⇒ 404 "Chưa có hồ sơ nộp bổ sung."', async () => {
	reset();
	const reviewService = require('../../src/modules/training/registration/registrationReviewService');
	await assert.rejects(reviewService.dossierForEnrollment('E_INT'), {
		statusCode: 404,
		message: 'Chưa có hồ sơ nộp bổ sung.',
	});
	world.files.E_INT = [
		{
			kind: 'application_signed',
			uploaded_at: new Date(),
			file_id: 'TF1',
			file_name: 'don.pdf',
			file_url: '/uploads/a.pdf',
			mime_type: 'application/pdf',
			file_size: 10,
			review_status: null,
		},
	];
	await assert.rejects(reviewService.dossierForEnrollment('E_INT'), { statusCode: 404 });
	const when = new Date('2026-10-01T00:00:00Z');
	world.files.E_INT.push({
		kind: 'dossier',
		uploaded_at: when,
		file_id: 'TF9',
		file_name: 'gop.pdf',
		file_url: '/uploads/gop.pdf',
		mime_type: 'application/pdf',
		file_size: 99,
		review_status: null,
	});
	assert.deepEqual(await reviewService.dossierForEnrollment('E_INT'), {
		file_id: 'TF9',
		file_name: 'gop.pdf',
		file_url: '/uploads/gop.pdf',
		mime_type: 'application/pdf',
		file_size: 99,
		uploaded_at: when,
	});
});

// ─── Tờ trình ───────────────────────────────────────────────────────────────
test('Tờ trình: bỏ người bị từ chối, proposed_count = số người còn lại, kèm số đã có giấy / đang học khóa khác', async () => {
	let received = null;
	docService.renderProposal = async (data) => {
		received = data;
		return { buffer: Buffer.from('x'), filename: 'to-trinh.docx', mime: docService.DOCX_MIME };
	};
	await proposalService.renderGroup({
		course_id: 'C1',
		course_name: 'Nội soi tiêu hóa',
		program_id: 'P1',
		program_name: 'Nội soi trên',
		department_id: 'K1',
		department_name: 'Khoa Nội tiêu hóa',
		tuition_fee: 1500000,
		people: [
			{
				staff_number: 101,
				full_name: 'A',
				birth_year: 1990,
				qualification: 'BS',
				enrollment_status: 'pending',
			},
			{
				staff_number: 102,
				full_name: 'B',
				birth_year: 1991,
				qualification: 'ĐD',
				enrollment_status: 'rejected',
			},
			{
				staff_number: 103,
				full_name: 'C',
				birth_year: 1992,
				qualification: 'BS',
				enrollment_status: 'approved',
			},
		],
	});
	assert.deepEqual(
		received.people.map((p) => p.staff_number),
		[101, 103],
	);
	assert.deepEqual(received.analysis, {
		technique: null,
		certified_count: 2,
		proposed_count: 2,
		in_other_training_count: 1,
		reason: null,
	});
	assert.equal(received.department_name, 'Khoa Nội tiêu hóa');
});
