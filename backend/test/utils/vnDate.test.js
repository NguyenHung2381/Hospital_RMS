const test = require('node:test');
const assert = require('node:assert/strict');
const { fmtDateVN, todayKeyVN } = require('../../src/utils/vnDate');

test('fmtDateVN đổi sang ngày giờ VN (UTC+7)', () => {
	assert.equal(fmtDateVN('2026-03-31T18:30:00Z'), '01/04/2026');
	assert.equal(fmtDateVN(new Date('2026-03-31T10:00:00Z')), '31/03/2026');
	assert.equal(fmtDateVN(null), '');
	assert.equal(fmtDateVN('abc'), '');
});

test('todayKeyVN dạng YYYY-MM-DD', () => {
	assert.match(todayKeyVN(), /^\d{4}-\d{2}-\d{2}$/);
});
