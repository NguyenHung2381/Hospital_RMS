// Quyền theo bản ghi ở cổng nhân viên cho đơn đăng ký khóa đào tạo liên tục (luồng L5):
//   - /me/course-registrations/:enrollmentId/(application|dossier): chỉ chủ bản khai
//     (staff_user_id); bản khai của người khác trả 404 và KHÔNG ghi file nào xuống đĩa;
//   - /me/department-proposals(+/document): tài khoản khoa, trưởng khoa của chính khoa đó,
//     hoặc người có bản khai trong đúng nhóm đó; còn lại 404 / không thấy nhóm.
// Router thật gắn vào Express, CSDL giả; service bản khai / giấy tờ (luồng L2, L3) bị thay.
process.env.JWT_SECRET = 'test-secret';
const os = require('os');
const path = require('path');
const fs = require('fs');
const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-reg-portal-'));
process.env.UPLOADS_DIR = UPLOADS;
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { install } = require('../auth/fakeDb');

// ─── Thế giới giả ───────────────────────────────────────────────────────────
// Tài khoản → khoa + vai trò quản lý khoa (dept_head: trưởng khoa; account: tài khoản khoa)
const USERS = {
	U_A: { department_id: 'K1' }, // nhân viên K1, có bản khai trong nhóm C1/P1/K1
	U_B: { department_id: 'K1' }, // nhân viên K1, không đăng ký
	U_C: { department_id: 'K2' }, // nhân viên K2, có bản khai trong nhóm C1/P1/K2
	U_HEAD1: { department_id: 'K1', head: true },
	U_HEAD2: { department_id: 'K2', head: true },
	NV010000: { department_id: 'K1', account: 'K1' }, // tài khoản dùng chung của K1
};
const REGS = {
	E_A: {
		enrollment_id: 'E_A',
		staff_user_id: 'U_A',
		source: 'internal',
		department_id: 'K1',
		registration_code: 'DKA',
	},
	E_A2: {
		enrollment_id: 'E_A2',
		staff_user_id: 'U_A',
		source: 'external',
		department_id: null,
		registration_code: 'DKA2',
	},
	E_C: {
		enrollment_id: 'E_C',
		staff_user_id: 'U_C',
		source: 'internal',
		department_id: 'K2',
		registration_code: 'DKC',
	},
	E_EXT: {
		enrollment_id: 'E_EXT',
		staff_user_id: null,
		source: 'external',
		department_id: null,
		registration_code: 'DKX',
	},
};
const person = (enrollmentId, uid, name) => ({
	enrollment_id: enrollmentId,
	staff_user_id: uid,
	staff_number: 100,
	full_name: name,
	birth_year: 1990,
	qualification: 'BS',
	enrollment_status: 'pending',
	dossier_uploaded_at: null,
	proposal_checked_at: null,
});
const GROUPS = [
	{
		course_id: 'C1',
		course_name: 'Khóa 1',
		program_id: 'P1',
		program_name: 'CT 1',
		department_id: 'K1',
		department_name: 'Khoa Một',
		people: [person('E_A', 'U_A', 'A')],
	},
	{
		course_id: 'C1',
		course_name: 'Khóa 1',
		program_id: 'P1',
		program_name: 'CT 1',
		department_id: 'K2',
		department_name: 'Khoa Hai',
		people: [person('E_C', 'U_C', 'C')],
	},
	{
		course_id: 'C2',
		course_name: 'Khóa 2',
		program_id: null,
		program_name: null,
		department_id: 'K1',
		department_name: 'Khoa Một',
		people: [person('E_X', 'U_X', 'X')],
	},
];

install(async (text, inputs) => {
	// registrationPortalService.managedDepartments — mô phỏng đúng các điều kiện của câu SQL
	if (/LEFT JOIN departments d ON d\.dept_account_id = u\.id/.test(text)) {
		const u = USERS[inputs.uid];
		if (!u) return [];
		assert.match(text, /u\.role_id = @dept_head_role/);
		return [
			{
				department_id: u.department_id,
				own_dept: u.head || /^NV.*0000$/.test(inputs.uid) ? 1 : 0,
				account_department_id: u.account ?? null,
			},
		];
	}
	// Vai trò trưởng khoa (roleCodes.roleIdOf)
	if (/FROM roles/.test(text)) return [{ id: 'VT_HEAD', code: 'dept_head' }];
	// registrationReviewService.loadContext (Đơn đăng ký)
	if (/AS id_checked_by_name/.test(text))
		return [{ course_name: 'Khóa 1', program_name: 'CT 1', department_name: 'Khoa Một' }];
	return [];
});

// Công tắc module + hạn mức upload: luôn bật / không giới hạn
require('../../src/modules/settings/systemSettingService').getValue = async () => undefined;
const quota = require('../../src/utils/uploadQuota');
quota.quotaBytes = async () => 0;
quota.add = async () => {};

const auth = require('../../src/middlewares/auth');
auth.authenticate = (req, _res, next) => {
	req.user = { id: String(req.headers['x-user'] || 'U_NOBODY'), permissions: new Set() };
	next();
};

const regService = require('../../src/modules/training/registration/courseRegistrationService');
const calls = { attachDossier: [], renderApplication: [], renderProposal: [], listByStaff: [] };
regService.getByEnrollment = async (id) => (REGS[id] ? { ...REGS[id], snapshot: {} } : null);
regService.listByStaff = async (uid) => {
	calls.listByStaff.push(uid);
	return Object.values(REGS).filter((r) => r.staff_user_id === uid);
};
regService.listInternalGroups = async ({ courseId, departmentId, programId } = {}) =>
	GROUPS.filter(
		(g) =>
			(!courseId || g.course_id === courseId) &&
			(!departmentId || g.department_id === departmentId) &&
			(!programId || g.program_id === programId),
	);
regService.attachDossier = async (id, file, actorId) => {
	calls.attachDossier.push({ id, actorId, name: file.originalname });
	return { file_id: 'TF1' };
};
const docService = require('../../src/modules/training/registration/registrationDocumentService');
docService.renderApplication = async (data) => {
	calls.renderApplication.push(data);
	return { buffer: Buffer.from('DOCX'), filename: 'don.docx', mime: docService.DOCX_MIME };
};
docService.renderProposal = async (data) => {
	calls.renderProposal.push(data);
	return { buffer: Buffer.from('DOCX'), filename: 'to-trinh.docx', mime: docService.DOCX_MIME };
};

const app = express();
app.use(express.json());
app.use('/api/v1/me', require('../../src/modules/portal/me.routes'));
const { errorHandler } = require('../../src/middlewares/errorHandler');
app.use(errorHandler);

let base;
let srv;
test.before(async () => {
	srv = app.listen(0, '127.0.0.1');
	await new Promise((r) => srv.once('listening', r));
	base = `http://127.0.0.1:${srv.address().port}/api/v1/me`;
});
test.after(async () => {
	await new Promise((r) => srv.close(r));
	fs.rmSync(UPLOADS, { recursive: true, force: true });
});

const get = (uid, p) => fetch(base + p, { headers: { 'x-user': uid } });
const filesUnder = (dir) =>
	fs.existsSync(dir)
		? fs
				.readdirSync(dir, { withFileTypes: true })
				.flatMap((e) =>
					e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)],
				)
		: [];
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const upload = (uid, enrollmentId, name = 'ho-so.pdf', bytes = PDF) => {
	const form = new FormData();
	form.append('file', new Blob([bytes], { type: 'application/pdf' }), name);
	return fetch(`${base}/course-registrations/${enrollmentId}/dossier`, {
		method: 'POST',
		body: form,
		headers: { 'x-user': uid },
	});
};

// ─── Bản khai của tôi ───────────────────────────────────────────────────────
test('danh sách bản khai chỉ lấy theo tài khoản đang đăng nhập', async () => {
	const res = await get('U_A', '/course-registrations');
	assert.equal(res.status, 200);
	const { data } = await res.json();
	assert.deepEqual(data.map((r) => r.enrollment_id).sort(), ['E_A', 'E_A2']);
	assert.equal(data.find((r) => r.enrollment_id === 'E_A').needs_dossier, true);
	assert.equal(calls.listByStaff.at(-1), 'U_A');
});

test('tải Đơn của người khác / bản khai không gắn nhân viên ⇒ 404; của mình ⇒ .docx', async () => {
	calls.renderApplication.length = 0;
	for (const id of ['E_C', 'E_EXT', 'E_NONE']) {
		const res = await get('U_A', `/course-registrations/${id}/application`);
		assert.equal(res.status, 404, id);
	}
	assert.equal(calls.renderApplication.length, 0);
	const res = await get('U_C', '/course-registrations/E_C/application');
	assert.equal(res.status, 200);
	assert.match(res.headers.get('content-disposition'), /don\.docx/);
	assert.equal(calls.renderApplication[0].registration_code, 'DKC');
});

test('nộp hồ sơ cho bản khai của người khác ⇒ 404, không ghi file nào xuống đĩa', async () => {
	calls.attachDossier.length = 0;
	for (const id of ['E_C', 'E_EXT', 'E_NONE']) {
		const res = await upload('U_A', id);
		assert.equal(res.status, 404, id);
	}
	assert.equal(calls.attachDossier.length, 0);
	assert.deepEqual(filesUnder(UPLOADS), []);
});

test('nộp hồ sơ cho bản khai ngoại viện của chính mình ⇒ 400 trước khi nhận file', async () => {
	const res = await upload('U_A', 'E_A2');
	assert.equal(res.status, 400);
	assert.deepEqual(filesUnder(UPLOADS), []);
});

test('nộp PDF cho bản khai nội viện của chính mình ⇒ gọi attachDossier đúng người, đúng mã', async () => {
	calls.attachDossier.length = 0;
	const res = await upload('U_A', 'E_A');
	assert.equal(res.status, 200, await res.clone().text());
	const { data } = await res.json();
	assert.equal(data.uploaded, true);
	assert.deepEqual(calls.attachDossier, [{ id: 'E_A', actorId: 'U_A', name: 'ho-so.pdf' }]);
});

// ─── Nhóm theo khoa / Tờ trình ──────────────────────────────────────────────
const groupsOf = async (uid) => {
	const res = await get(uid, '/department-proposals');
	assert.equal(res.status, 200);
	return (await res.json()).data
		.map((g) => `${g.course_id}/${g.program_id ?? '-'}/${g.department_id}`)
		.sort();
};

test('danh sách nhóm: người đăng ký chỉ thấy nhóm của mình; khoa / trưởng khoa thấy mọi nhóm của khoa', async () => {
	assert.deepEqual(await groupsOf('U_A'), ['C1/P1/K1']);
	assert.deepEqual(await groupsOf('U_B'), []);
	assert.deepEqual(await groupsOf('U_C'), ['C1/P1/K2']);
	assert.deepEqual(await groupsOf('U_HEAD1'), ['C1/P1/K1', 'C2/-/K1']);
	assert.deepEqual(await groupsOf('U_HEAD2'), ['C1/P1/K2']);
	assert.deepEqual(await groupsOf('NV010000'), ['C1/P1/K1', 'C2/-/K1']);
	assert.deepEqual(await groupsOf('U_NOBODY'), []);
});

test('ma trận tải Tờ trình của khoa K1 (lớp C1/P1)', async () => {
	const doc = (uid, q) => get(uid, `/department-proposals/document?${q}`);
	const K1 = 'course_id=C1&program_id=P1&department_id=K1';
	const cases = [
		['U_A', 200], // có bản khai trong nhóm
		['U_HEAD1', 200], // trưởng khoa K1
		['NV010000', 200], // tài khoản khoa K1
		['U_B', 404], // cùng khoa nhưng không đăng ký
		['U_C', 404], // đăng ký cùng lớp nhưng khoa khác
		['U_HEAD2', 404], // trưởng khoa khác
		['U_NOBODY', 404],
	];
	for (const [uid, status] of cases) {
		calls.renderProposal.length = 0;
		const res = await doc(uid, K1);
		assert.equal(res.status, status, uid);
		if (status === 200) assert.equal(calls.renderProposal[0].department_name, 'Khoa Một', uid);
		else assert.equal(calls.renderProposal.length, 0, uid);
	}
	// Không ghi khoa: tự chọn nhóm duy nhất mình được xem
	calls.renderProposal.length = 0;
	assert.equal((await doc('U_HEAD2', 'course_id=C1&program_id=P1')).status, 200);
	assert.equal(calls.renderProposal[0].department_name, 'Khoa Hai');
	// Người đăng ký không xem được nhóm khác của khoa mình
	assert.equal((await doc('U_A', 'course_id=C2&department_id=K1')).status, 404);
	assert.equal((await doc('U_HEAD1', 'course_id=C2&department_id=K1')).status, 200);
});
