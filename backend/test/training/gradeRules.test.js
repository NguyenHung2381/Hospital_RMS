// Tính kết quả 2 phần Lý thuyết + Thực hành (gradeRules.evaluate) — giai đoạn 4,
// ngưỡng mặc định theo Phụ lục III TT 32/2023.
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, partHours, toTen } = require('../../src/modules/training/courses/gradeRules');

const att = (held, absent) => ({ held, absent });

test('quy đổi điểm bài thi về thang 10: 37/50 → 7,4', () => {
	assert.equal(toTen(37, 50), 7.4);
	assert.equal(toTen(0, 0), null);
});

test('LT 6,0 đạt (≥ 60%), TH 6,5 đạt ⇒ Đạt', () => {
	const r = evaluate({ theory: 6, practice: 6.5 });
	assert.equal(r.theory.passed, true);
	assert.equal(r.result, 'pass');
});

test('TH 6,0 KHÔNG đạt (phải lớn hơn 60%)', () => {
	const r = evaluate({ theory: 8, practice: 6 });
	assert.equal(r.practice.passed, false);
	assert.equal(r.result, 'fail');
	assert.equal(r.classification, null);
});

test('vắng lý thuyết 11% ⇒ không đạt, 10% vẫn đạt', () => {
	assert.equal(evaluate({ theory: 9, practice: 9, theoryAttendance: att(100, 11) }).result, 'fail');
	assert.equal(evaluate({ theory: 9, practice: 9, theoryAttendance: att(10, 1) }).result, 'pass');
});

test('vắng 1 buổi thực hành ⇒ không đạt', () => {
	const r = evaluate({ theory: 9, practice: 9, practiceAttendance: att(20, 1) });
	assert.equal(r.result, 'fail');
	assert.match(r.reasons[0], /thực hành/);
});

test('chương trình không có thực hành ⇒ chỉ xét lý thuyết', () => {
	const r = evaluate({ theory: 7, practice: null, practiceHours: 0, theoryHours: 12 });
	assert.equal(r.result, 'pass');
	assert.equal(r.total, 7);
});

test('thiếu điểm ⇒ chưa có kết quả; vắng thi ⇒ không đạt; miễn thi ⇒ coi như đạt phần đó', () => {
	assert.equal(evaluate({ theory: 7 }).result, null);
	assert.equal(evaluate({ theory: 7, practiceFlag: 'absent' }).result, 'fail');
	const ex = evaluate({ theory: 7, practiceFlag: 'exempt' });
	assert.equal(ex.result, 'pass');
	assert.equal(ex.total, 7);
});

test('điểm tổng theo số tiết + xếp loại', () => {
	// (8×10 + 9×30) / 40 = 8,75 → 8,8 Giỏi
	const r = evaluate({ theory: 8, practice: 9, theoryHours: 10, practiceHours: 30 });
	assert.equal(r.total, 8.8);
	assert.equal(r.classification, 'Giỏi');
});

test('ngưỡng cấu hình được', () => {
	const r = evaluate({ theory: 6.5, practice: 9, rules: { theoryPassPct: 70 } });
	assert.equal(r.result, 'fail');
});

test('phần thi theo chương trình (exam_parts)', () => {
	// chưa cấu hình: suy theo số tiết; chưa khai tiết thì cả 2
	assert.deepEqual(partHours({}), { theoryHours: 1, practiceHours: 1 });
	assert.deepEqual(partHours({ theoryHours: 20, practiceHours: 0 }), {
		theoryHours: 20,
		practiceHours: 0,
	});
	// chỉ thi LT dù có tiết TH
	assert.deepEqual(partHours({ theoryHours: 20, practiceHours: 40, examParts: 'theory' }), {
		theoryHours: 20,
		practiceHours: 0,
	});
	// cả 2 dù khai 0 tiết TH
	assert.deepEqual(partHours({ theoryHours: 20, practiceHours: 0, examParts: 'both' }), {
		theoryHours: 20,
		practiceHours: 1,
	});
	// chỉ thi TH ⇒ thiếu điểm LT vẫn Đạt
	const r = evaluate({
		practice: 7,
		...partHours({ theoryHours: 10, practiceHours: 30, examParts: 'practice' }),
	});
	assert.equal(r.theory.applies, false);
	assert.equal(r.result, 'pass');
});
