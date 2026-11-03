// Danh mục bảng/cột 2 phía và kế hoạch chép từng bảng (cột nào, theo thứ tự nào).
const rules = require('../pg/schemaRules');
const { kindOf, sourceExpr, bracket } = require('./columns');

/** Bảng/cột/khoá chính ở SQL Server (chỉ đọc). */
const readSource = async (pool) => {
	const cols = (
		await pool.request().query(`
			SELECT t.name AS table_name, c.name, ty.name AS type, c.scale, c.is_computed, c.column_id
			FROM sys.tables t
			JOIN sys.columns c ON c.object_id = t.object_id
			JOIN sys.types ty ON ty.user_type_id = c.user_type_id
			WHERE t.is_ms_shipped = 0
			ORDER BY t.name, c.column_id`)
	).recordset;
	const pks = (
		await pool.request().query(`
			SELECT t.name AS table_name, c.name
			FROM sys.indexes i
			JOIN sys.tables t ON t.object_id = i.object_id
			JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
			JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
			WHERE i.is_primary_key = 1
			ORDER BY t.name, ic.key_ordinal`)
	).recordset;
	const tables = new Map();
	for (const c of cols) {
		const key = c.table_name.toLowerCase();
		if (!tables.has(key)) tables.set(key, { name: c.table_name, columns: [], pk: [] });
		tables.get(key).columns.push(c);
	}
	for (const p of pks) tables.get(p.table_name.toLowerCase())?.pk.push(p.name);
	return tables;
};

/** Bảng (không tính partition con) và cột ở PG. */
const readTarget = async (client) => {
	const { rows } = await client.query(`
		SELECT c.table_name, c.column_name, c.data_type, c.is_generated, c.ordinal_position
		FROM information_schema.columns c
		JOIN pg_class t ON t.relname = c.table_name AND t.relnamespace = 'public'::regnamespace
		WHERE c.table_schema = 'public' AND t.relkind IN ('r', 'p') AND NOT t.relispartition
		ORDER BY c.table_name, c.ordinal_position`);
	const tables = new Map();
	for (const r of rows) {
		if (!tables.has(r.table_name)) tables.set(r.table_name, []);
		tables.get(r.table_name).push(r);
	}
	return tables;
};

/**
 * Ghép 2 phía → [{ table, source, pk, columns: [{ name, src, pgType, kind, generated }] }].
 * Lệch cấu trúc (thiếu bảng/cột) thì trả `problems` — schema baseline cũ so
 * với DB nguồn: chạy lại `npm run pg:baseline`.
 */
const buildPlan = (source, target) => {
	const problems = [];
	const plan = [];
	for (const [key, src] of source) {
		if (rules.SKIP_TABLES.has(key)) continue;
		const tgt = target.get(key);
		if (!tgt) {
			problems.push(`PG thiếu bảng ${key}`);
			continue;
		}
		const tgtByName = new Map(tgt.map((c) => [c.column_name, c]));
		const columns = [];
		for (const c of src.columns) {
			const t = tgtByName.get(c.name.toLowerCase());
			if (!t) {
				if (!c.is_computed) problems.push(`PG thiếu cột ${key}.${c.name}`);
				continue;
			}
			columns.push({
				name: t.column_name,
				src: c,
				pgType: t.data_type,
				kind: kindOf(c, t.data_type),
				generated: t.is_generated !== 'NEVER',
			});
		}
		const srcNames = new Set(src.columns.map((c) => c.name.toLowerCase()));
		for (const t of tgt)
			if (!srcNames.has(t.column_name)) problems.push(`Nguồn thiếu cột ${key}.${t.column_name}`);
		plan.push({ table: key, source: src.name, pk: src.pk.map((p) => p.toLowerCase()), columns });
	}
	for (const key of target.keys()) {
		if (!source.has(key) && key !== 'schema_migrations') problems.push(`Nguồn thiếu bảng ${key}`);
	}
	return { plan, problems };
};

/** Câu SELECT ở SQL Server cho các cột `cols` của 1 bảng. */
const sourceSelect = (entry, cols) =>
	`SELECT ${cols.map((c) => sourceExpr(c.src)).join(', ')} FROM ${bracket(entry.source)}`;

module.exports = { readSource, readTarget, buildPlan, sourceSelect };
