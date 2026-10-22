const test = require('node:test');
const assert = require('node:assert/strict');
const {
	seededRandom,
	shuffle,
	drawQuestions,
	theoryScore,
} = require('../../src/modules/training/exams/examGen');

const ids = Array.from({ length: 10 }, (_, i) => `Q${i + 1}`);

test('cùng hạt giống ⇒ cùng thứ tự (vào lại bài vẫn y nguyên)', () => {
	assert.deepEqual(shuffle(ids, seededRandom('EA1')), shuffle(ids, seededRandom('EA1')));
	assert.notDeepEqual(shuffle(ids, seededRandom('EA1')), shuffle(ids, seededRandom('EA2')));
	assert.deepEqual([...shuffle(ids, seededRandom('x'))].sort(), [...ids].sort());
});

test('bốc đủ N câu, không trùng', () => {
	const got = drawQuestions(ids, 4, new Set(), seededRandom('a'));
	assert.equal(got.length, 4);
	assert.equal(new Set(got).size, 4);
});

test('ngân hàng không đủ câu ⇒ null', () => {
	assert.equal(drawQuestions(ids, 11), null);
	assert.deepEqual(drawQuestions(ids, 0), []);
});

test('thi lại: ưu tiên câu chưa gặp, thiếu mới lấy câu đã gặp', () => {
	const seen = new Set(ids.slice(0, 7)); // còn 3 câu mới
	const got = drawQuestions(ids, 5, seen, seededRandom('b'));
	assert.deepEqual(got.slice(0, 3).sort(), ['Q10', 'Q8', 'Q9']);
	assert.ok(got.slice(3).every((id) => seen.has(id)));
	const fresh = drawQuestions(ids, 3, seen, seededRandom('c'));
	assert.ok(fresh.every((id) => !seen.has(id)));
});

test('điểm lý thuyết = TN × a% + TL × b%', () => {
	assert.equal(
		theoryScore([
			{ score10: 8, weight: 60 },
			{ score10: 5, weight: 40 },
		]),
		6.8,
	);
	assert.equal(
		theoryScore([
			{ score10: 8, weight: null },
			{ score10: 5, weight: null },
		]),
		6.5,
	); // chia đều
	assert.equal(theoryScore([{ score10: 7.3, weight: 100 }]), 7.3);
	assert.equal(
		theoryScore([
			{ score10: 8, weight: 50 },
			{ score10: null, weight: 50 },
		]),
		null,
	); // chờ chấm TL
});
