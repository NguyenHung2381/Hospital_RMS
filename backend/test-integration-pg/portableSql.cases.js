// Helper SQL của adapter (portableSql.test.js), chỉ đọc. Khoá lại các khác biệt
// đã gặp khi chuyển từ SQL Server sang PostgreSQL:
//   - cột boolean trong SELECT: boolExpr / castBool của adapter (SQL Server không
//     có boolean, PG không có BIT ↔ số),
//   - chuỗi N'...' trên PG là kiểu char ⇒ mất khoảng trắng cuối; bỏ N thì đúng cả
//     2 bên khi chuỗi chỉ có ký tự CP1252 (collation DB SQL Server),
//   - COALESCE thay ISNULL, CONCAT thay nối chuỗi bằng +.
const assert = require('node:assert/strict');

/**
 * @param {import('node:test').TestContext} t
 * @param {any} db module src/config/db
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

	await t.test('jsonValues: mảng JSON → bảng (kiểu, null, vị trí từ 0)', async () => {
		const { jsonValues } = db;
		const all = async (text, inputs) => {
			const req = pool.request();
			for (const [name, value] of Object.entries(inputs))
				req.input(name, sql.NVarChar(sql.MAX), JSON.stringify(value));
			return (await req.query(text)).recordset;
		};
		const ids = await all(
			`SELECT j.value, j.idx FROM ${jsonValues('@ids', { withIndex: true })} j ORDER BY j.idx`,
			{ ids: ['B2', 'A1', 'C3'] },
		);
		assert.deepEqual(ids, [
			{ value: 'B2', idx: 0 },
			{ value: 'A1', idx: 1 },
			{ value: 'C3', idx: 2 },
		]);
		const ints = await all(
			`SELECT j.value FROM ${jsonValues('@n', { type: 'INT' })} j WHERE j.value IS NULL OR j.value IN ${jsonValues('@n', { type: 'INT' })}`,
			{ n: [3, null, 1] },
		);
		// Không ORDER BY: NULL đứng đầu ở SQL Server, cuối ở PG
		assert.deepEqual(ints.map((r) => r.value).sort(), [1, 3, null]);
		const [d] = await all(
			`SELECT COUNT(*) AS n FROM ${jsonValues('@d', { type: 'DATE' })} j WHERE j.value >= CAST('2026-01-01' AS DATE)`,
			{ d: ['2026-11-03', '2025-12-31'] },
		);
		assert.equal(Number(d.n), 1);
	});

	await t.test('jsonRows: mảng object → bảng có kiểu, giữ chữ Việt ở NVARCHAR', async () => {
		const rows = (
			await pool
				.request()
				.input(
					'rows',
					sql.NVarChar(sql.MAX),
					JSON.stringify([
						{ id: 'G1', score: 8.5, classification: 'Giỏi' },
						{ id: 'G2', score: null, classification: 'Trung bình' },
					]),
				)
				.query(
					`SELECT j.id, j.score, j.classification FROM ${db.jsonRows('@rows', 'j', [
						['id', 'VARCHAR(20)'],
						['score', 'DECIMAL(5, 2)'],
						['classification', 'NVARCHAR(20)'],
					])} ORDER BY j.id`,
				)
		).recordset;
		assert.deepEqual(rows, [
			{ id: 'G1', score: 8.5, classification: 'Giỏi' },
			{ id: 'G2', score: null, classification: 'Trung bình' },
		]);
	});
};

module.exports = { run };
