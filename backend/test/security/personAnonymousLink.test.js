// Hồi quy L-05 (run-4): dòng học viên tạo ẩn danh (đăng ký khóa học công khai, created_by NULL) không được
// tự gắn vào person đã xác thực / có tài khoản (R1, R3–R5) — chuyển vào person_merge_candidates; không điền
// SĐT/CCCD của người ngoài vào hồ sơ person của nhân viên. Và assertAssignable chỉ đếm ghi danh đã duyệt.
// Chạy trên CSDL giả có mô phỏng bộ lọc person của các câu so khớp.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

// Person của nhân viên: đã xác thực + có tài khoản. Person của học viên cũ: chưa xác thực, không tài khoản.
const PERSONS = [
	{
		id: 'PS00000500',
		name_key: 'nguyễn văn bình',
		email: 'binh@bv.vn',
		phone: '0911222333',
		dob: '1985-02-02',
		national_id: null,
		verified: true,
		hasAccount: true,
	},
	{
		id: 'PS00000007',
		name_key: 'lê thị cúc',
		email: 'cuc@mail.vn',
		phone: '0988777666',
		dob: '1992-09-09',
		national_id: '079000000007',
		verified: false,
		hasAccount: false,
	},
];
// Dòng học viên (bảng nguồn)
const TRAINEES = {
	HVA: { full_name: 'Nguyễn  Văn Bình', email: 'binh@bv.vn', anon: 1 },
	HVP: { full_name: 'Nguyễn Văn Bình', phone: '0911 222 333', anon: 1 },
	HVD: { full_name: 'Nguyễn Văn Bình', dob: '1985-02-02', anon: 1 },
	HVC: { full_name: 'Người Khác', national_id: '079000000007', anon: 1 },
	HVS: { full_name: 'Nguyễn Văn Bình', email: 'binh@bv.vn', anon: 0 }, // nhân viên tạo (có created_by)
	HVU: { full_name: 'Lê Thị Cúc', email: 'cuc@mail.vn', anon: 1 }, // khớp person chưa được bảo vệ
	HVN: { full_name: 'Hoàn Toàn Mới', email: 'moi@mail.vn', anon: 1 },
};

const digits = (v) => String(v ?? '').replace(/\D/g, '');
const key = (v) =>
	String(v ?? '')
		.replace(/ +/g, ' ')
		.trim()
		.toLowerCase();

const log = install(async (text, inputs) => {
	if (/information_schema\.tables/.test(text))
		return ['persons', 'seq_person_id', 'fn_normalize_phone', 'person_id'].map((n) => ({ n }));
	if (/FROM trainees\s+WHERE id = @id/.test(text)) {
		const t = TRAINEES[inputs.id];
		return [
			{
				id: inputs.id,
				person_id: null,
				full_name: t.full_name,
				email: t.email ?? null,
				phone: t.phone ?? null,
				dob: t.dob ?? null,
				gender: null,
				national_id: t.national_id ?? null,
				staff_number: null,
				linked_user_id: null,
				is_internal: null,
				// bản thật suy từ created_by IS NULL ở SQL — ở đây trả theo kịch bản và kiểm tra riêng câu SQL
				is_anonymous: t.anon,
			},
		];
	}
	if (/SELECT p\.id AS pid FROM persons p/.test(text)) {
		let rows = PERSONS;
		const onlyProtected = /p\.is_verified = 'true' OR EXISTS/.test(text);
		const onlyUnprotected = /p\.is_verified = 'false' AND NOT EXISTS/.test(text);
		if (onlyProtected) rows = rows.filter((p) => p.verified || p.hasAccount);
		if (onlyUnprotected) rows = rows.filter((p) => !p.verified && !p.hasAccount);
		const nameOk = (p) => p.name_key === key(inputs.name);
		let pred;
		if (/p\.national_id = @national_id/.test(text))
			pred = (p) => p.national_id === inputs.national_id;
		else if (/p\.email = @email/.test(text)) pred = (p) => nameOk(p) && p.email === inputs.email;
		else if (/fn_normalize_phone/.test(text))
			pred = (p) => nameOk(p) && digits(p.phone) === digits(inputs.phone);
		else if (/p\.date_of_birth = @dob/.test(text))
			pred = (p) => nameOk(p) && p.dob === String(inputs.dob).slice(0, 10);
		else pred = () => false;
		return rows.filter(pred).map((p) => ({ pid: p.id }));
	}
	if (/SELECT origin_table FROM persons/.test(text)) return [{ origin_table: 'trainees' }];
	return [];
});

const db = require('../../src/config/db');
db.nextSequenceValues = async () => [100]; // personService destructure lúc nạp ⇒ vá trước khi require
const personService = require('../../src/modules/persons/personService');

const run = async (id) => {
	log.length = 0;
	const pid = await personService.syncPerson('trainees', id, { actorId: undefined });
	return {
		pid,
		linked: log.find((q) => /UPDATE trainees SET person_id/.test(q.text))?.inputs.pid,
		createdPerson: log.some((q) => /INSERT INTO persons/.test(q.text)),
		candidate: log.find((q) => /INSERT INTO person_merge_candidates/.test(q.text))?.inputs,
		touched: log.filter((q) => /UPDATE persons SET/.test(q.text)).map((q) => q.inputs.pid),
	};
};

test('L-05: câu đọc dòng học viên đánh dấu ẩn danh theo created_by IS NULL', async () => {
	await run('HVA');
	const sel = log.find((q) => /FROM trainees\s+WHERE id = @id/.test(q.text));
	assert.match(sel.text, /CASE WHEN created_by IS NULL THEN 1 ELSE 0 END\s+AS is_anonymous/);
});

for (const [id, rule, reason] of [
	['HVA', 'email + tên (R3)', 'SAME_EMAIL'],
	['HVP', 'SĐT + tên (R4)', 'SAME_PHONE'],
	['HVD', 'tên + ngày sinh (R5)', 'SAME_NAME_DOB'],
]) {
	test(`L-05: nguồn ẩn danh khớp ${rule} với person nhân viên → không gắn, đưa vào person_merge_candidates`, async () => {
		const r = await run(id);
		const staffPid = 'PS00000500';
		assert.equal(r.linked, 'PS00000100', 'phải gắn vào person MỚI của chính dòng ẩn danh');
		assert.ok(r.createdPerson);
		assert.ok(
			!r.touched.includes(staffPid),
			'không điền dữ liệu của người ngoài vào person nhân viên',
		);
		assert.ok(r.candidate, 'phải xếp hàng chờ duyệt gộp');
		assert.equal(r.candidate.reason, reason);
		assert.deepEqual([r.candidate.a, r.candidate.b], ['PS00000100', 'PS00000500'].sort());
		assert.ok(r.candidate.a < r.candidate.b, 'chk_pmc_order: person_a_id < person_b_id');
	});
}

test('L-05: nguồn ẩn danh khớp CCCD với person được bảo vệ → xếp hàng duyệt, không gắn', async () => {
	// đổi person nhân viên mang CCCD để R1 trúng person được bảo vệ
	PERSONS[0].national_id = '079000000001';
	TRAINEES.HVC.national_id = '079000000001';
	const r = await run('HVC');
	assert.equal(r.linked, 'PS00000100');
	assert.ok(!r.touched.includes('PS00000500'));
	assert.equal(r.candidate.reason, 'SAME_NAME');
	assert.match(r.candidate.note, /CCCD/);
	PERSONS[0].national_id = null;
});

test('L-05: ca hợp lệ — dòng do nhân viên tạo (created_by có giá trị) vẫn tự gắn như cũ', async () => {
	const r = await run('HVS');
	assert.equal(r.linked, 'PS00000500');
	assert.equal(r.candidate, undefined);
	assert.ok(!r.createdPerson);
});

test('L-05: ca hợp lệ — nguồn ẩn danh khớp person chưa xác thực/không tài khoản vẫn được gắn (không tạo person trùng)', async () => {
	const r = await run('HVU');
	assert.equal(r.linked, 'PS00000007');
	assert.equal(r.candidate, undefined);
	assert.ok(!r.createdPerson);
});

test('L-05: ca hợp lệ — nguồn ẩn danh không khớp ai → tạo person mới, không có hàng đợi', async () => {
	const r = await run('HVN');
	assert.equal(r.linked, 'PS00000100');
	assert.ok(r.createdPerson);
	assert.equal(r.candidate, undefined);
});

// ─── assertAssignable: chỉ đếm ghi danh đã duyệt / danh sách chờ ──────────────
const { DB_ENROLLMENTS } = { DB_ENROLLMENTS: [] };
test('L-05: assertAssignable — ghi danh pending (cổng công khai) không chặn, approved/waitlisted vẫn chặn', async () => {
	const enrollments = DB_ENROLLMENTS;
	const { install: install2 } = require('../auth/fakeDb');
	const lecLog = install2(async (text) => {
		if (/FROM lecturers l\s+LEFT JOIN users u/.test(text)) {
			// mô phỏng điều kiện trạng thái trong câu SQL thật
			const counted = /e\.status IN \('approved', 'waitlisted'\)/.test(text)
				? enrollments.filter((s) => s === 'approved' || s === 'waitlisted')
				: /e\.status <> 'rejected'/.test(text)
					? enrollments.filter((s) => s !== 'rejected')
					: [];
			return [{ full_name: 'GV Bình', is_active: true, role_id: 'VT07', enrolled: counted.length }];
		}
		if (/SELECT id, code FROM roles|FROM roles/.test(text))
			return [{ id: 'VT09', code: 'trainee' }];
		return [];
	});
	void lecLog;
	const svc = require('../../src/modules/training/courses/lecturerAssignmentService');
	const blocked = (e) => e?.statusCode === 400 && /học viên của khóa học/.test(e.message);
	const attempt = async () => {
		try {
			await svc.assignLecturer('KH1', { lecturer_id: 'GV1' }, 'U1');
			return null;
		} catch (e) {
			return e; // các lỗi khác (ghi phân công trên CSDL giả) không liên quan
		}
	};
	enrollments.splice(0, enrollments.length, 'pending');
	assert.ok(
		!blocked(await attempt()),
		'ghi danh pending ẩn danh không được chặn phân công giảng viên',
	);
	enrollments.splice(0, enrollments.length, 'approved');
	assert.ok(blocked(await attempt()), 'học viên đã duyệt vẫn bị chặn');
	enrollments.splice(0, enrollments.length, 'waitlisted');
	assert.ok(blocked(await attempt()), 'học viên danh sách chờ vẫn bị chặn');
	enrollments.splice(0, enrollments.length, 'rejected');
	assert.ok(!blocked(await attempt()), 'ghi danh bị từ chối không chặn');
});
