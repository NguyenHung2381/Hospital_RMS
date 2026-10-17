// Các bản sửa kiểm tra quyền theo bản ghi ngoài đề tài / khoá học:
//   - quản lý phạm vi khoa không chuyển được tài khoản sang khoa khác
//   - tìm người (/users/search) bắt buộc từ khoá, tối đa 20 kết quả
//   - nộp bài thi: nhận bài nguyên tử (nộp 2 lần → 409), quá giờ thì bỏ đáp án
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

let claimRow = null; // kết quả bước "nhận" lượt làm bài
const writes = [];
install(async (text) => {
	if (/FROM exam_papers p\s+JOIN course_enrollments/.test(text))
		return [{ paper_id: 'DT1', status: 'published', duration_minutes: 30, enrollment_id: 'DK1' }];
	if (/UPDATE exam_attempts SET status = 'submitted'/.test(text)) return claimRow ? [claimRow] : [];
	if (/FROM exam_paper_questions epq JOIN question_bank/.test(text))
		return [{ id: 'Q1', question_type: 'single', correct_option: 'A', points: 10 }];
	if (/INSERT INTO exam_answers/.test(text)) writes.push('answer');
	return [];
});
require('../../src/services/eventService').broadcast = () => {};
require('../../src/services/courseService').upsertGrade = async () => {};

// Controller người dùng: stub service + chốt quyền quản lý tài khoản
const userService = require('../../src/services/userService');
require('../../src/services/privilegeGuard').assertCanManageUser = async () => {};
userService.getById = async (id) => ({ id, department_id: 'K1' });
let updated = null;
userService.update = async (id, data) => (updated = { id, ...data });
let searchArgs = null;
userService.searchForMember = async (args) => {
	searchArgs = args;
	return { data: [], pagination: {} };
};
const userCtrl = require('../../src/controllers/userController');
const examService = require('../../src/services/examService');

const call = (handler, req) =>
	new Promise((resolve, reject) => {
		const res = {
			statusCode: 200,
			status(c) {
				this.statusCode = c;
				return this;
			},
			json(body) {
				resolve({ status: this.statusCode, body });
			},
		};
		handler(req, res, reject);
	});
const deptManager = {
	id: 'QLK1',
	department_id: 'K1',
	permissions: new Set(['users:read', 'users:update']),
	permissionScopes: new Map([
		['users:read', 'department'],
		['users:update', 'department'],
	]),
};

test('quản lý phạm vi khoa: sửa được trong khoa, KHÔNG chuyển được sang khoa khác', async () => {
	const ok = await call(userCtrl.updateOne, {
		user: deptManager,
		params: { id: 'NV1' },
		body: { full_name: 'A' },
	});
	assert.equal(ok.status, 200);
	updated = null;
	const r = await call(userCtrl.updateOne, {
		user: deptManager,
		params: { id: 'NV1' },
		body: { department_id: 'K2' },
	});
	assert.equal(r.status, 403);
	assert.equal(updated, null);
});

test('tìm người: từ khoá rỗng không trả ai; limit bị chặn ở 20', async () => {
	searchArgs = null;
	const empty = await call(userCtrl.searchMembers, {
		user: deptManager,
		query: { q: '  ', limit: '100000' },
	});
	assert.deepEqual(empty.body.data.data, []);
	assert.equal(searchArgs, null);
	await call(userCtrl.searchMembers, { user: deptManager, query: { q: 'ng', limit: '100000' } });
	assert.equal(searchArgs.limit, 20);
});

const student = { id: 'HV-USER' };

test('nộp bài thi: lượt đã được nộp (hoặc request song song đến sau) → 409, không ghi đáp án', async () => {
	claimRow = null;
	writes.length = 0;
	await assert.rejects(
		examService.submitAttempt('DT1', [{ question_id: 'Q1', selected_option: 'A' }], student),
		(e) => e.statusCode === 409,
	);
	assert.equal(writes.length, 0);
});

test('nộp đúng giờ: chấm điểm; quá giờ: đóng bài nhưng bỏ đáp án (late = true)', async () => {
	claimRow = { id: 'EA1', late: false };
	writes.length = 0;
	const onTime = await examService.submitAttempt(
		'DT1',
		[{ question_id: 'Q1', selected_option: 'A' }],
		student,
	);
	assert.equal(onTime.auto_score, 10);
	assert.equal(onTime.late, false);

	claimRow = { id: 'EA2', late: true };
	const late = await examService.submitAttempt(
		'DT1',
		[{ question_id: 'Q1', selected_option: 'A' }],
		student,
	);
	assert.equal(late.late, true);
	assert.equal(late.auto_score, 0);
});
