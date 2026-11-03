// Cú pháp viết chung cho 2 DB (POSTGRESQL_MIGRATION_PLAN.md chặng 1) — chạy trên
// SQL Server (test-integration/portableSql.test.js) và PG (test-integration-pg/
// portableSql.test.js), chỉ đọc. Khoá lại các khác biệt đã gặp khi đổi:
//   - cột boolean trong SELECT: boolExpr / castBool của adapter (SQL Server không
//     có boolean, PG không có BIT ↔ số),
//   - chuỗi N'...' trên PG là kiểu char ⇒ mất khoảng trắng cuối; bỏ N thì đúng cả
//     2 bên khi chuỗi chỉ có ký tự CP1252 (collation DB SQL Server),
//   - COALESCE thay ISNULL, CONCAT thay nối chuỗi bằng +.
const assert = require('node:assert/strict');

/**
 * @param {import('node:test').TestContext} t
 * @param {any} db module src/config/db (đã chọn đúng DB_CLIENT)
 */
const run = async (t, db) => {
	const { sql, boolExpr, castBool } = db;
	const pool = await db.getPool();
	const one = async (text, inputs = []) => {
		const req = pool.request();
		for (const [name, type, value] of inputs) req.input(name, type, value);
		return (await req.query(text)).recordset[0];
	};

	await t.test('boolExpr / castBool trả true/false của JS', async () => {
		const row = await one(
			`SELECT ${boolExpr('1 = 1')} AS yes, ${boolExpr('1 = 0')} AS no,
			        ${boolExpr('@x IS NULL')} AS from_null, ${castBool('NULL')} AS unknown,
			        ${castBool('1')} AS one`,
			[['x', sql.VarChar(10), null]],
		);
		assert.deepEqual(row, { yes: true, no: false, from_null: true, unknown: null, one: true });
	});

	await t.test('chuỗi không N giữ khoảng trắng và ký tự CP1252 (· —)', async () => {
		const row = await one(
			`SELECT CONCAT('[', ' · ', ']') AS dot, CONCAT('[', ' — ', ']') AS dash,
			        LOWER(LTRIM(RTRIM(REPLACE(REPLACE(@s, '  ', ' '), '  ', ' ')))) AS name_key`,
			[['s', sql.NVarChar(100), '  Nguyễn   Văn    A  ']],
		);
		assert.deepEqual(row, { dot: '[ · ]', dash: '[ — ]', name_key: 'nguyễn văn a' });
	});

	await t.test('COALESCE với tham số chữ Việt, CONCAT với cột NULL', async () => {
		const row = await one(
			`SELECT COALESCE(d.name, @none) AS label, CONCAT(d.name, ':', d.id) AS k
			 FROM (SELECT CAST(NULL AS VARCHAR(50)) AS name, 'X1' AS id) d`,
			[['none', sql.NVarChar(50), 'Chưa xác định']],
		);
		assert.deepEqual(row, { label: 'Chưa xác định', k: ':X1' });
	});
};

module.exports = { run };
