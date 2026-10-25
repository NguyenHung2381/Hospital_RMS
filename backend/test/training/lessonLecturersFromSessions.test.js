const test = require('node:test');
const assert = require('node:assert/strict');
const {
	lessonLecturersFromSessions,
} = require('../../src/modules/training/courses/lecturerAssignmentService');

test('bài chưa có buổi nào gán GV ⇒ không đổi phân công', () => {
	assert.equal(lessonLecturersFromSessions([]), null);
});

test('GV dạy nhiều buổi nhất là GV chính, còn lại là GV phụ', () => {
	const rows = [
		{ lecturer_id: 'GV2', n: 3 },
		{ lecturer_id: 'GV1', n: 1 },
	];
	assert.deepEqual(lessonLecturersFromSessions(rows), {
		main: { lecturer_id: 'GV2', hours: null },
		assistants: [{ lecturer_id: 'GV1', hours: null }],
	});
});

test('giữ số tiết đã nhập của GV còn trong bài', () => {
	const rows = [{ lecturer_id: 'GV1', n: 2 }];
	assert.deepEqual(
		lessonLecturersFromSessions(
			rows,
			new Map([
				['GV1', 6],
				['GV9', 4],
			]),
		),
		{
			main: { lecturer_id: 'GV1', hours: 6 },
			assistants: [],
		},
	);
});
