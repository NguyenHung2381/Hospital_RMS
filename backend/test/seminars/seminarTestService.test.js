// Chuẩn hóa cấu hình 1 đề kiểm tra hội nghị (nhiều đề / hội nghị) — không cần DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
require('../../scripts/lib/static-check-env');

const { normalize } = require('../../src/modules/seminars/seminarTestService');

const Q = [{ q: 'Câu 1', options: ['A', 'B'], answer: 1, points: 2 }];
const bad = (data, re, opts) =>
	assert.throws(
		() => normalize(data, 'SEM1', opts),
		(e) => e.statusCode === 400 && re.test(e.message),
	);

test('tạo đề: bắt buộc có tên', () => {
	bad({}, /tên đề/, { creating: true });
	bad({ title: '   ' }, /tên đề/, { creating: true });
	assert.equal(
		normalize({ title: ' Bài trước buổi ' }, 'SEM1', { creating: true }).title[1],
		'Bài trước buổi',
	);
});

test('sửa đề: chỉ gồm trường có gửi lên', () => {
	const cols = normalize({ test_open: false }, 'SEM1');
	assert.deepEqual(Object.keys(cols), ['test_open']);
	assert.equal(cols.test_open[1], 0);
});

test('câu hỏi + cờ tính điều kiện CME', () => {
	const cols = normalize({ test_questions: Q, counts_for_cme: false }, 'SEM1');
	assert.equal(cols.counts_for_cme[1], 0);
	assert.deepEqual(JSON.parse(cols.test_questions[1]), Q);
	bad({ test_questions: [{ q: 'x', options: ['A'], answer: 0 }] }, /ít nhất 2 phương án/);
});

test('điểm đạt không vượt tổng điểm / thang', () => {
	bad({ test_questions: Q, test_pass_score: 3 }, /lớn hơn tổng điểm/);
	bad({ test_score_scale: 10, test_pass_score: 11 }, /lớn hơn thang/);
	assert.ok(normalize({ test_questions: Q, test_pass_score: 8, test_score_scale: 10 }, 'SEM1'));
});

test('mở đề phải có câu hỏi; giờ dừng sau giờ mở', () => {
	bad({ test_questions: [], test_open: true }, /Chưa có câu hỏi/);
	bad({ test_start_time: '10:00', test_end_time: '09:00' }, /phải sau/);
	assert.ok(
		normalize(
			{
				test_date: '2026-12-01',
				test_start_time: '23:00',
				test_end_date: '2026-12-02',
				test_end_time: '01:00',
			},
			'SEM1',
		),
	);
});
