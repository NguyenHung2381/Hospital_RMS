// Nhóm thẻ trên màn người hướng dẫn (practiceResultService.phaseOf) — hàm thuần, không cần DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const { phaseOf } = require('../../src/modules/training/courses/practiceResultService');

const TODAY = '2026-10-24';
const rot = (start, end, result = 'pending') => ({
	start_date: new Date(`${start}T00:00:00Z`),
	end_date: new Date(`${end}T00:00:00Z`),
	result,
});

test('đã có kết quả → done, bất kể ngày', () => {
	assert.equal(phaseOf(rot('2026-11-01', '2026-12-01', 'pass'), TODAY), 'done');
	assert.equal(phaseOf(rot('2026-09-01', '2026-10-01', 'fail'), TODAY), 'done');
});

test('chưa đánh giá: đã kết thúc trước hôm nay → awaiting', () => {
	assert.equal(phaseOf(rot('2026-09-24', '2026-10-23'), TODAY), 'awaiting');
});

test('chưa đánh giá: kết thúc đúng hôm nay vẫn đang thực hành', () => {
	assert.equal(phaseOf(rot('2026-09-24', '2026-10-24'), TODAY), 'current');
	assert.equal(phaseOf(rot('2026-10-24', '2026-11-23'), TODAY), 'current');
});

test('chưa bắt đầu → upcoming', () => {
	assert.equal(phaseOf(rot('2026-10-25', '2026-11-24'), TODAY), 'upcoming');
});
