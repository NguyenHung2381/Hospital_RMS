// Duyệt ghi nhận CME phải ra số tín chỉ > 0 (cmeRecordService.review). Bản tự khai lưu
// credits = 0 (createMine) — trước đây duyệt mà không nhập tín chỉ (API thẳng / duyệt
// đồng loạt) thì thành "đã duyệt" 0 tín chỉ, tổng CME của nhân sự bị thiếu.
process.env.JWT_SECRET = 'test-secret';
require('../../scripts/lib/static-check-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const RECORDS = { ZERO: 0, HAS: 4.5 };
const log = install(async (text, inputs) => {
	if (/^SELECT credits FROM cme_records WHERE id = @id$/.test(text.trim()))
		return inputs.id in RECORDS ? [{ credits: RECORDS[inputs.id] }] : [];
	if (/^UPDATE cme_records SET approval_status/.test(text.trim())) return [{}];
	return [];
});
const { review } = require('../../src/modules/cme/cmeRecordService');

const updates = () => log.filter((x) => /^UPDATE cme_records/.test(x.text.trim()));
const reset = () => log.splice(0);

test('duyệt bản ghi 0 tín chỉ mà không nhập tín chỉ → 400, không UPDATE', async () => {
	reset();
	await assert.rejects(review('ZERO', true, null, 'UADMIN', undefined), {
		statusCode: 400,
		message: /chưa có số tín chỉ/,
	});
	await assert.rejects(review('ZERO', true, null, 'UADMIN', ''), { statusCode: 400 });
	assert.equal(updates().length, 0);
});

test('duyệt với số tín chỉ = 0 → 400', async () => {
	reset();
	await assert.rejects(review('ZERO', true, null, 'UADMIN', 0), {
		statusCode: 400,
		message: /lớn hơn 0/,
	});
	await assert.rejects(review('HAS', true, null, 'UADMIN', '0'), { statusCode: 400 });
	assert.equal(updates().length, 0);
});

test('duyệt kèm số tín chỉ > 0 → ghi đúng số đó', async () => {
	reset();
	await review('ZERO', true, null, 'UADMIN', 3);
	const [u] = updates();
	assert.ok(u);
	assert.equal(u.inputs.status, 'approved');
	assert.equal(u.inputs.credits, 3);
});

test('duyệt không nhập tín chỉ, bản ghi đã có tín chỉ > 0 (duyệt đồng loạt) → giữ tín chỉ cũ', async () => {
	reset();
	await review('HAS', true, null, 'UADMIN', undefined);
	const [u] = updates();
	assert.ok(u);
	assert.equal(u.inputs.credits, null); // COALESCE(@credits, credits) giữ 4.5
});

test('bản ghi không tồn tại → null (404), không UPDATE', async () => {
	reset();
	assert.equal(await review('NOPE', true, null, 'UADMIN', undefined), null);
	assert.equal(updates().length, 0);
});

test('từ chối bản ghi 0 tín chỉ vẫn được', async () => {
	reset();
	await review('ZERO', false, 'Thiếu minh chứng', 'UADMIN', undefined);
	const [u] = updates();
	assert.ok(u);
	assert.equal(u.inputs.status, 'rejected');
});
