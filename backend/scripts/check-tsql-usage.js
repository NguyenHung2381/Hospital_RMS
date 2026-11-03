#!/usr/bin/env node
// Đếm các cú pháp chỉ SQL Server (T-SQL) mới có trong src/ và scripts/, để theo
// dõi tiến độ chuẩn bị chuyển sang PostgreSQL
// (database/POSTGRESQL_MIGRATION_PLAN.md mục 2.2 và 6).
//   npm run check:tsql              bảng tổng theo từng mẫu
//   npm run check:tsql -- --files   kèm danh sách file của từng mẫu
//   npm run check:tsql -- --update  ghi lại mốc (sau khi đã giảm được)
//
// Test test/contract/tsqlUsageRatchet.test.js so với mốc trong
// scripts/tsql-usage-baseline.json: số chỗ chỉ được GIẢM, không được tăng.
// Code mới nên viết cú pháp chạy được trên cả 2 DB (COALESCE, CONCAT,
// OFFSET ... FETCH...), hoặc cú pháp sẽ được lớp adapter tự đổi.
//
// Đếm bằng regex nên có thể lệch vài chỗ (chuỗi trong comment). Không tính
// tham số @ten và sql.Type: adapter PostgreSQL sẽ tự đổi các phần này.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['src', 'scripts'];
const BASELINE = path.join(__dirname, 'tsql-usage-baseline.json');
// File cố ý chứa mã lỗi / mẫu T-SQL: chính script này và nơi gom mã lỗi DB.
const SKIP = new Set(
	['scripts/check-tsql-usage.js', 'src/utils/dbErrors.js'].map((f) => path.join(ROOT, f)),
);

// Từ khoá dễ trùng chữ thường trong JS (top, convert, throw, merge...) thì so
// đúng chữ HOA; còn lại không phân biệt hoa/thường.
/** @type {Array<{ key: string, re: RegExp, pg: string }>} */
const PATTERNS = [
	{
		key: 'getdate',
		re: /\b(GETDATE|GETUTCDATE|SYSDATETIME|SYSUTCDATETIME)\s*\(/gi,
		pg: 'LOCALTIMESTAMP / now()',
	},
	{ key: 'n_prefix', re: /(?<![\w'])N'/g, pg: "'...' (bỏ N)" },
	{ key: 'isnull', re: /\bISNULL\s*\(/gi, pg: 'COALESCE (chạy cả 2 DB)' },
	{ key: 'set_actor', re: /\bsp_set_actor\b/gi, pg: 'withActor() / set_config' },
	{
		key: 'exec_proc',
		re: /\bEXEC(UTE)?\s+(dbo\.)?sp_\w+|\.execute\(\s*['"`]/gi,
		pg: 'hàm JS / PL/pgSQL',
	},
	{ key: 'declare', re: /\bDECLARE\s+@/gi, pg: 'tách lời gọi JS / CTE' },
	{ key: 'recordsets', re: /\brecordsets\b/g, pg: 'mỗi câu 1 kết quả' },
	{ key: 'top', re: /\bTOP\s*\(?\s*(\d+|@\w+|\$\{)/g, pg: 'LIMIT n' },
	{ key: 'newid', re: /\bNEWID\s*\(/gi, pg: 'gen_random_uuid()' },
	{ key: 'openjson', re: /\bOPENJSON\b/gi, pg: '= ANY($1)' },
	{ key: 'json_fn', re: /\b(JSON_VALUE|JSON_QUERY|JSON_MODIFY|ISJSON)\s*\(/gi, pg: '->> / jsonb' },
	{ key: 'for_json', re: /\bFOR\s+JSON\b/gi, pg: 'json_agg' },
	{
		key: 'date_fn',
		re: /\b(DATEADD|DATEDIFF|DATEDIFF_BIG|DATEPART|DATENAME|DATEFROMPARTS|EOMONTH)\s*\(/gi,
		pg: 'interval / date_part',
	},
	{ key: 'within_group', re: /\bWITHIN\s+GROUP\b/gi, pg: 'string_agg(x, sep ORDER BY ...)' },
	{ key: 'apply', re: /\b(CROSS|OUTER)\s+APPLY\b/gi, pg: 'JOIN LATERAL' },
	{ key: 'like_class', re: /\bLIKE\s+'[^'\n]*\[[^'\n]*'/gi, pg: "~ '^...[0-9]$'" },
	{ key: 'output_clause', re: /\bOUTPUT\s+(INSERTED|DELETED)\b/gi, pg: 'RETURNING' },
	{
		key: 'identity_fn',
		re: /\bSCOPE_IDENTITY\s*\(|@@(ROWCOUNT|TRANCOUNT|IDENTITY|ERROR)\b/gi,
		pg: 'RETURNING / rowCount',
	},
	{
		key: 'cast_tsql_type',
		re: /\bAS\s+(NVARCHAR|NCHAR|NTEXT|BIT|DATETIME2?|SMALLDATETIME|TINYINT|UNIQUEIDENTIFIER)\b/gi,
		pg: '::text / ::boolean / ::timestamp',
	},
	{ key: 'convert', re: /\b(CONVERT|TRY_CAST|TRY_CONVERT|TRY_PARSE)\s*\(/g, pg: 'CAST / to_char' },
	{
		key: 'string_fn',
		re: /\b(LEN|CHARINDEX|PATINDEX|STUFF|IIF)\s*\(/g,
		pg: 'length / strpos / CASE',
	},
	{ key: 'merge', re: /\bMERGE\s+(INTO\s+)?[\w[]/g, pg: 'INSERT ... ON CONFLICT' },
	{
		key: 'lock_hint',
		re: /\b(UPDLOCK|HOLDLOCK|ROWLOCK|READPAST|NOLOCK|TABLOCKX?)\b/gi,
		pg: 'FOR UPDATE',
	},
	{ key: 'applock', re: /\bsp_(get|release)applock\b/gi, pg: 'pg_advisory_xact_lock' },
	{
		key: 'temp_table',
		re: /\b(INTO|FROM|JOIN|TABLE|UPDATE)\s+#\w+|\bDECLARE\s+@\w+\s+TABLE\b/gi,
		pg: 'TEMP TABLE / CTE',
	},
	{ key: 'throw', re: /\bTHROW\s+\$?\{?\w*\d|\bRAISERROR\b/g, pg: 'RAISE EXCEPTION' },
	{
		key: 'err_number',
		re: /\b(err|error|e)\??\.(number|originalError)\b/g,
		pg: 'utils/dbErrors.js',
	},
];

const walk = (/** @type {string} */ dir) =>
	fs.readdirSync(dir, { withFileTypes: true }).flatMap((/** @type {fs.Dirent} */ d) => {
		const p = path.join(dir, d.name);
		if (d.isDirectory()) return d.name === 'node_modules' ? [] : walk(p);
		return d.name.endsWith('.js') ? [p] : [];
	});

const rel = (/** @type {string} */ p) => path.relative(ROOT, p).split(path.sep).join('/');

/**
 * Đếm mọi mẫu trong src/ và scripts/.
 * @returns {Record<string, { total: number, files: Record<string, number> }>}
 */
const countUsage = () => {
	/** @type {Record<string, { total: number, files: Record<string, number> }>} */
	const result = {};
	for (const p of PATTERNS) result[p.key] = { total: 0, files: {} };
	const files = DIRS.flatMap((d) => walk(path.join(ROOT, d))).filter((f) => !SKIP.has(f));
	for (const f of files) {
		const text = fs.readFileSync(f, 'utf8');
		for (const p of PATTERNS) {
			const n = (text.match(p.re) || []).length;
			if (!n) continue;
			result[p.key].total += n;
			result[p.key].files[rel(f)] = n;
		}
	}
	return result;
};

/** Mốc đã ghi: { [key]: số chỗ tối đa }. */
const readBaseline = () =>
	/** @type {Record<string, number>} */ (JSON.parse(fs.readFileSync(BASELINE, 'utf8')));

const writeBaseline = (/** @type {ReturnType<typeof countUsage>} */ usage) => {
	/** @type {Record<string, number>} */
	const out = {};
	for (const p of PATTERNS) out[p.key] = usage[p.key].total;
	fs.writeFileSync(BASELINE, `${JSON.stringify(out, null, '\t')}\n`);
};

if (require.main === module) {
	const args = new Set(process.argv.slice(2));
	const usage = countUsage();
	let baseline = {};
	try {
		baseline = readBaseline();
	} catch {
		// chưa có mốc
	}
	const rows = PATTERNS.map((p) => ({
		Mẫu: p.key,
		'Số chỗ': usage[p.key].total,
		Mốc: /** @type {Record<string, number>} */ (baseline)[p.key] ?? '-',
		'Số file': Object.keys(usage[p.key].files).length,
		'Thay bằng (PG)': p.pg,
	}));
	console.table(rows);
	const total = PATTERNS.reduce((s, p) => s + usage[p.key].total, 0);
	console.log(`Tổng: ${total} chỗ cần sửa trước khi chạy được trên PostgreSQL.`);

	if (args.has('--files')) {
		for (const p of PATTERNS) {
			const entries = Object.entries(usage[p.key].files).sort((a, b) => b[1] - a[1]);
			if (!entries.length) continue;
			console.log(`\n${p.key} (${usage[p.key].total}):`);
			for (const [f, n] of entries) console.log(`  ${String(n).padStart(4)}  ${f}`);
		}
	}
	if (args.has('--update')) {
		writeBaseline(usage);
		console.log(`\nĐã ghi mốc mới vào ${rel(BASELINE)}.`);
	}
}

module.exports = { PATTERNS, countUsage, readBaseline };
