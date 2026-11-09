// pg:transfer precheck — CHỈ ĐỌC SQL Server. Tìm dữ liệu sẽ làm lần nạp PG
// thất bại hoặc đổi nghĩa (runbook: infra/chuyen-du-lieu-sang-postgresql.md). Lỗi chặn →
// mã thoát 1; cảnh báo → in ra, vẫn thoát 0.
const fs = require('fs');
const path = require('path');
const net = require('net');
const rules = require('./schemaRules');
const { bracket } = require('./columns');
const { readSource } = require('./catalog');
const { KNOWN_OBJECTS, sourceVersionProblem } = require('./sourceVersion');

const BASELINE_TABLES = path.resolve(__dirname, '../../database/baseline/01_tables.sql');
const CHAR_TYPES = new Set(['char', 'nchar', 'varchar', 'nvarchar', 'text', 'ntext']);

const count = async (pool, query) =>
	Number(Object.values((await pool.request().query(query)).recordset[0])[0]);

// Ràng buộc SQL Server không kiểm tra với dữ liệu cũ (NOCHECK / tắt).
//   - CHECK: baseline tạo NOT VALID (giữ đúng ý đồ không hồi tố) → chỉ cảnh báo.
//   - Khoá ngoại: PG luôn VALIDATE → dòng mồ côi là lỗi chặn.
const untrustedConstraints = async (pool, blockers, warnings) => {
	const checks = (
		await pool.request().query(`
			SELECT OBJECT_NAME(cc.parent_object_id) AS table_name, cc.name, cc.definition
			FROM sys.check_constraints cc
			WHERE cc.is_not_trusted = 1 OR cc.is_disabled = 1`)
	).recordset;
	for (const c of checks) {
		const n = await count(
			pool,
			`SELECT COUNT_BIG(*) FROM ${bracket(c.table_name)} WHERE NOT ${c.definition}`,
		);
		if (n)
			warnings.push(
				`CHECK ${c.name} (${c.table_name}): ${n} dòng cũ vi phạm — PG giữ NOT VALID như SQL Server (dòng mới vẫn bị kiểm)`,
			);
	}
	const fks = (
		await pool.request().query(`
			SELECT fk.object_id, fk.name, OBJECT_NAME(fk.parent_object_id) AS child,
			       OBJECT_NAME(fk.referenced_object_id) AS parent,
			       pc.name AS child_col, rc.name AS parent_col
			FROM sys.foreign_keys fk
			JOIN sys.foreign_key_columns k ON k.constraint_object_id = fk.object_id
			JOIN sys.columns pc ON pc.object_id = k.parent_object_id AND pc.column_id = k.parent_column_id
			JOIN sys.columns rc ON rc.object_id = k.referenced_object_id AND rc.column_id = k.referenced_column_id
			WHERE fk.is_not_trusted = 1 OR fk.is_disabled = 1
			ORDER BY fk.object_id, k.constraint_column_id`)
	).recordset;
	const byFk = new Map();
	for (const r of fks) {
		if (!byFk.has(r.object_id)) byFk.set(r.object_id, { ...r, cols: [] });
		byFk.get(r.object_id).cols.push([r.child_col, r.parent_col]);
	}
	for (const fk of byFk.values()) {
		const notNull = fk.cols.map(([c]) => `ch.${bracket(c)} IS NOT NULL`).join(' AND ');
		const match = fk.cols.map(([c, p]) => `pa.${bracket(p)} = ch.${bracket(c)}`).join(' AND ');
		const n = await count(
			pool,
			`SELECT COUNT_BIG(*) FROM ${bracket(fk.child)} ch WHERE ${notNull}
			 AND NOT EXISTS (SELECT 1 FROM ${bracket(fk.parent)} pa WHERE ${match})`,
		);
		if (n)
			blockers.push(
				`Khoá ngoại ${fk.name}: ${n} dòng ${fk.child} không có dòng cha ở ${fk.parent}`,
			);
	}
	return { checks: checks.length, fks: byFk.size };
};

const run = async (pool, log) => {
	const blockers = [];
	const warnings = [];
	// 0. DB nguồn đủ migration T-SQL (cùng phiên bản với baseline PG)
	const version = await sourceVersionProblem(pool);
	if (version) blockers.push(version);

	const source = await readSource(pool);

	// 1. Bảng nguồn khớp baseline PG (baseline sinh từ DB khác / cũ → lệch)
	const baselineTables = new Set(
		[
			...fs
				.readFileSync(BASELINE_TABLES, 'utf8')
				.matchAll(/^CREATE TABLE IF NOT EXISTS (\w+) \(/gm),
		].map((m) => m[1]),
	);
	for (const key of source.keys()) {
		if (!rules.SKIP_TABLES.has(key) && !baselineTables.has(key))
			blockers.push(`Bảng ${key} chưa có trong baseline PG — DB nguồn khác phiên bản code này`);
	}
	for (const t of baselineTables) {
		if (!source.has(t))
			blockers.push(
				`Baseline PG có bảng ${t} nhưng DB nguồn không có — DB nguồn khác phiên bản code này`,
			);
	}

	// 2. Ràng buộc không tin cậy
	const trust = await untrustedConstraints(pool, blockers, warnings);
	log(`Ràng buộc NOCHECK/tắt đã kiểm: ${trust.checks} CHECK, ${trust.fks} khoá ngoại`);

	// 3. Ký tự NUL, JSON sai, IP sai, khoảng trắng cuối ở cột không phân biệt hoa/thường
	for (const [key, t] of source) {
		if (rules.SKIP_TABLES.has(key)) continue;
		const chars = t.columns.filter((c) => CHAR_TYPES.has(c.type) && !c.is_computed);
		for (const c of chars) {
			const col = bracket(c.name);
			const nul = await count(
				pool,
				`SELECT COUNT_BIG(*) FROM ${bracket(t.name)} WHERE CHARINDEX(CHAR(0), ${col} COLLATE Latin1_General_BIN2) > 0`,
			);
			if (nul) blockers.push(`${key}.${c.name}: ${nul} giá trị chứa ký tự NUL (PG không lưu được)`);

			const name = `${key}.${c.name.toLowerCase()}`;
			if (rules.JSONB_COLUMNS.has(name)) {
				const bad = await count(
					pool,
					`SELECT COUNT_BIG(*) FROM ${bracket(t.name)} WHERE ${col} IS NOT NULL AND ISJSON(${col}) = 0`,
				);
				if (bad) blockers.push(`${name}: ${bad} giá trị không phải JSON hợp lệ (cột jsonb)`);
			}
			if (rules.INET_COLUMNS.has(name)) {
				const values = (
					await pool
						.request()
						.query(`SELECT DISTINCT ${col} AS v FROM ${bracket(t.name)} WHERE ${col} IS NOT NULL`)
				).recordset.map((r) => r.v);
				const bad = values.filter((v) => !net.isIP(String(v).trim()));
				if (bad.length)
					blockers.push(
						`${name}: ${bad.length} địa chỉ IP không hợp lệ (cột inet), ví dụ ${bad.slice(0, 3).join(' | ')}`,
					);
			}
			if (rules.CI_COLUMNS.has(c.name.toLowerCase())) {
				const trailing = await count(
					pool,
					`SELECT COUNT_BIG(*) FROM ${bracket(t.name)} WHERE DATALENGTH(${col}) > DATALENGTH(RTRIM(${col}))`,
				);
				if (trailing)
					warnings.push(
						`${name}: ${trailing} giá trị có khoảng trắng cuối — SQL Server so "a " = "a", PG thì không (đăng nhập/tìm theo mã sẽ không khớp)`,
					);
			}
		}
	}

	// 4. Collation: rms_ci phân biệt dấu (như *_CI_AS)
	const coll = (
		await pool
			.request()
			.query(`SELECT CAST(DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS varchar(128)) AS c`)
	).recordset[0].c;
	if (/_AI/.test(coll))
		warnings.push(
			`DB nguồn dùng collation ${coll} (không phân biệt dấu) — PG rms_ci phân biệt dấu`,
		);

	// 5. Object trong DB ngoài danh sách đã biết (sẽ không được chuyển)
	const objects = (
		await pool.request().query(`
			SELECT o.name, o.type_desc FROM sys.objects o
			WHERE o.is_ms_shipped = 0 AND o.type IN ('P', 'FN', 'IF', 'TF', 'TR', 'V')`)
	).recordset;
	for (const o of objects) {
		if (!KNOWN_OBJECTS.has(o.name.toLowerCase()))
			warnings.push(
				`${o.type_desc} ${o.name} có trong DB nhưng không thuộc hệ thống — không được chuyển`,
			);
	}

	return { blockers, warnings };
};

module.exports = { run };
