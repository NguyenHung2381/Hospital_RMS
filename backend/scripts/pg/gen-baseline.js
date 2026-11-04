#!/usr/bin/env node
// Sinh schema PostgreSQL (baseline) từ schema SQL Server ĐANG CHẠY — vì các bảng
// lõi được tạo tay trước khi có migration, repo không có đủ CREATE TABLE
// (POSTGRESQL_MIGRATION_PLAN.md mục 0, 5.3). Chỉ ĐỌC danh mục hệ thống (sys.*).
//
//   npm run pg:baseline            ghi database/pg/baseline/01_tables.sql, 02_constraints_indexes.sql
//   npm run pg:baseline -- --check chỉ in tóm tắt, không ghi file
//
// Quy tắc kiểu dữ liệu: tsqlToPg.js (chung) + schemaRules.js (riêng từng cột).
// 00_extensions.sql và 03_toi_uu.sql viết tay, không sinh.
// Thứ tự chạy khi chuyển dữ liệu (mục 6.5.3): 00 → 01 → nạp dữ liệu → 02 → 03 → 04.
// Chạy lại trên bản sao production trước mỗi lần diễn tập: DB dev có thể khác.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });

const t2p = require('./tsqlToPg');
const rules = require('./schemaRules');

const OUT_DIR = path.join(__dirname, '../../database/pg/baseline');

const readCatalog = async (pool) => {
	const q = async (text) => (await pool.request().query(text)).recordset;
	const tables = await q(`
		SELECT object_id, name FROM sys.tables WHERE is_ms_shipped = 0 ORDER BY name`);
	const columns = await q(`
		SELECT c.object_id, c.column_id, c.name, TYPE_NAME(c.system_type_id) AS type,
		       c.max_length, c.precision, c.scale, c.is_nullable, c.is_identity, c.is_computed,
		       dc.definition AS default_def
		FROM sys.columns c
		JOIN sys.tables t ON t.object_id = c.object_id AND t.is_ms_shipped = 0
		LEFT JOIN sys.default_constraints dc
		       ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
		ORDER BY c.object_id, c.column_id`);
	const indexes = await q(`
		SELECT i.object_id, i.index_id, i.name, i.is_unique, i.is_primary_key,
		       i.is_unique_constraint, i.filter_definition
		FROM sys.indexes i
		JOIN sys.tables t ON t.object_id = i.object_id AND t.is_ms_shipped = 0
		WHERE i.type > 0
		ORDER BY i.object_id, i.index_id`);
	const indexColumns = await q(`
		SELECT ic.object_id, ic.index_id, c.name, ic.key_ordinal, ic.is_descending_key
		FROM sys.index_columns ic
		JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
		JOIN sys.tables t ON t.object_id = ic.object_id AND t.is_ms_shipped = 0
		WHERE ic.key_ordinal > 0
		ORDER BY ic.object_id, ic.index_id, ic.key_ordinal`);
	const checks = await q(`
		SELECT parent_object_id AS object_id, name, definition, is_disabled, is_not_trusted
		FROM sys.check_constraints ORDER BY parent_object_id, name`);
	const foreignKeys = await q(`
		SELECT fk.object_id AS fk_id, fk.name, fk.parent_object_id, fk.referenced_object_id,
		       fk.delete_referential_action_desc AS on_delete,
		       fk.update_referential_action_desc AS on_update, fk.is_disabled,
		       pc.name AS column_name, rc.name AS ref_column_name, fkc.constraint_column_id AS ord
		FROM sys.foreign_keys fk
		JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
		JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
		JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
		ORDER BY fk.name, fkc.constraint_column_id`);
	const sequences = await q(`
		SELECT name, CAST(start_value AS VARCHAR(30)) AS start_value, CAST(increment AS VARCHAR(30)) AS increment,
		       CAST(minimum_value AS VARCHAR(30)) AS min_value, CAST(maximum_value AS VARCHAR(30)) AS max_value,
		       is_cycling, TYPE_NAME(system_type_id) AS type
		FROM sys.sequences ORDER BY name`);
	return { tables, columns, indexes, indexColumns, checks, foreignKeys, sequences };
};

/** Dựng mô hình schema đã đổi sang PG (thuần, không DB) — test được. */
const buildModel = (cat) => {
	const warnings = [];
	const tableById = new Map(
		cat.tables
			.filter((t) => !rules.SKIP_TABLES.has(t.name.toLowerCase()))
			.map((t) => [t.object_id, { name: t.name.toLowerCase(), columns: [], colTypes: {} }]),
	);

	for (const c of cat.columns) {
		const table = tableById.get(c.object_id);
		if (!table) continue;
		const col = { ...c, name: c.name.toLowerCase() };
		const key = `${table.name}.${col.name}`;
		const pgType = t2p.mapType(col, rules.typeOverride(table.name, col));
		table.colTypes[col.name] = pgType;
		if (t2p.RESERVED.has(col.name))
			warnings.push(`Cột trùng từ khoá PG (phải viết "${col.name}"): ${key}`);
		let generated;
		if (col.is_computed) {
			generated = rules.COMPUTED_COLUMNS[key];
			if (!generated)
				throw new Error(`Cột tính toán chưa có quy tắc trong schemaRules.COMPUTED_COLUMNS: ${key}`);
		}
		table.columns.push({
			name: col.name,
			type: pgType,
			collation: rules.collationFor(table.name, col, pgType),
			notNull: !col.is_nullable,
			identity: !!col.is_identity,
			generated,
			default:
				col.default_def && !col.is_identity && !generated
					? t2p.translateDefault(col.default_def, pgType)
					: undefined,
		});
	}

	// Cột khoá của từng index
	const keysOf = new Map();
	for (const ic of cat.indexColumns) {
		const k = `${ic.object_id}:${ic.index_id}`;
		if (!keysOf.has(k)) keysOf.set(k, []);
		keysOf.get(k).push({ name: ic.name.toLowerCase(), desc: !!ic.is_descending_key });
	}

	// Tên index / ràng buộc có index là duy nhất trong cả schema ở PG.
	const usedNames = new Set();
	const uniqueName = (name, table) => {
		let n = t2p.objectName(name);
		if (usedNames.has(n)) n = t2p.objectName(`${name}_${table}`);
		usedNames.add(n);
		return n;
	};

	for (const ix of cat.indexes) {
		const table = tableById.get(ix.object_id);
		if (!table) continue;
		const keys = keysOf.get(`${ix.object_id}:${ix.index_id}`) || [];
		const name = ix.name.toLowerCase();
		if (ix.is_primary_key) {
			const part = rules.PARTITIONED_TABLES[table.name];
			table.primaryKey = {
				name: uniqueName(`${table.name}_pkey`, table.name),
				columns: part ? part.primaryKey : keys.map((k) => k.name),
			};
			continue;
		}
		if (rules.SKIP_INDEXES.has(name)) continue;
		(table.indexes ||= []).push({
			name,
			unique: !!ix.is_unique,
			constraint: !!ix.is_unique_constraint,
			keys,
			filter: ix.filter_definition ? t2p.translateExpr(ix.filter_definition, table.colTypes) : null,
		});
	}

	// Bỏ index thừa: trùng hệt index khác, hoặc (không UNIQUE) có cột khoá là phần
	// đầu của khoá chính / index UNIQUE không lọc. INCLUDE không chép nên nhiều
	// index chỉ khác nhau ở INCLUDE sẽ thành trùng.
	for (const table of tableById.values()) {
		const sig = (ix) => ix.keys.map((k) => `${k.name}${k.desc ? ' desc' : ''}`).join(',');
		const coverers = [
			...(table.primaryKey ? [table.primaryKey.columns.join(',')] : []),
			...(table.indexes || []).filter((i) => i.unique && !i.filter).map(sig),
		];
		const seen = new Set();
		table.indexes = (table.indexes || []).filter((ix) => {
			const s = `${ix.unique}|${sig(ix)}|${ix.filter ?? ''}`;
			if (seen.has(s)) {
				warnings.push(`Bỏ index trùng ${table.name}.${ix.name}`);
				return false;
			}
			seen.add(s);
			if (!ix.unique && !ix.filter && coverers.some((c) => `${c},`.startsWith(`${sig(ix)},`))) {
				warnings.push(`Bỏ index đã được UNIQUE/khoá chính phủ ${table.name}.${ix.name}`);
				return false;
			}
			return true;
		});
		for (const ix of table.indexes) ix.name = uniqueName(ix.name, table.name);
	}

	for (const ck of cat.checks) {
		const table = tableById.get(ck.object_id);
		if (!table) continue;
		// Cột jsonb tự kiểm tra JSON hợp lệ — bỏ CHECK isjson
		const jsonCol =
			/^\(isjson\(\[(\w+)\]\)=\(1\)\)$/i.exec(ck.definition) ||
			/^\(\[(\w+)\] IS NULL OR isjson\(\[\1\]\)=\(1\)\)$/i.exec(ck.definition);
		if (jsonCol && table.colTypes[jsonCol[1].toLowerCase()] === 'jsonb') continue;
		if (ck.is_disabled) warnings.push(`CHECK đang tắt trên SQL Server: ${table.name}.${ck.name}`);
		(table.checks ||= []).push({
			name: t2p.objectName(ck.name),
			expr: t2p.translateExpr(ck.definition, table.colTypes),
			// WITH NOCHECK trên SQL Server (cố ý không hồi tố dữ liệu cũ) → NOT VALID ở PG:
			// dòng mới vẫn bị kiểm, dòng cũ giữ nguyên.
			notValid: !!ck.is_not_trusted,
		});
	}

	const fks = new Map();
	for (const r of cat.foreignKeys) {
		const table = tableById.get(r.parent_object_id);
		const ref = tableById.get(r.referenced_object_id);
		if (!table || !ref) continue;
		if (!fks.has(r.fk_id))
			fks.set(r.fk_id, {
				table: table.name,
				name: t2p.objectName(r.name),
				refTable: ref.name,
				columns: [],
				refColumns: [],
				onDelete: t2p.fkAction(r.on_delete),
				onUpdate: t2p.fkAction(r.on_update),
			});
		const fk = fks.get(r.fk_id);
		fk.columns.push(r.column_name.toLowerCase());
		fk.refColumns.push(r.ref_column_name.toLowerCase());
		if (r.is_disabled) warnings.push(`Khoá ngoại đang tắt trên SQL Server: ${fk.table}.${fk.name}`);
	}

	const sequences = cat.sequences.map((s) => ({
		name: t2p.objectName(s.name),
		type: s.type === 'int' ? 'integer' : s.type,
		start: s.start_value,
		increment: s.increment,
		min: s.min_value,
		max: s.max_value,
		cycle: !!s.is_cycling,
	}));

	const tables = [...tableById.values()].sort((a, b) => a.name.localeCompare(b.name));
	return { tables, foreignKeys: [...fks.values()], sequences, warnings };
};

const q = t2p.ident;
const colList = (cols) => cols.map(q).join(', ');
const keyList = (keys) => keys.map((k) => `${q(k.name)}${k.desc ? ' DESC' : ''}`).join(', ');

const HEADER = (title) => `-- ${title}
-- FILE SINH TỰ ĐỘNG bằng \`npm run pg:baseline\` (backend/scripts/pg/gen-baseline.js)
-- từ schema SQL Server. Không sửa tay: sửa schemaRules.js / tsqlToPg.js rồi sinh lại.
-- Thứ tự chạy: 00_extensions → 01_tables → nạp dữ liệu → 02_constraints_indexes → 03_toi_uu.
`;

const renderTables = (model) => {
	const out = [HEADER('Bảng, khoá chính, sequence'), 'SET client_min_messages = warning;', ''];
	for (const s of model.sequences)
		out.push(
			`CREATE SEQUENCE IF NOT EXISTS ${q(s.name)} AS ${s.type} START WITH ${s.start} INCREMENT BY ${s.increment}` +
				` MINVALUE ${s.min} MAXVALUE ${s.max}${s.cycle ? ' CYCLE' : ''};`,
		);
	if (model.sequences.length) out.push('');
	for (const t of model.tables) {
		const lines = t.columns.map((c) => {
			let line = `\t${q(c.name)} ${c.type}`;
			if (c.collation) line += ` COLLATE "${c.collation}"`;
			if (c.identity) line += ' GENERATED BY DEFAULT AS IDENTITY';
			if (c.generated) line += ` GENERATED ALWAYS AS (${c.generated}) STORED`;
			if (c.default !== undefined) line += ` DEFAULT ${c.default}`;
			if (c.notNull && !c.generated) line += ' NOT NULL';
			return line;
		});
		if (t.primaryKey)
			lines.push(
				`\tCONSTRAINT ${q(t.primaryKey.name)} PRIMARY KEY (${colList(t.primaryKey.columns)})`,
			);
		const part = rules.PARTITIONED_TABLES[t.name];
		out.push(
			`CREATE TABLE IF NOT EXISTS ${q(t.name)} (\n${lines.join(',\n')}\n)${part ? ` PARTITION BY RANGE (${q(part.column)})` : ''};`,
		);
		if (part)
			// Partition tháng phải có TRƯỚC khi nạp dữ liệu. DEFAULT hứng dòng ngoài
			// khoảng (cũ hơn hạn giữ, hoặc job chưa kịp tạo tháng mới) — nên luôn rỗng.
			out.push(
				`CREATE TABLE IF NOT EXISTS ${q(`${t.name}_default`)} PARTITION OF ${q(t.name)} DEFAULT;`,
				`SELECT rms_maintain_monthly_partitions('${t.name}', ${part.monthsBack}, ${part.monthsAhead}, NULL);`,
			);
		out.push('');
	}
	return out.join('\n');
};

const renderConstraints = (model) => {
	const out = [
		HEADER('Ràng buộc UNIQUE / CHECK, index, khoá ngoại (chạy SAU khi nạp dữ liệu)'),
		'SET client_min_messages = warning;',
		'',
		'-- UNIQUE, CHECK, index',
	];
	for (const t of model.tables) {
		const nullable = (name) =>
			!t.columns.find((c) => c.name.toLowerCase() === name.toLowerCase())?.notNull;
		for (const ix of t.indexes || []) {
			// UNIQUE của SQL Server coi các NULL là trùng nhau (chỉ 1 dòng NULL); PG mặc định
			// coi là khác nhau → khoá không lọc có cột được NULL phải NULLS NOT DISTINCT
			// (cũng là điều kiện để ON CONFLICT của upsert bắt được dòng có cột khoá NULL).
			const nnd =
				ix.unique && !ix.filter && ix.keys.some((k) => nullable(k.name))
					? ' NULLS NOT DISTINCT'
					: '';
			if (ix.constraint && !ix.filter)
				out.push(
					`ALTER TABLE ${q(t.name)} ADD CONSTRAINT ${q(ix.name)} UNIQUE${nnd} (${keyList(ix.keys)});`,
				);
			else
				out.push(
					`CREATE ${ix.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${q(ix.name)} ON ${q(t.name)} (${keyList(ix.keys)})` +
						`${nnd}${ix.filter ? ` WHERE ${ix.filter}` : ''};`,
				);
		}
		for (const ck of t.checks || [])
			out.push(
				`ALTER TABLE ${q(t.name)} ADD CONSTRAINT ${q(ck.name)} CHECK ${ck.expr}${ck.notValid ? ' NOT VALID' : ''};`,
			);
	}
	out.push('', '-- Khoá ngoại: tạo NOT VALID rồi VALIDATE (nhanh hơn, báo rõ ràng buộc nào sai)');
	for (const fk of model.foreignKeys)
		out.push(
			`ALTER TABLE ${q(fk.table)} ADD CONSTRAINT ${q(fk.name)} FOREIGN KEY (${colList(fk.columns)})` +
				` REFERENCES ${q(fk.refTable)} (${colList(fk.refColumns)})` +
				`${fk.onDelete !== 'NO ACTION' ? ` ON DELETE ${fk.onDelete}` : ''}` +
				`${fk.onUpdate !== 'NO ACTION' ? ` ON UPDATE ${fk.onUpdate}` : ''} NOT VALID;`,
		);
	out.push('');
	for (const fk of model.foreignKeys)
		out.push(`ALTER TABLE ${q(fk.table)} VALIDATE CONSTRAINT ${q(fk.name)};`);
	out.push('');
	return out.join('\n');
};

const main = async () => {
	const { getPool } = require('../../src/config/db');
	const pool = await getPool();
	const model = buildModel(await readCatalog(pool));
	const indexCount = model.tables.reduce((n, t) => n + (t.indexes?.length || 0), 0);
	const checkCount = model.tables.reduce((n, t) => n + (t.checks?.length || 0), 0);
	console.log(
		`${model.tables.length} bảng, ${indexCount} index/UNIQUE, ${checkCount} CHECK, ` +
			`${model.foreignKeys.length} khoá ngoại, ${model.sequences.length} sequence.`,
	);
	for (const w of model.warnings) console.log(`  ⚠ ${w}`);
	if (!process.argv.includes('--check')) {
		fs.mkdirSync(OUT_DIR, { recursive: true });
		fs.writeFileSync(path.join(OUT_DIR, '01_tables.sql'), renderTables(model));
		fs.writeFileSync(path.join(OUT_DIR, '02_constraints_indexes.sql'), renderConstraints(model));
		console.log(
			`Đã ghi ${path.relative(process.cwd(), OUT_DIR)}/01_tables.sql, 02_constraints_indexes.sql`,
		);
	}
	process.exit(0);
};

if (require.main === module)
	main().catch((err) => {
		console.error('❌', err.message);
		process.exit(1);
	});

module.exports = { buildModel, renderTables, renderConstraints };
