// courseRegistrationService (bản khai đăng ký khóa đào tạo liên tục) trên CSDL giả:
// mã đăng ký, lọc snapshot, hóa đơn chỉ ngoại viện, đọc theo mã, mốc đối chiếu, gom Tờ trình.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

let rows = [];
let insertFailures = 0;
const log = install(async (text) => {
	if (/INSERT INTO course_registrations/.test(text) && insertFailures > 0) {
		insertFailures -= 1;
		throw Object.assign(new Error('duplicate key'), {
			code: '23505',
			severity: 'ERROR',
			constraint: 'uq_course_registrations_code',
		});
	}
	if (/FROM course_registrations r[\s\S]*JOIN course_enrollments/.test(text)) return rows;
	if (/UPDATE course_registrations SET/.test(text))
		return rows.length ? [{ enrollment_id: 'E1' }] : [];
	return [];
});

const svc = require('../../src/modules/training/registration/courseRegistrationService');

test('genCode: DK + 10 ký tự không có 0/O/1/I', async () => {
	for (let i = 0; i < 50; i++) assert.match(await svc.genCode(), /^DK[A-HJ-NP-Z2-9]{10}$/);
});

test('create: snapshot chỉ giữ khóa SNAPSHOT_FIELDS; nội viện không có hóa đơn; ngoại viện không có mã NV', async () => {
	log.length = 0;
	const out = await svc.create(
		'E1',
		{
			source: 'internal',
			staffUserId: 'U1',
			staffNumber: 123,
			departmentId: 'K1',
			snapshot: { full_name: ' A ', national_id: '040301001234', foo: 'x', hometown: '' },
			rulesVersion: '2026-01',
			verifiedEmail: 'a@b.vn',
			invoice: { invoice_org_name: 'X' },
		},
		null,
	);
	assert.equal(out.enrollment_id, 'E1');
	assert.match(out.registration_code, /^DK[A-HJ-NP-Z2-9]{10}$/);
	const ins = log.find((q) => /INSERT INTO course_registrations/.test(q.text)).inputs;
	assert.deepEqual(JSON.parse(ins.snapshot), { full_name: 'A', national_id: '040301001234' });
	assert.equal(ins.invoice_org_name, null);
	assert.equal(ins.staff_user_id, 'U1');
	assert.equal(ins.channel, 'public');
	assert.equal(ins.code, out.registration_code);

	log.length = 0;
	await svc.create(
		'E2',
		{
			source: 'external',
			staffUserId: 'U1',
			staffNumber: 1,
			departmentId: 'K1',
			snapshot: {},
			rulesVersion: '2026-01',
			invoice: { invoice_org_name: ' Phòng khám ' },
		},
		null,
	);
	const ext = log.find((q) => /INSERT INTO course_registrations/.test(q.text)).inputs;
	assert.equal(ext.staff_user_id, null);
	assert.equal(ext.staff_number, null);
	assert.equal(ext.department_id, null);
	assert.equal(ext.invoice_org_name, 'Phòng khám');
	await assert.rejects(svc.create('E3', { source: 'vip', snapshot: {} }, null), {
		statusCode: 400,
	});
});

test('create: trùng mã đăng ký (2 bản khai cùng lúc) ⇒ rút mã khác', async () => {
	log.length = 0;
	insertFailures = 1;
	await svc.create('E1', { source: 'external', snapshot: {}, rulesVersion: 'x' }, null);
	assert.equal(log.filter((q) => /INSERT INTO course_registrations/.test(q.text)).length, 2);
});

test('getByCode: không phân biệt hoa thường, bỏ khoảng trắng và dấu "-"; mã sai dạng vẫn 1 truy vấn, trả null', async () => {
	rows = [
		{ enrollment_id: 'E1', registration_code: 'DKABCDEFGH23', snapshot: '{"full_name":"A"}' },
	];
	log.length = 0;
	const r = await svc.getByCode('dk-abcd efgh23');
	assert.equal(log[0].inputs.code, 'DKABCDEFGH23');
	assert.deepEqual(r.snapshot, { full_name: 'A' });
	log.length = 0;
	assert.equal(await svc.getByCode('DK0000000000'), null, 'có số 0 ⇒ sai dạng');
	assert.equal(log.length, 1);
	rows = [];
});

test('setChecks: true ghi mốc (giữ mốc cũ), false xóa, khóa vắng mặt giữ nguyên; không có bản khai ⇒ 404', async () => {
	rows = [{ enrollment_id: 'E1', snapshot: '{}' }];
	log.length = 0;
	await svc.setChecks('E1', { id_checked: true, degree_checked: false }, 'QL1');
	const q = log.find((x) => /UPDATE course_registrations SET/.test(x.text));
	assert.match(q.text, /id_checked_at = COALESCE\(id_checked_at, /);
	assert.match(
		q.text,
		/id_checked_by = CASE WHEN id_checked_at IS NULL THEN @actor_id ELSE id_checked_by END/,
	);
	assert.match(q.text, /degree_checked_at = NULL, degree_checked_by = NULL/);
	assert.doesNotMatch(q.text, /proposal_checked/);
	assert.equal(q.inputs.actor_id, 'QL1');
	rows = [];
	await assert.rejects(svc.setChecks('E9', { id_checked: true }, 'QL1'), { statusCode: 404 });
});

test('listInternalGroups: gom theo khóa + chương trình + khoa; họ tên / năm sinh / trình độ lấy từ bản khai', async () => {
	const base = {
		course_id: 'KH1',
		course_name: 'Nội soi',
		start_date: null,
		end_date: null,
		program_id: 'CT1',
		program_name: 'Cơ bản',
		tuition_fee: '1500000',
		department_name: 'Khoa Nội',
		enrollment_status: 'pending',
		dossier_uploaded_at: null,
		proposal_checked_at: null,
	};
	rows = [
		{
			...base,
			enrollment_id: 'E1',
			staff_user_id: 'U1',
			staff_number: 1,
			department_id: 'K1',
			snapshot: JSON.stringify({ full_name: 'A', dob: '1990-02-03', qualification: 'BS' }),
		},
		{
			...base,
			enrollment_id: 'E2',
			staff_user_id: 'U2',
			staff_number: 2,
			department_id: 'K1',
			snapshot: JSON.stringify({ full_name: 'B' }),
		},
		{
			...base,
			enrollment_id: 'E3',
			staff_user_id: 'U3',
			staff_number: 3,
			department_id: 'K2',
			department_name: 'Khoa Ngoại',
			snapshot: '{}',
		},
	];
	log.length = 0;
	const groups = await svc.listInternalGroups({
		courseId: 'KH1',
		departmentId: 'K1',
		programId: 'CT1',
	});
	const q = log.at(-1);
	assert.match(q.text, /r\.source = 'internal'/);
	assert.match(q.text, /e\.course_id = @course_id/);
	assert.match(q.text, /r\.department_id = @department_id/);
	assert.match(q.text, /e\.program_id = @program_id/);
	assert.equal(groups.length, 2);
	assert.equal(groups[0].tuition_fee, 1500000);
	assert.deepEqual(
		groups[0].people.map((p) => [p.full_name, p.birth_year, p.qualification]),
		[
			['A', 1990, 'BS'],
			['B', null, null],
		],
	);
	assert.equal(groups[1].department_name, 'Khoa Ngoại');
	rows = [];
});
