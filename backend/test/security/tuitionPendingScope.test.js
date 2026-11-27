// Rà bảo mật 2026-11-26 (phiên security) — S-04: GET /courses/tuition-pending trả khoản học
// phí chờ xác nhận của MỌI khóa (họ tên học viên, số tiền, tên khóa) cho cả người chỉ có
// courses:approve phạm vi 'assigned' (giảng viên được phân công). Mọi route học phí theo khóa
// đều qua router.param kiểm phạm vi; riêng danh sách gộp này thì không.
// Sau sửa: phạm vi 'assigned' chỉ thấy khoản của khóa mình được phân công (như
// listPendingEnrollments); phạm vi 'all' giữ nguyên.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

// CSDL giả: 2 khoản chờ, chỉ khóa C_MINE có phân công cho U_GV
const ROWS = [
	{ id: 'NP1', course_id: 'C_MINE', trainee_name: 'A' },
	{ id: 'NP2', course_id: 'C_OTHER', trainee_name: 'B' },
];
const log = install(async (text, inputs) => {
	if (!/FROM tuition_payments/.test(text)) return [];
	if (/lecturer_assignments/.test(text) && inputs.actor_id === 'U_GV')
		return ROWS.filter((r) => r.course_id === 'C_MINE');
	return ROWS;
});

const tuitionService = require('../../src/modules/training/tuition/tuitionService');

const actor = (scope) => ({
	id: 'U_GV',
	permissions: new Set(['courses:read', 'courses:approve']),
	permissionScopes: new Map([
		['courses:read', scope],
		['courses:approve', scope],
	]),
});

test("S-04: courses:approve phạm vi 'assigned' chỉ thấy khoản chờ của khóa được phân công", async () => {
	const rows = await tuitionService.listPending(actor('assigned'));
	assert.deepEqual(
		rows.map((r) => r.id),
		['NP1'],
	);
	assert.match(log.at(-1).text, /lecturer_assignments/);
});

test("S-04: phạm vi 'all' vẫn thấy mọi khóa", async () => {
	const rows = await tuitionService.listPending(actor('all'));
	assert.equal(rows.length, 2);
	assert.doesNotMatch(log.at(-1).text, /lecturer_assignments/);
});
