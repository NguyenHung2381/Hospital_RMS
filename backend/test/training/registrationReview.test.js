// Đối chiếu bản khai đăng ký khóa đào tạo liên tục:
//   - computeDiffs: bản khai ↔ hồ sơ học viên, chuẩn hóa ngày / khoảng trắng / hoa-thường;
//   - chốt chặn duyệt (quyết định 6): ngoại viện cần đối chiếu CCCD + văn bằng, nội viện cần
//     hồ sơ nộp bổ sung + đối chiếu tờ trình; tắt bằng TRAINING_REGISTRATION_REQUIRE_CHECKS =
//     'false'; lượt không có bản khai không bị ảnh hưởng; từ chối không bị chặn;
//   - duyệt hàng loạt: đăng ký thiếu mốc bị bỏ qua kèm lý do, phần còn lại vẫn duyệt;
//   - Tờ trình: số người đề xuất bỏ người bị từ chối, kèm 2 số tính từ CSDL.
// Chạy trên CSDL giả (test/auth/fakeDb) — service bản khai / giấy tờ bị thay.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

// ─── Thế giới giả ───────────────────────────────────────────────────────────
// enrollments: lượt ghi danh; registrations: bản khai theo mã ghi danh (vắng = ghi danh hộ)
const world = { enrollments: {}, registrations: {}, updates: [] };
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
		E_EXT: { source: 'external', id_checked_at: null, degree_checked_at: null },
		E_INT: { source: 'internal', proposal_checked_at: null, dossier_file_id: null },
		E_DONE: { source: 'external', id_checked_at: null, degree_checked_at: null },
	};
	world.updates = [];
};
reset();

install(async (text, inputs) => {
	if (/FROM course_registrations WHERE enrollment_id = @id/.test(text)) {
		const r = world.registrations[inputs.id];
		return r ? [r] : [];
	}
	if (/^\s*SELECT \* FROM course_enrollments WHERE id = @id/.test(text)) {
		const e = world.enrollments[inputs.id];
		return e ? [e] : [];
	}
	if (/UPDATE course_enrollments/.test(text)) {
		world.updates.push({ id: inputs.id, status: inputs.status });
		return [];
	}
	// registrationProposalService: số đã có giấy / đang học khóa khác
	if (/JOIN certificates ce/.test(text)) return [{ n: 2 }];
	if (/e\.course_id <> @course_id/.test(text)) return [{ n: 1 }];
	return [];
});

require('../../src/modules/events/eventService').broadcast = () => {};
const settings = require('../../src/modules/settings/systemSettingService');
let requireChecks; // undefined = chưa cấu hình (mặc định bật)
settings.getValue = async (key) =>
	key === 'TRAINING_REGISTRATION_REQUIRE_CHECKS' ? requireChecks : undefined;
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

const rejectsWith = (p, statusCode, re) =>
	assert.rejects(p, (e) => e.statusCode === statusCode && re.test(e.message));

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

// ─── Chốt chặn duyệt (đơn lẻ) ───────────────────────────────────────────────
test('ngoại viện chưa đối chiếu CCCD + văn bằng ⇒ không duyệt được, thông báo nêu đủ mốc thiếu', async () => {
	reset();
	requireChecks = undefined;
	await rejectsWith(
		enrollmentService.decideEnrollment('E_EXT', 'approved', 'U_ADMIN'),
		409,
		/còn thiếu: đối chiếu CCCD, đối chiếu văn bằng/,
	);
	assert.deepEqual(world.updates, []);
	// Chỉ còn thiếu văn bằng
	world.registrations.E_EXT.id_checked_at = new Date();
	await rejectsWith(
		enrollmentService.decideEnrollment('E_EXT', 'approved', 'U_ADMIN'),
		409,
		/còn thiếu: đối chiếu văn bằng\./,
	);
	world.registrations.E_EXT.degree_checked_at = new Date();
	const out = await enrollmentService.decideEnrollment('E_EXT', 'approved', 'U_ADMIN');
	assert.equal(out.status, 'approved');
	assert.deepEqual(world.updates, [{ id: 'E_EXT', status: 'approved' }]);
});

test('nội viện cần hồ sơ nộp bổ sung + đối chiếu tờ trình', async () => {
	reset();
	requireChecks = 'true';
	await assert.rejects(enrollmentService.decideEnrollment('E_INT', 'approved', 'U_ADMIN'), (e) => {
		assert.equal(e.code, gate.CHECKS_MISSING);
		assert.deepEqual(
			e.missing.map((m) => m.key),
			['dossier', 'proposal_checked'],
		);
		return true;
	});
	world.registrations.E_INT.dossier_file_id = 'TF1';
	await rejectsWith(
		enrollmentService.decideEnrollment('E_INT', 'approved', 'U_ADMIN'),
		409,
		/đối chiếu tờ trình/,
	);
	world.registrations.E_INT.proposal_checked_at = new Date();
	assert.equal(
		(await enrollmentService.decideEnrollment('E_INT', 'approved', 'U_ADMIN')).status,
		'approved',
	);
});

test("cấu hình TRAINING_REGISTRATION_REQUIRE_CHECKS = 'false' ⇒ duyệt được khi chưa đối chiếu", async () => {
	reset();
	requireChecks = 'false';
	assert.equal(
		(await enrollmentService.decideEnrollment('E_EXT', 'approved', 'U_ADMIN')).status,
		'approved',
	);
	assert.equal(
		(await enrollmentService.decideEnrollment('E_INT', 'approved', 'U_ADMIN')).status,
		'approved',
	);
	requireChecks = undefined;
});

test('lượt ghi danh không có bản khai (ghi danh hộ, nhập Excel) không bị chặn', async () => {
	reset();
	requireChecks = 'true';
	assert.equal(
		(await enrollmentService.decideEnrollment('E_PLAIN', 'approved', 'U_ADMIN')).status,
		'approved',
	);
});

test('từ chối không bao giờ bị chặn; đã duyệt rồi thì duyệt lại không bị chặn', async () => {
	reset();
	requireChecks = 'true';
	assert.equal(
		(await enrollmentService.decideEnrollment('E_EXT', 'rejected', 'U_ADMIN')).status,
		'rejected',
	);
	assert.equal(
		(await enrollmentService.decideEnrollment('E_INT', 'rejected', 'U_ADMIN')).status,
		'rejected',
	);
	assert.equal(
		(await enrollmentService.decideEnrollment('E_DONE', 'approved', 'U_ADMIN')).status,
		'approved',
	);
});

// ─── Duyệt hàng loạt ────────────────────────────────────────────────────────
test('duyệt hàng loạt: đăng ký thiếu mốc bị bỏ qua kèm lý do, phần còn lại vẫn được duyệt', async () => {
	reset();
	requireChecks = undefined;
	world.registrations.E_INT.dossier_file_id = 'TF1';
	const results = await enrollmentService.bulkDecideEnrollments(
		['E_EXT', 'E_PLAIN', 'E_INT'],
		'approved',
		'U_ADMIN',
	);
	assert.equal(results.length, 3);
	const byId = Object.fromEntries(results.map((r) => [r.id, r]));
	assert.equal(byId.E_PLAIN.status, 'approved');
	assert.equal(byId.E_EXT.skipped, true);
	assert.deepEqual(byId.E_EXT.missing, ['đối chiếu CCCD', 'đối chiếu văn bằng']);
	assert.match(byId.E_EXT.error, /còn thiếu/);
	assert.equal(byId.E_INT.skipped, true);
	assert.deepEqual(byId.E_INT.missing, ['đối chiếu tờ trình']);
	assert.deepEqual(world.updates, [{ id: 'E_PLAIN', status: 'approved' }]);
});

test('duyệt hàng loạt khi tắt cấu hình: duyệt hết; từ chối hàng loạt không bị chặn', async () => {
	reset();
	requireChecks = 'false';
	let results = await enrollmentService.bulkDecideEnrollments(
		['E_EXT', 'E_INT'],
		'approved',
		'U_ADMIN',
	);
	assert.ok(results.every((r) => r.status === 'approved' && !r.skipped));
	reset();
	requireChecks = 'true';
	results = await enrollmentService.bulkDecideEnrollments(
		['E_EXT', 'E_INT'],
		'rejected',
		'U_ADMIN',
	);
	assert.ok(results.every((r) => r.status === 'rejected' && !r.error));
	requireChecks = undefined;
});

// ─── Danh sách ghi danh: cờ "sẵn sàng duyệt" ────────────────────────────────
test('annotateEnrollments: gom cột bản khai thành registration + missing / ready theo cấu hình', async () => {
	requireChecks = undefined;
	const [plain, ext, int] = await gate.annotateEnrollments([
		{ id: 'A', reg_code: null },
		{
			id: 'B',
			reg_code: 'DKAAAA',
			reg_source: 'external',
			reg_id_checked_at: new Date(),
			reg_degree_checked_at: null,
		},
		{
			id: 'C',
			reg_code: 'DKBBBB',
			reg_source: 'internal',
			reg_dossier_file_id: 'TF',
			reg_proposal_checked_at: new Date(),
		},
	]);
	assert.equal(plain.registration, null);
	assert.equal('reg_code' in plain, false);
	assert.deepEqual(ext.registration.missing, ['đối chiếu văn bằng']);
	assert.equal(ext.registration.ready, false);
	assert.equal(int.registration.ready, true);
	requireChecks = 'false';
	const [off] = await gate.annotateEnrollments([
		{ id: 'B', reg_code: 'DKAAAA', reg_source: 'external' },
	]);
	assert.deepEqual(off.registration.missing, []);
	assert.equal(off.registration.ready, true);
	requireChecks = undefined;
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
