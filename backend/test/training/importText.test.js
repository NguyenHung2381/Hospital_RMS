// Helper chuỗi / gom nhóm dùng chung cho các service nhập Excel của đào tạo (trước đây
// mỗi service tự định nghĩa 1 bản giống hệt).
const test = require('node:test');
const assert = require('node:assert/strict');
const { tidy, cleanCode, groupBy } = require('../../src/modules/training/importText');

test('tidy: gộp khoảng trắng, bỏ đầu/cuối; null/undefined → chuỗi rỗng', () => {
	assert.equal(tidy('  Nguyễn \t Văn\n A  '), 'Nguyễn Văn A');
	assert.equal(tidy(null), '');
	assert.equal(tidy(undefined), '');
	assert.equal(tidy(123), '123');
});

test('cleanCode: bỏ mọi khoảng trắng và viết hoa', () => {
	assert.equal(cleanCode(' bh 01 a '), 'BH01A');
	assert.equal(cleanCode(''), '');
	assert.equal(cleanCode(null), '');
});

test('groupBy: Map theo khóa, giữ thứ tự xuất hiện trong từng nhóm', () => {
	const m = groupBy(
		[
			{ k: 'a', v: 1 },
			{ k: 'b', v: 2 },
			{ k: 'a', v: 3 },
		],
		(x) => x.k,
	);
	assert.deepEqual([...m.keys()], ['a', 'b']);
	assert.deepEqual(
		m.get('a').map((x) => x.v),
		[1, 3],
	);
	assert.equal(groupBy([], (x) => x).size, 0);
});
