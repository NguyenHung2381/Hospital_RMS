// Lớp theo chương trình của khóa ĐTLT / CTCV (programClassService) — phần không cần DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
	appliesTo,
	roomOf,
	classStatus,
} = require('../../src/modules/training/courses/programClassService');

const dtlt = { training_type_id: 'TRNTP-DTLT', is_rolling: false };

test('áp dụng cho khóa ĐTLT và CTCV, không cho GPHN / khóa mở liên tục', () => {
	assert.equal(appliesTo(dtlt), true);
	assert.equal(appliesTo({ ...dtlt, training_type_id: 'TRNTP-CTCV' }), true);
	assert.equal(appliesTo({ ...dtlt, training_type_id: 'TRNTP-GPHN' }), false);
	assert.equal(appliesTo({ ...dtlt, is_rolling: true }), false);
	assert.equal(appliesTo(null), false);
});

test('chỗ trống theo sĩ số tối đa của chương trình', () => {
	assert.equal(roomOf({ class_max: 10, class_approved: 7 }), 3);
	assert.equal(roomOf({ class_max: 10, class_approved: 10 }), 0);
	assert.equal(roomOf({ class_max: 10, class_approved: 12 }), 0);
	assert.equal(roomOf({ class_max: null, class_approved: 50 }), Infinity);
});

test('đủ tối thiểu chỉ là "chờ mở" — cán bộ bấm mở lớp mới thành "đã mở"', () => {
	assert.equal(
		classStatus({ class_min: 15, class_approved: 14, class_opened_at: null }),
		'waiting',
	);
	assert.equal(classStatus({ class_min: 15, class_approved: 15, class_opened_at: null }), 'ready');
	assert.equal(
		classStatus({ class_min: 15, class_approved: 15, class_opened_at: '2026-10-22' }),
		'open',
	);
});
