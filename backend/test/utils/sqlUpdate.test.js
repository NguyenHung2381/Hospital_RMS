const test = require('node:test');
const assert = require('node:assert/strict');

const { addSets } = require('../../src/utils/sqlUpdate');
const { formFlag } = require('../../src/utils/formFlag');
const { fmtDateUTC, fmtDateVN } = require('../../src/utils/vnDate');

// Request giả: chỉ ghi lại các input
const fakeReq = () => {
	const inputs = {};
	return {
		inputs,
		input(name, type, value) {
			inputs[name] = { type, value };
			return this;
		},
	};
};

test('addSets: chỉ ghi trường khác undefined, giữ null thật', () => {
	const req = fakeReq();
	const sets = addSets(req, [], { a: 'x', b: undefined, c: null }, { a: 'T', b: 'T', c: 'T' });
	assert.deepEqual(sets, ['a = @a', 'c = @c']);
	assert.deepEqual(Object.keys(req.inputs), ['a', 'c']);
	assert.equal(req.inputs.c.value, null);
});

test('addSets: orNull đổi chuỗi rỗng thành NULL, param đổi tên tham số, map đổi giá trị', () => {
	const req = fakeReq();
	const sets = addSets(
		req,
		['updated_at = now()'],
		{ note: '', category_id: 'C1', flag: 'yes' },
		{
			note: ['T', { orNull: true }],
			category_id: ['T', { param: 'cat' }],
			flag: ['B', { map: (v) => (v ? 1 : 0) }],
		},
	);
	assert.deepEqual(sets, [
		'updated_at = now()',
		'note = @note',
		'category_id = @cat',
		'flag = @flag',
	]);
	assert.equal(req.inputs.note.value, null);
	assert.equal(req.inputs.cat.value, 'C1');
	assert.equal(req.inputs.flag.value, 1);
});

test("formFlag: chỉ '1' và 'true' là bật", () => {
	assert.equal(formFlag('1'), true);
	assert.equal(formFlag('true'), true);
	for (const v of ['0', 'false', '', undefined, null, true, 1, 'TRUE'])
		assert.equal(formFlag(v), false);
});

test('fmtDateUTC đọc bằng getter UTC; fmtDateVN dịch sang UTC+7', () => {
	const d = new Date('2026-03-04T20:00:00Z');
	assert.equal(fmtDateUTC(d), '04/03/2026');
	assert.equal(fmtDateVN(d), '05/03/2026');
	assert.equal(fmtDateUTC('2026-12-31'), '31/12/2026');
	assert.equal(fmtDateUTC(''), '');
	assert.equal(fmtDateUTC('không phải ngày'), '');
	assert.equal(fmtDateVN('không phải ngày'), '');
});
