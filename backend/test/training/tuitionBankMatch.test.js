// Tự đối soát học phí — phần tính toán thuần (training/tuition/bank/bankMatch.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const {
	extractCodes,
	normalizeTxn,
	decide,
} = require('../../src/modules/training/tuition/bank/bankMatch');

const CODE = 'DK202611050001';

test('extractCodes: nhận nội dung chuẩn, nuốt dấu cách, thêm tiền tố ngân hàng, viết thường', () => {
	assert.deepEqual(extractCodes(`HP ${CODE}`), [CODE]);
	assert.deepEqual(extractCodes(`HP${CODE}`), [CODE]);
	assert.deepEqual(extractCodes(`MBVCB.1234567.HP ${CODE}.CT tu 0123 NGUYEN VAN A`), [CODE]);
	assert.deepEqual(extractCodes(`hp ${CODE.toLowerCase()} chuyen tien`), [CODE]);
	assert.deepEqual(extractCodes(`Học phí - HP-${CODE}`), [CODE]);
});

test('extractCodes: thiếu "HP" vẫn nhận mã ghi danh đứng một mình; có "HP" thì ưu tiên mã đi sau HP', () => {
	assert.deepEqual(extractCodes(`nop tien ${CODE}`), [CODE]);
	assert.deepEqual(extractCodes(`DK202611050002 HP ${CODE}`), [CODE]);
});

test('extractCodes: không có mã / nhiều mã khác nhau / mã lặp lại', () => {
	assert.deepEqual(extractCodes('chuyen tien hoc phi'), []);
	assert.deepEqual(extractCodes(''), []);
	assert.deepEqual(extractCodes(null), []);
	assert.deepEqual(extractCodes(`HP ${CODE} HP DK202611050002`).length, 2);
	assert.deepEqual(extractCodes(`HP ${CODE} HP ${CODE}`), [CODE]);
});

test('normalizeTxn: chuẩn hoá và từ chối giao dịch hỏng', () => {
	const { txn } = normalizeTxn({
		external_id: ' FT123 ',
		amount: '1500000',
		content: 'HP x',
		account_no: '0011 0012 34',
		time: '2026-11-27T10:15:00+07:00',
		direction: 'credit',
	});
	assert.equal(txn.external_id, 'FT123');
	assert.equal(txn.amount, 1500000);
	assert.equal(txn.account_no, '00110012' + '34');
	assert.equal(txn.time.toISOString(), '2026-11-27T03:15:00.000Z');
	assert.ok(normalizeTxn({ external_id: '', amount: 1 }).error);
	assert.ok(normalizeTxn({ external_id: 'a', amount: 0 }).error);
	assert.ok(normalizeTxn({ external_id: 'a', amount: 10.5 }).error);
	assert.ok(normalizeTxn({ external_id: 'a', amount: -5 }).error);
	assert.ok(normalizeTxn({ external_id: 'a', amount: 5, time: 'hôm qua' }).error);
	assert.equal(
		normalizeTxn({ external_id: 'a', amount: 5, direction: 'debit' }).txn.direction,
		'debit',
	);
});

const row = { enrollment_id: CODE, enrollment_status: 'approved' };
const item = { due: 2_000_000, remaining: 1_500_000 };
const base = { codes: [CODE], row, item, amount: 1_000_000, autoConfirm: true };

test('decide: khớp đủ điều kiện ⇒ ghi nhận', () => {
	assert.deepEqual(decide(base), { action: 'apply' });
	assert.deepEqual(decide({ ...base, amount: 1_500_000 }), { action: 'apply' });
});

test('decide: các lý do vào hàng chờ', () => {
	const why = (over) => decide({ ...base, ...over }).reason;
	assert.equal(why({ codes: [] }), 'no_code');
	assert.equal(why({ codes: [CODE, 'DK202611050002'] }), 'ambiguous');
	assert.equal(why({ row: null, item: null }), 'not_found');
	assert.equal(why({ row: { ...row, enrollment_status: 'pending' } }), 'not_approved');
	assert.equal(why({ item: { due: 0, remaining: 0 } }), 'no_fee');
	assert.equal(why({ amount: 1_500_001 }), 'overpay');
	assert.equal(why({ autoConfirm: false }), 'auto_off');
});

test('decide: cán bộ tự gán bỏ qua kiểm mã trong nội dung và công tắc tự xác nhận, vẫn chặn vượt số phải nộp', () => {
	const manual = { ...base, codes: [], autoConfirm: false, manual: true };
	assert.deepEqual(decide(manual), { action: 'apply' });
	assert.equal(decide({ ...manual, amount: 9_000_000 }).reason, 'overpay');
	assert.equal(
		decide({ ...manual, row: { ...row, enrollment_status: 'rejected' } }).reason,
		'not_approved',
	);
});
