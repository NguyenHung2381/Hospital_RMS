const test = require('node:test');
const assert = require('node:assert');
const t = require('../../src/utils/seminarTest');
const { testState } = require('../../src/utils/seminarSchedule');

const vn = (iso) => new Date(`${iso}+07:00`).getTime();

const QUESTIONS = [
	{ q: 'A', options: ['a0', 'a1', 'a2'], answer: 1, points: 2 },
	{ q: 'B', options: ['b0', 'b1'], answer: 0 }, // câu cũ chưa có điểm = 1
	{ q: 'C', options: ['c0', 'c1', 'c2', 'c3'], answer: 3, points: 0.5 },
];

test('maxScore / questionPoints: câu chưa đặt điểm tính 1', () => {
	assert.strictEqual(t.questionPoints(QUESTIONS[1]), 1);
	assert.strictEqual(t.maxScore(QUESTIONS), 3.5);
});

test('testOrder: không trộn giữ nguyên thứ tự; có trộn cố định theo mã vé và là hoán vị', () => {
	const plain = t.testOrder(QUESTIONS, 'abc');
	assert.deepStrictEqual(plain, [
		{ q: 0, options: [0, 1, 2] },
		{ q: 1, options: [0, 1] },
		{ q: 2, options: [0, 1, 2, 3] },
	]);
	const opts = { shuffleQuestions: true, shuffleOptions: true };
	const o1 = t.testOrder(QUESTIONS, 'ticket-1', opts);
	assert.deepStrictEqual(t.testOrder(QUESTIONS, 'ticket-1', opts), o1);
	assert.deepStrictEqual(o1.map((x) => x.q).sort(), [0, 1, 2]);
	o1.forEach(({ q, options }) =>
		assert.deepStrictEqual([...options].sort(), [...QUESTIONS[q].options.keys()]),
	);
	// Nhiều vé khác nhau phải ra ít nhất 2 thứ tự khác nhau
	const seen = new Set(
		Array.from({ length: 20 }, (_, i) => JSON.stringify(t.testOrder(QUESTIONS, `v${i}`, opts))),
	);
	assert.ok(seen.size > 1);
});

test('publicQuestions: không lộ đáp án, phương án theo thứ tự trộn', () => {
	const order = [
		{ q: 2, options: [3, 0, 1, 2] },
		{ q: 0, options: [1, 2, 0] },
		{ q: 1, options: [1, 0] },
	];
	const pub = t.publicQuestions(QUESTIONS, order);
	assert.deepStrictEqual(pub[0], { q: 'C', image: null, options: ['c3', 'c0', 'c1', 'c2'], points: 0.5 });
	assert.ok(pub.every((x) => !('answer' in x)));
});

test('gradeTest: quy đáp án về chỉ số gốc, cộng điểm theo trọng số, bỏ trống = 0', () => {
	const order = [
		{ q: 2, options: [3, 0, 1, 2] },
		{ q: 0, options: [1, 2, 0] },
		{ q: 1, options: [1, 0] },
	];
	// Câu C chọn phương án hiển thị 0 (= gốc 3, đúng); câu A chọn 0 (= gốc 1, đúng); câu B bỏ trống
	const g = t.gradeTest(QUESTIONS, order, [0, 0, null]);
	assert.deepStrictEqual(g.picked, [1, null, 3]);
	assert.strictEqual(g.correct, 2);
	assert.strictEqual(g.total, 3);
	assert.strictEqual(g.score, 2.5);
	assert.strictEqual(g.max_score, 3.5);
	// Chỉ số ngoài phạm vi coi như bỏ trống
	assert.strictEqual(t.gradeTest(QUESTIONS, t.testOrder(QUESTIONS, 'x'), [9, -1, 'a']).correct, 0);
});

test('attemptDeadline: sớm hơn giữa hết thời gian làm bài và giờ dừng tiếp nhận', () => {
	const sem = { test_open: true, test_date: '2026-10-16', test_start_time: '16:00', test_end_time: '16:30' };
	const now = vn('2026-10-16T16:10:00');
	// Không giới hạn thời gian làm bài → hạn = giờ dừng tiếp nhận
	assert.strictEqual(t.attemptDeadline(sem, null, now), vn('2026-10-16T16:30:00'));
	// 15 phút, đã làm 5 phút → còn 10 phút (16:20)
	assert.strictEqual(t.attemptDeadline({ ...sem, test_duration_minutes: 15 }, 300, now), vn('2026-10-16T16:20:00'));
	// 30 phút nhưng bắt đầu lúc 16:10 → bị chặn ở 16:30
	assert.strictEqual(t.attemptDeadline({ ...sem, test_duration_minutes: 30 }, 0, now), vn('2026-10-16T16:30:00'));
	// Không có giờ, không giới hạn → null
	assert.strictEqual(t.attemptDeadline({ test_open: true }, 0, now), null);
});

test('testState: dừng tiếp nhận ở ngày khác ngày mở bài', () => {
	const sem = {
		test_open: true,
		test_date: '2026-10-15',
		test_end_date: '2026-10-17',
		test_start_time: '08:00',
		test_end_time: '17:00',
	};
	assert.strictEqual(testState(sem, vn('2026-10-15T07:59:00')), 'scheduled');
	assert.strictEqual(testState(sem, vn('2026-10-16T20:00:00')), 'open');
	assert.strictEqual(testState(sem, vn('2026-10-17T17:01:00')), 'closed');
});

test('isPassed: chưa đặt điểm đạt = đạt; có thì so điểm', () => {
	assert.strictEqual(t.isPassed({}, 0), true);
	assert.strictEqual(t.isPassed({ test_pass_score: 5 }, 5), true);
	assert.strictEqual(t.isPassed({ test_pass_score: 5 }, 4.5), false);
	assert.strictEqual(t.isPassed({ test_pass_score: 5 }, null), false);
});
