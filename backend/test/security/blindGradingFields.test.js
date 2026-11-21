// Hồi quy L-12 (run-5): chấm ẩn danh (đề bật blind_grading) trên /me/teaching không được lộ mã tài khoản
// người làm bài qua created_by / updated_by (SELECT a.* của exam_attempts). Chế độ thường giữ nguyên.
// Chạy trên CSDL giả: câu đọc bài thi trả đủ cột audit như bảng thật.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

let blind = true;
const ATTEMPT = {
	id: 'EA000001',
	paper_id: 'PP000001',
	enrollment_id: 'EN000001',
	trainee_name: 'Trần Thị B',
	status: 'submitted',
	question_ids: '[]',
	created_by: 'HV000123',
	updated_by: 'HV000123',
};

install(async (text) => {
	if (/SELECT p\.blind_grading/.test(text)) return [{ blind_grading: blind }];
	if (/SELECT a\.\*, t\.full_name/.test(text)) return [{ ...ATTEMPT }];
	return [];
});

const examGradingService = require('../../src/modules/training/exams/examGradingService');

test('L-12: chấm ẩn danh không trả created_by/updated_by của người làm bài', async () => {
	blind = true;
	const a = await examGradingService.getAttemptForGrader('EA000001', 'NV010002');
	assert.equal(a.trainee_name, null);
	assert.equal(a.enrollment_id, null);
	assert.equal(a.created_by, null, 'created_by không được lộ mã người làm bài');
	assert.equal(a.updated_by, null, 'updated_by không được lộ mã người làm bài');
	assert.equal(a.paper_id, 'PP000001', 'dữ liệu bài thi cho người chấm vẫn còn');
});

test('L-12: chấm thường (không ẩn danh) giữ nguyên created_by/updated_by', async () => {
	blind = false;
	const a = await examGradingService.getAttemptForGrader('EA000001', 'NV010002');
	assert.equal(a.trainee_name, 'Trần Thị B');
	assert.equal(a.created_by, 'HV000123');
	assert.equal(a.updated_by, 'HV000123');
	blind = true;
});
