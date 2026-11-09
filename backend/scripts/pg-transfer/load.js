// pg:transfer load — dựng DB PG từ DB SQL Server (runbook:
// infra/chuyen-du-lieu-sang-postgresql.md). DB đích phải RỖNG (tạo bằng infra/postgresql/01_tao_db_va_role.sql).
//   00 → 01 (bảng + khoá chính) → COPY từng bảng → 02 (UNIQUE/CHECK/FK, index)
//   → 03 → setval → 04 (trigger, SAU khi nạp để không ghi đè updated_at/by)
//   → bảng schema_migrations → VACUUM ANALYZE.
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const { from: copyFrom } = require('pg-copy-streams');
const rules = require('./schemaRules');
const { copyLine, bracket } = require('./columns');
const { readSource, readTarget, buildPlan, sourceSelect } = require('./catalog');
const { openTarget } = require('./connect');

const BASELINE_DIR = path.resolve(__dirname, '../../database/baseline');
const PARALLEL = Number(process.env.PG_TRANSFER_PARALLEL || 3);

const runFile = async (client, file) => {
	const text = fs.readFileSync(path.join(BASELINE_DIR, file), 'utf8');
	await client.query('BEGIN');
	try {
		await client.query(text);
		await client.query('COMMIT');
	} catch (err) {
		await client.query('ROLLBACK').catch(() => {});
		err.message = `${file}: ${err.message}`;
		throw err;
	}
};

const timed = async (log, label, fn) => {
	const t = Date.now();
	const r = await fn();
	log(`  ✓ ${label} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
	return r;
};

// Partition security_events: 01 tạo sẵn 24 tháng; dữ liệu cũ hơn (job dọn
// chưa chạy) cần thêm partition, không thì rơi vào DEFAULT.
const ensurePartitions = async (pool, client, log) => {
	for (const [table, p] of Object.entries(rules.PARTITIONED_TABLES)) {
		const { recordset } = await pool
			.request()
			.query(`SELECT CONVERT(char(7), MIN(${bracket(p.column)}), 126) AS m FROM ${bracket(table)}`);
		const min = recordset[0].m; // 'YYYY-MM'
		if (!min) continue;
		const now = new Date();
		const [y, m] = min.split('-').map(Number);
		const back = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
		if (back > p.monthsBack) {
			await client.query('SELECT rms_maintain_monthly_partitions($1, $2, $3, NULL)', [
				table,
				back,
				p.monthsAhead,
			]);
			log(`  · ${table}: thêm partition về tới ${min}`);
		}
	}
};

// Chép 1 bảng: stream từ SQL Server → COPY vào PG, không nạp cả bảng vào RAM.
const copyTable = async (pool, entry) => {
	const cols = entry.columns.filter((c) => !c.generated);
	const client = await openTarget();
	try {
		await client.query('SET synchronous_commit = off');
		const request = pool.request();
		const source = request.toReadableStream();
		request.query(sourceSelect(entry, cols));
		let rows = 0;
		const toLine = new Transform({
			writableObjectMode: true,
			transform(row, _enc, cb) {
				rows++;
				try {
					cb(null, copyLine(cols.map((c) => row[c.src.name])));
				} catch (err) {
					cb(err);
				}
			},
		});
		const names = cols.map((c) => `"${c.name}"`).join(', ');
		const sink = client.query(copyFrom(`COPY "${entry.table}" (${names}) FROM STDIN`));
		await pipeline(source, toLine, sink);
		return rows;
	} catch (err) {
		err.message = `Bảng ${entry.table}: ${err.message}`;
		throw err;
	} finally {
		await client.end();
	}
};

// Chạy fn trên từng phần tử, tối đa `n` việc cùng lúc.
const parallel = async (items, n, fn) => {
	const out = [];
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
	return out;
};

// Identity: giá trị kế tiếp = max(IDENT_CURRENT ở SQL Server, MAX(cột)) + 1.
// Sequence: theo last_used_value ở SQL Server.
const syncSequences = async (pool, client) => {
	const { rows: identity } = await client.query(`
		SELECT c.table_name, c.column_name FROM information_schema.columns c
		JOIN pg_class t ON t.relname = c.table_name AND t.relnamespace = 'public'::regnamespace
		WHERE c.table_schema = 'public' AND c.is_identity = 'YES' AND NOT t.relispartition`);
	for (const { table_name: t, column_name: c } of identity) {
		const { recordset } = await pool
			.request()
			.input('t', t)
			.query(`SELECT CAST(IDENT_CURRENT(@t) AS bigint) AS v`);
		const ident = Number(recordset[0].v ?? 0);
		await client.query(
			`SELECT setval(pg_get_serial_sequence($1, $2),
			   GREATEST($3::bigint, (SELECT coalesce(max("${c}"), 0) FROM "${t}"), 1), true)`,
			[t, c, ident],
		);
	}
	const { recordset: seqs } = await pool.request().query(`
		SELECT LOWER(name) AS name, CAST(last_used_value AS bigint) AS last_used, CAST(start_value AS bigint) AS start
		FROM sys.sequences`);
	for (const s of seqs) {
		if (s.last_used != null)
			await client.query('SELECT setval($1, $2::bigint, true)', [s.name, s.last_used]);
		else await client.query('SELECT setval($1, $2::bigint, false)', [s.name, s.start]);
	}
	return { identity: identity.length, sequences: seqs.length };
};

const run = async (pool, log) => {
	const client = await openTarget();
	try {
		// Không tính view/bảng của extension (pg_stat_statements do 01_tao_db_va_role.sql tạo)
		const { rows } = await client.query(`
			SELECT count(*)::int AS n FROM pg_class c
			WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v')
			  AND NOT EXISTS (SELECT 1 FROM pg_depend d
			                  WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')`);
		if (rows[0].n > 0)
			throw new Error(
				'DB đích đã có bảng — load chỉ chạy trên DB rỗng. Xoá và tạo lại DB (infra/postgresql/01_tao_db_va_role.sql).',
			);

		const started = Date.now();
		await timed(log, '00_extensions', () => runFile(client, '00_extensions.sql'));
		await timed(log, '01_tables', () => runFile(client, '01_tables.sql'));

		const { plan, problems } = buildPlan(await readSource(pool), await readTarget(client));
		if (problems.length) throw new Error(`Cấu trúc 2 phía lệch:\n  - ${problems.join('\n  - ')}`);
		await ensurePartitions(pool, client, log);

		// Bảng lớn trước, để các luồng song song xong gần cùng lúc
		const sizes = (
			await pool.request().query(`
				SELECT LOWER(t.name) AS name, SUM(p.rows) AS rows FROM sys.tables t
				JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
				GROUP BY t.name`)
		).recordset;
		const size = new Map(sizes.map((s) => [s.name, Number(s.rows)]));
		const ordered = [...plan].sort((a, b) => (size.get(b.table) ?? 0) - (size.get(a.table) ?? 0));
		const counts = await timed(log, `COPY ${plan.length} bảng (${PARALLEL} luồng)`, () =>
			parallel(ordered, PARALLEL, (e) => copyTable(pool, e)),
		);
		const total = counts.reduce((a, b) => a + b, 0);
		log(`  · ${total} dòng`);

		await timed(log, '02_constraints_indexes (UNIQUE/CHECK/FK + VALIDATE)', () =>
			runFile(client, '02_constraints_indexes.sql'),
		);
		await timed(log, '03_toi_uu', () => runFile(client, '03_toi_uu.sql'));
		const seq = await timed(log, 'setval identity/sequence', () => syncSequences(pool, client));
		log(`  · ${seq.identity} cột identity, ${seq.sequences} sequence`);
		await timed(log, '04_trigger', () => runFile(client, '04_trigger.sql'));
		// Bảng theo dõi migration PG (src/database/migrator.js tạo đúng cấu trúc này)
		await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
			filename varchar(200) PRIMARY KEY,
			applied_at timestamp(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
			git_sha varchar(40),
			checksum char(64))`);
		await timed(log, 'VACUUM (ANALYZE)', () => client.query('VACUUM (ANALYZE)'));
		log(
			`Xong sau ${((Date.now() - started) / 1000).toFixed(1)}s. Tiếp: npm run pg:transfer verify`,
		);
		return { tables: plan.length, rows: total };
	} finally {
		await client.end();
	}
};

module.exports = { run, parallel };
