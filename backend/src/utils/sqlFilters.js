// Helper dựng mệnh đề lọc đa giá trị cho các list endpoint (multi-select trên UI).

// "a,b,c" → ['a','b','c']; rỗng/undefined → []
const splitList = (v) => (v ? String(v).split(',').filter(Boolean) : []);

// Thêm mệnh đề IN (...) với tham số đặt tên riêng theo prefix, tránh đụng tên giữa các lần gọi.
// Trả null khi không có giá trị để caller lọc bỏ khỏi danh sách mệnh đề.
const inClause = (req, col, prefix, values, sqlType) => {
	if (!values.length) return null;
	const names = values.map((v, i) => {
		const name = `${prefix}${i}`;
		req.input(name, sqlType, v);
		return `@${name}`;
	});
	return `${col} IN (${names.join(', ')})`;
};

// Ghép các mệnh đề (bỏ null) thành 'WHERE a AND b'; luôn có 1=1 để không bao giờ rỗng.
const buildWhere = (clauses) => `WHERE ${['1=1', ...clauses.filter(Boolean)].join(' AND ')}`;

// Cột NVARCHAR chứa mảng JSON (options, answer_options…) → mảng; rỗng/hỏng → [].
const parseJsonArray = (text) => {
	if (!text) return [];
	try {
		const v = JSON.parse(text);
		return Array.isArray(v) ? v : [];
	} catch {
		return [];
	}
};

module.exports = { splitList, inClause, buildWhere, parseJsonArray };

// Self-check: node src/utils/sqlFilters.js
if (require.main === module) {
	const assert = require('assert');
	assert.deepStrictEqual(splitList('a,b,,c'), ['a', 'b', 'c']);
	assert.deepStrictEqual(splitList(''), []);
	assert.deepStrictEqual(splitList(undefined), []);

	const calls = [];
	const req = { input: (n, t, v) => calls.push([n, v]) };
	assert.strictEqual(inClause(req, 't.status', 'st', [], null), null);
	assert.strictEqual(inClause(req, 't.status', 'st', ['a', 'b'], null), 't.status IN (@st0, @st1)');
	assert.deepStrictEqual(calls, [
		['st0', 'a'],
		['st1', 'b'],
	]);
	// prefix khác nhau không đụng tên tham số
	assert.strictEqual(inClause(req, 't.x', 'cat', ['z'], null), 't.x IN (@cat0)');

	assert.strictEqual(buildWhere([]), 'WHERE 1=1');
	assert.strictEqual(buildWhere(['a=1', null, 'b=2']), 'WHERE 1=1 AND a=1 AND b=2');
	console.log('sqlFilters.js OK');
}
