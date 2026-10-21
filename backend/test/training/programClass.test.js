// Lớp theo chương trình của khóa ĐTLT thường (programClassService) — phần không cần DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const { appliesTo, roomOf } = require('../../src/modules/training/courses/programClassService');

const dtlt = { training_type_id: 'TRNTP-DTLT', auto_batch: false, parent_course_id: null, is_rolling: false };

test('chỉ áp dụng cho khóa ĐTLT thường', () => {
	assert.equal(appliesTo(dtlt), true);
	assert.equal(appliesTo({ ...dtlt, auto_batch: true }), false); // khóa tuyển sinh theo đợt
	assert.equal(appliesTo({ ...dtlt, parent_course_id: 'KH1' }), false); // đợt con
	assert.equal(appliesTo({ ...dtlt, training_type_id: 'TRNTP-GPHN' }), false);
	assert.equal(appliesTo(null), false);
});

test('chỗ trống theo sĩ số tối đa của chương trình', () => {
	assert.equal(roomOf({ class_max: 10, class_approved: 7, course_capacity: null, course_approved: 7 }), 3);
	assert.equal(roomOf({ class_max: 10, class_approved: 10, course_capacity: null, course_approved: 10 }), 0);
});

test('khóa đặt sĩ số chung ⇒ lấy giới hạn chặt hơn', () => {
	assert.equal(roomOf({ class_max: 10, class_approved: 2, course_capacity: 20, course_approved: 19 }), 1);
});

test('không đặt tối đa ⇒ không giới hạn', () => {
	assert.equal(roomOf({ class_max: null, class_approved: 50, course_capacity: null, course_approved: 50 }), Infinity);
});
