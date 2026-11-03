// Adapter PostgreSQL (src/config/pgParams.js, db.pg.js): đổi @ten → $n, giá
// trị tham số, kiểu khi đọc, dạng kết quả — không cần DB thật. Phần chạy trên
// PG thật: test-integration/pgAdapter.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { TYPES: sql, toPositional, toPgValue, TYPE_PARSERS } = require('../../src/config/pgParams');

const params = (obj) =>
	new Map(
		Object.entries(obj).map(([name, [type, value]]) => [name.toLowerCase(), { name, type, value }]),
	);

test('@ten → $n, cùng tên dùng lại số, ép kiểu số/ngày; chuỗi chỉ ép trước IS NULL', () => {
	const r = toPositional(
		'SELECT * FROM users WHERE id = @id AND (@dept IS NULL OR department_id = @dept) AND age > @age',
		params({ id: [sql.VarChar(20), 'NV001'], dept: [sql.VarChar(20), null], age: [sql.Int, 18] }),
	);
	assert.equal(
		r.text,
		'SELECT * FROM users WHERE id = $1 AND ($2::text IS NULL OR department_id = $2) AND age > $3::int',
	);
	assert.deepEqual(r.values, ['NV001', null, 18]);
});

test('IS NOT NULL / không khai báo kiểu: suy kiểu ép theo giá trị', () => {
	const r = toPositional(
		'SELECT @a IS NOT NULL, @b  is  null, @c IS NULL, @d IS NULL, @e IS NULLIF',
		params({ a: [undefined, 'x'], b: [undefined, 5], c: [undefined, true], d: [sql.Int, 1], e: [undefined, 'y'] }),
	);
	assert.equal(r.text, 'SELECT $1::text IS NOT NULL, $2::bigint  is  null, $3::boolean IS NULL, $4::int IS NULL, $5 IS NULLIF');
});

test('bỏ qua @ trong chuỗi, tên "...", comment, $tag$, @@ và toán tử jsonb', () => {
	const text = [
		"SELECT 'a@b.vn' AS email, \"col@x\" -- @khong",
		'/* @khong */ , @@ROWCOUNT, $$ @khong $$, $f$ @khong $f$',
		", data @> '{}'::jsonb, @x",
	].join('\n');
	const r = toPositional(text, params({ x: [undefined, 5] }));
	assert.equal(r.text, text.replace(', @x', ', $1'));
	assert.deepEqual(r.values, [5]);
});

test("chuỗi có '' thoát không làm lệch vị trí", () => {
	const r = toPositional("SELECT 'it''s @no' , @a", params({ a: [sql.NVarChar(sql.MAX ?? -1), 'x'] }));
	assert.equal(r.text, "SELECT 'it''s @no' , $1");
});

test('tên tham số không phân biệt hoa/thường; thiếu tham số thì ném lỗi', () => {
	assert.equal(toPositional('SELECT @UserId', params({ userid: [sql.Int, 1] })).text, 'SELECT $1::int');
	assert.throws(() => toPositional('SELECT @missing', params({})), /@missing/);
});

test('giá trị: Date theo UTC (giống useUTC), Bit → boolean', () => {
	const d = new Date('2026-11-03T08:30:00.123Z');
	assert.equal(toPgValue(sql.DateTime2, d), '2026-11-03 08:30:00.123');
	assert.equal(toPgValue(undefined, d), '2026-11-03 08:30:00.123');
	assert.equal(toPgValue(sql.Date, d), '2026-11-03');
	assert.equal(toPgValue(sql.Bit, 1), true);
	assert.equal(toPgValue(sql.Bit, 0), false);
	assert.equal(toPgValue(sql.Bit, '1'), true);
	assert.equal(toPgValue(sql.Int, true), 1);
	assert.equal(toPgValue(sql.VarChar(10), undefined), null);
	assert.equal(toPgValue(sql.VarChar(10), 'abc'), 'abc');
});

test('kiểu khi đọc giống mssql', () => {
	const ts = TYPE_PARSERS[1114]('2026-11-03 18:17:46.012');
	assert.equal(ts.toISOString(), '2026-11-03T18:17:46.012Z'); // giờ VN gắn nhãn UTC
	assert.equal(TYPE_PARSERS[1082]('2026-11-03').toISOString(), '2026-11-03T00:00:00.000Z');
	assert.equal(TYPE_PARSERS[1700]('12.50'), 12.5);
	assert.equal(TYPE_PARSERS[20]('42'), 42); // COUNT(*) trả bigint
	assert.equal(TYPE_PARSERS[20]('9007199254740993'), '9007199254740993'); // quá 2^53: giữ chuỗi
	assert.equal(TYPE_PARSERS[3802]('{"a":1}'), '{"a":1}'); // jsonb: chuỗi nguyên văn
});

test('dạng kết quả: recordset/recordsets/rowsAffected', () => {
	const { toMssqlResult } = require('../../src/config/db.pg');
	const sel = { fields: [{ name: 'id' }], rows: [{ id: 1 }], rowCount: 1 };
	const upd = { fields: [], rows: [], rowCount: 3 };
	assert.deepEqual(toMssqlResult(sel), { recordset: [{ id: 1 }], recordsets: [[{ id: 1 }]], rowsAffected: [1] });
	const multi = toMssqlResult([upd, sel]);
	assert.deepEqual(multi.recordsets, [[{ id: 1 }]]);
	assert.deepEqual(multi.rowsAffected, [3, 1]);
	assert.equal(toMssqlResult(upd).recordset, undefined); // như mssql: không có SELECT
});

test('SSL: theo DB_ENCRYPT / DB_TRUST_SERVER_CERT', () => {
	const { sslOptions } = require('../../src/config/db.pg');
	assert.equal(sslOptions({ DB_ENCRYPT: false }), false);
	assert.deepEqual(sslOptions({ DB_ENCRYPT: true, DB_TRUST_SERVER_CERT: true }), { rejectUnauthorized: false });
	assert.deepEqual(sslOptions({ DB_ENCRYPT: true, DB_TRUST_SERVER_CERT: false }), { rejectUnauthorized: true });
});

test('execute()/output() báo rõ chưa hỗ trợ trên PG', async () => {
	const { sql: pgSql } = require('../../src/config/db.pg');
	const req = new pgSql.Request({ run: async () => ({}) });
	await assert.rejects(() => req.execute('sp_gen_user_id'), /stored procedure/);
	assert.throws(() => req.output('x', pgSql.Int), /chưa hỗ trợ/);
});

test('withActor trên PG bắt buộc chạy trong transaction', () => {
	const { withActor } = require('../../src/config/db.pg');
	assert.throws(() => withActor({ request() {} }, 'NV001'), /transaction/);
});

test('pgpass: khớp theo host/port/db/user, * là mọi giá trị, \\: thoát', () => {
	const { pgpassLookup } = require('../../src/config/pgParams');
	const content = [
		'# chú thích',
		'127.0.0.1:5432:rms_hospital:rms_app:mk\\:co\\\\ky_tu',
		'127.0.0.1:5432:*:rms_migrate:mk2',
		'*:*:*:postgres:mk3',
	].join('\r\n');
	const key = (database, user) => ({ host: '127.0.0.1', port: 5432, database, user });
	assert.equal(pgpassLookup(content, key('rms_hospital', 'rms_app')), 'mk:co\\ky_tu');
	assert.equal(pgpassLookup(content, key('rms_khac', 'rms_app')), undefined);
	assert.equal(pgpassLookup(content, key('bat_ky', 'rms_migrate')), 'mk2');
	assert.equal(pgpassLookup(content, { ...key('x', 'postgres'), host: 'db.local' }), 'mk3');
});
