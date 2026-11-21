// Hồi quy L-04 (run-5): đăng ký hội thảo / đề tài công khai (created_by NULL) là dữ liệu người ngoài tự khai.
// Dòng ẩn danh không được tự gắn vào person đã xác thực / có tài khoản của nhân viên (R2–R5), không điền
// email/SĐT/ngày sinh của người ngoài vào hồ sơ nhân viên — mà xếp hàng chờ duyệt gộp. Dòng do nhân viên
// tạo (created_by có giá trị) vẫn gắn như cũ. Chạy trên CSDL giả; câu đọc tính is_anonymous theo đúng
// biểu thức SQL trong personService (CASE WHEN created_by IS NULL ...).
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

// Person của nhân viên: đã xác thực + có tài khoản.
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
];

// Dòng nguồn: created_by NULL = đăng ký công khai (ẩn danh); có giá trị = nhân viên tạo.
const ROWS = {
	topic_members: {
		TM_ANON: { name: 'Nguyễn Văn Bình', email: 'binh@bv.vn', created_by: null },
		TM_STAFF: { name: 'Nguyễn Văn Bình', email: 'binh@bv.vn', created_by: 'NV010001' },
	},
	seminar_participants: {
		SP_ANON: { full_name: 'Nguyễn Văn Bình', dob: '1985-02-02', created_by: null },
	},
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
	const sel = text.match(/FROM (topic_members|seminar_participants)\s+WHERE id = @id/);
	if (sel) {
		const r = ROWS[sel[1]][inputs.id];
		// tái hiện đúng biểu thức SQL: chỉ khi cấu hình có anonymousWhenNoCreator mới tính theo created_by
		const anonymous = /CASE WHEN created_by IS NULL THEN 1 ELSE 0 END\s+AS is_anonymous/.test(text)
			? r.created_by == null
				? 1
				: 0
			: 0;
		return [
			{
				id: inputs.id,
				person_id: null,
				full_name: r.name ?? r.full_name,
				email: r.email ?? null,
				phone: null,
				dob: r.dob ?? null,
				gender: null,
				national_id: null,
				staff_number: null,
				linked_user_id: null,
				is_internal: null,
				is_anonymous: anonymous,
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
		if (/p\.email = @email/.test(text)) pred = (p) => nameOk(p) && p.email === inputs.email;
		else if (/fn_normalize_phone/.test(text))
			pred = (p) => nameOk(p) && digits(p.phone) === digits(inputs.phone);
		else if (/p\.date_of_birth = @dob/.test(text))
			pred = (p) => nameOk(p) && p.dob === String(inputs.dob).slice(0, 10);
		else pred = () => false;
		return rows.filter(pred).map((p) => ({ pid: p.id }));
	}
	return [];
});

const db = require('../../src/config/db');
db.nextSequenceValues = async () => [100]; // personService destructure lúc nạp ⇒ vá trước khi require
const personService = require('../../src/modules/persons/personService');

const run = async (source, id) => {
	log.length = 0;
	const pid = await personService.syncPerson(source, id, { actorId: undefined });
	return {
		pid,
		linked: log.find((q) => new RegExp(`UPDATE ${source} SET person_id`).test(q.text))?.inputs
			.pid,
		createdPerson: log.some((q) => /INSERT INTO persons/.test(q.text)),
		candidate: log.find((q) => /INSERT INTO person_merge_candidates/.test(q.text))?.inputs,
		touched: log.filter((q) => /UPDATE persons SET/.test(q.text)).map((q) => q.inputs.pid),
	};
};

const STAFF_PID = 'PS00000500';

for (const [source, id, rule] of [
	['topic_members', 'TM_ANON', 'email + tên (R3)'],
	['seminar_participants', 'SP_ANON', 'tên + ngày sinh (R5)'],
]) {
	test(`L-04: ${source} ẩn danh khớp ${rule} với person nhân viên → không gắn, xếp hàng duyệt gộp`, async () => {
		const r = await run(source, id);
		assert.equal(r.linked, 'PS00000100', 'phải gắn vào person MỚI của chính dòng ẩn danh');
		assert.ok(r.createdPerson);
		assert.ok(!r.touched.includes(STAFF_PID), 'không điền dữ liệu người ngoài vào person nhân viên');
		assert.ok(r.candidate, 'phải xếp hàng chờ duyệt gộp');
		assert.deepEqual([r.candidate.a, r.candidate.b], ['PS00000100', STAFF_PID].sort());
	});
}

test('L-04: topic_members do nhân viên tạo (created_by có giá trị) vẫn gắn vào person nhân viên như cũ', async () => {
	const r = await run('topic_members', 'TM_STAFF');
	assert.equal(r.linked, STAFF_PID);
	assert.ok(!r.candidate);
});
