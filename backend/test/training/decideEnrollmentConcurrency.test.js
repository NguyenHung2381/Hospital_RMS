// Duyệt ghi danh vào lớp có sĩ số (courseEnrollmentService.decideEnrollment): đếm chỗ trống
// và ghi phải nằm trong khoá chung course-class-waitlist (giữ tới khi commit). Trước đây
// đọc chỗ rồi ghi riêng, không khoá ⇒ 2 người duyệt cùng lúc vào lớp còn 1 chỗ đều được
// duyệt, vượt sĩ số. Khóa đã hủy: không duyệt thêm (từ chối vẫn được).
process.env.LOG_LEVEL = 'silent';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');
const db = require('../../src/config/db');

// Trạng thái "CSDL": hồ sơ ghi danh của lớp P1 (sĩ số tối đa MAX)
const MAX = 1;
const rows = new Map();
const reset = () => {
	rows.clear();
	for (const id of ['E1', 'E2'])
		rows.set(id, {
			id,
			course_id: 'KH1',
			trainee_id: `T_${id}`,
			program_id: 'P1',
			status: 'pending',
		});
};

install(async (text, inputs) => {
	if (/SELECT \* FROM course_enrollments WHERE id = @id/.test(text))
		return [{ ...rows.get(inputs.id) }];
	if (/SELECT status FROM course_enrollments WHERE id = @id/.test(text))
		return [{ status: rows.get(inputs.id).status }];
	if (/UPDATE course_enrollments/.test(text)) {
		rows.get(inputs.id).status = inputs.status;
		return [];
	}
	if (/waitlist_position/.test(text)) return [{ waitlist_position: 1 }];
	return [];
});

// Khoá chung = mutex, nhả khi transaction kết thúc (như pg_advisory_xact_lock)
let lockEnabled = true;
let lockCalls = 0;
let queue = Promise.resolve();
const held = new WeakMap();
db.withTransaction = async (fn) => {
	const tx = new db.sql.Transaction();
	try {
		return await fn(tx);
	} finally {
		held.get(tx)?.();
	}
};

const course = { id: 'KH1', status: 'draft', training_type_id: 'X', is_rolling: false };
require('../../src/modules/training/courses/courseService').getById = async () => course;
const pcs = require('../../src/modules/training/courses/programClassService');
pcs.appliesTo = () => true;
pcs.lockWaitlist = async (tx) => {
	lockCalls++;
	if (!lockEnabled) return;
	let release;
	const mine = new Promise((r) => (release = r));
	const prev = queue;
	queue = prev.then(() => mine);
	await prev;
	held.set(tx, release);
};
// Đếm chỗ đọc "CSDL" (đã commit) — chèn độ trễ để 2 request chen nhau như thật
pcs.statusOnApprove = async () => {
	const approved = [...rows.values()].filter((r) => r.status === 'approved').length;
	await new Promise((r) => setTimeout(r, 15)); // đọc xong, chưa kịp ghi
	return approved < MAX ? 'approved' : 'waitlisted';
};
pcs.notifyIfReady = async () => {};
pcs.fillFromWaitlist = async () => {};

const svc = require('../../src/modules/training/courses/courseEnrollmentService');

const approveBoth = () =>
	Promise.all([
		svc.decideEnrollment('E1', 'approved', 'U1', null),
		svc.decideEnrollment('E2', 'approved', 'U2', null),
	]);

test('2 người duyệt cùng lúc vào lớp còn 1 chỗ: chỉ 1 người vào lớp, người kia vào danh sách chờ', async () => {
	reset();
	lockCalls = 0;
	const out = await approveBoth();
	assert.equal(lockCalls, 2);
	assert.deepEqual(out.map((r) => r.status).sort(), ['approved', 'waitlisted']);
	assert.equal([...rows.values()].filter((r) => r.status === 'approved').length, MAX);
});

test('đối chứng: bỏ khoá thì test bắt được vượt sĩ số (cả 2 cùng được duyệt)', async () => {
	reset();
	lockEnabled = false;
	try {
		const out = await approveBoth();
		assert.deepEqual(
			out.map((r) => r.status),
			['approved', 'approved'],
		);
	} finally {
		lockEnabled = true;
	}
});

test('khóa đã hủy: không duyệt thêm, từ chối vẫn được', async () => {
	reset();
	course.status = 'cancelled';
	try {
		await assert.rejects(
			svc.decideEnrollment('E1', 'approved', 'U1', null),
			(e) => e.statusCode === 409 && /đã hủy/.test(e.message),
		);
		assert.equal(rows.get('E1').status, 'pending');
		const r = await svc.decideEnrollment('E1', 'rejected', 'U1', null);
		assert.equal(r.status, 'rejected');
	} finally {
		course.status = 'draft';
	}
});
