// Phần thuần của pg:transfer (scripts/pg-transfer/columns.js): mã hoá COPY,
// chuẩn hoá giá trị 2 phía, checksum không phụ thuộc thứ tự.
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../../scripts/pg-transfer/columns');

test('kindOf: theo kiểu PG trước (jsonb/inet), rồi kiểu SQL Server', () => {
	assert.equal(c.kindOf({ type: 'nvarchar' }, 'jsonb'), 'json');
	assert.equal(c.kindOf({ type: 'varchar' }, 'inet'), 'inet');
	assert.equal(c.kindOf({ type: 'bit' }, 'boolean'), 'bool');
	assert.equal(c.kindOf({ type: 'datetime2' }, 'timestamp without time zone'), 'ts');
	assert.equal(c.kindOf({ type: 'decimal' }, 'numeric'), 'num');
	assert.throws(() => c.kindOf({ type: 'geography' }, 'text'), /chưa hỗ trợ kiểu geography/);
});

test('sourceExpr: ngày giờ / số thập phân / bigint đọc dạng chuỗi', () => {
	assert.equal(
		c.sourceExpr({ name: 'created_at', type: 'datetime2', scale: 7 }),
		'CONVERT(varchar(26), CAST([created_at] AS datetime2(6)), 121) AS [created_at]',
	);
	assert.equal(c.sourceExpr({ name: 'd', type: 'datetime' }), 'CONVERT(varchar(23), [d], 121) AS [d]');
	assert.equal(c.sourceExpr({ name: 'd', type: 'date' }), 'CONVERT(char(10), [d], 23) AS [d]');
	assert.equal(c.sourceExpr({ name: 'x', type: 'decimal' }), 'CONVERT(varchar(50), [x]) AS [x]');
	assert.equal(c.sourceExpr({ name: 'id', type: 'bigint' }), 'CAST([id] AS varchar(20)) AS [id]');
	assert.equal(c.sourceExpr({ name: 'a]b', type: 'nvarchar' }), '[a]]b]');
});

test('copyField / copyLine: thoát ký tự đặc biệt của COPY text', () => {
	assert.equal(c.copyField(null), '\\N');
	assert.equal(c.copyField(undefined), '\\N');
	assert.equal(c.copyField(true), 't');
	assert.equal(c.copyField(false), 'f');
	assert.equal(c.copyField(42), '42');
	assert.equal(c.copyField('a\\b\tc\nd\re'), 'a\\\\b\\tc\\nd\\re');
	assert.equal(c.copyField('\\N'), '\\\\N'); // chuỗi "\N" thật, không phải NULL
	assert.throws(() => c.copyField('a\0b'), /NUL/);
	assert.throws(() => c.copyField(new Date()), /Date/);
	assert.equal(c.copyLine(['x', null, 1]), 'x\t\\N\t1\n');
});

test('parseCopyLine đọc lại đúng những gì COPY TO viết ra', () => {
	const values = ['a\\b', 'tab\there', 'line\nbreak', null, 'Tiếng Việt'];
	assert.deepEqual(c.parseCopyLine(c.copyLine(values).slice(0, -1)), values);
	assert.deepEqual(c.parseCopyLine('\\b\\f\\v'), ['\b\f\v']);
});

test('ipKey: IPv4, IPv6, IPv4-mapped cùng 1 khoá; sai thì null', () => {
	const v4 = c.ipKey('10.0.0.1');
	assert.equal(v4, '00000000000000000000ffff0a000001');
	assert.equal(c.ipKey('::ffff:10.0.0.1'), v4);
	assert.equal(c.ipKey(' 10.0.0.1 '), v4);
	assert.equal(c.ipKey('::1'), '00000000000000000000000000000001');
	assert.equal(c.ipKey('2001:DB8::1'), c.ipKey('2001:0db8:0000:0000:0000:0000:0000:0001'));
	assert.equal(c.ipKey('not-an-ip'), null);
});

test('normalize: giá trị SQL Server và chuỗi COPY của PG ra cùng 1 chuỗi', () => {
	const same = (kind, a, b) => assert.equal(c.normalize(kind, a), c.normalize(kind, b), `${kind}: ${a} ≠ ${b}`);
	same('bool', true, 'true'); // PG: bool::text
	same('bool', true, 't');
	same('bool', false, 'false');
	same('int', 7, '7');
	same('num', '12.50', '12.5');
	same('num', '10.00', '10');
	same('ts', '2026-01-02 03:04:05.123', '2026-01-02 03:04:05.123000');
	same('ts', '2026-01-02 03:04:05', '2026-01-02 03:04:05.000000');
	same('json', '{"b":1,"a":[1,2]}', '{"a": [1, 2], "b": 1}'); // jsonb sắp lại khoá
	same('inet', '10.0.0.1', '::ffff:10.0.0.1');
	assert.notEqual(c.normalize('text', null), c.normalize('text', ''));
	assert.notEqual(c.normalize('bool', true), c.normalize('bool', false));
	assert.notEqual(c.normalize('text', 'Abc'), c.normalize('text', 'abc'));
	assert.equal(c.normalize('json', '{bad'), '!{bad');
});

test('targetExpr: định dạng PG khớp normalize', () => {
	assert.equal(c.targetExpr('created_at', 'ts'), `to_char("created_at", 'YYYY-MM-DD HH24:MI:SS.US')`);
	assert.equal(c.targetExpr('d', 'date'), `to_char("d", 'YYYY-MM-DD')`);
	assert.equal(c.targetExpr('ip', 'inet'), 'host("ip")');
	assert.equal(c.targetExpr('x', 'text'), '"x"::text');
});

test('TableDigest: không phụ thuộc thứ tự dòng, chỉ ra đúng nhóm lệch', () => {
	const rows = [
		['1', ['1', 'a']],
		['2', ['2', 'b']],
		['3', ['3', 'c']],
	];
	const a = new c.TableDigest();
	const b = new c.TableDigest();
	for (const [k, f] of rows) a.add(k, f);
	for (const [k, f] of [...rows].reverse()) b.add(k, f);
	assert.deepEqual(a.diff(b), []);
	assert.equal(a.rows, 3);

	const d = new c.TableDigest();
	d.add('1', ['1', 'a']);
	d.add('2', ['2', 'B']); // dòng 2 lệch
	d.add('3', ['3', 'c']);
	assert.deepEqual(a.diff(d), [c.bucketOf('2')]);
	assert.ok(c.bucketOf('2') >= 0 && c.bucketOf('2') < c.BUCKETS);
});
