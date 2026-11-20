const test = require('node:test');
const assert = require('node:assert/strict');
const { programSelect } = require('../../src/modules/training/programs/trainingProgramService');

// Số tổng hợp bài học (trang Chương trình đào tạo báo thiếu bài học) phải có trong SELECT.
test('programSelect trả các số tổng hợp bài học đã gắn', () => {
	for (const col of [
		'lesson_theory_hours',
		'lesson_practice_hours',
		'theory_lesson_count',
		'rotation_count',
	])
		assert.match(programSelect, new RegExp(`ls\\.${col}`));
	assert.match(programSelect, /LEFT JOIN LATERAL/);
	assert.match(programSelect, /COALESCE\(SUM\(pl\.theory_hours\), 0\)/);
	assert.match(programSelect, /lesson_kind = 'rotation'/);
});
