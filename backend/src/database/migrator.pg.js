// Driver PostgreSQL của bộ chạy migration (src/database/migrator.js), cùng các hàm với
// migrator.mssql.js. Mỗi file chạy trong 1 transaction cùng bản ghi schema_migrations
// (hỏng giữa chừng thì không để lại gì; PG cho DDL trong transaction), khoá
// pg_advisory_lock, backup = pg_dump.
const fs = require('fs');
const path = require('path');
const { dbConfig } = require('../config/db');

const TABLE = 'schema_migrations';
const LOCK = 'rms:schema_migrations';
const BASELINE_DIR = path.resolve(__dirname, '../../database/pg/baseline');
const BASELINE_FILES = [
	'00_extensions.sql',
	'01_tables.sql',
	'02_constraints_indexes.sql',
	'03_toi_uu.sql',
	'04_trigger.sql',
];

// File PG có dòng này thì chạy ngoài transaction (vd CREATE INDEX CONCURRENTLY).
const NO_TRANSACTION = /^--[ \t]*@no-transaction[ \t]*$/m;

// Mẫu cho `npm run migrate new` (database/pg/migrations/)
const template = (name) => `/* ============================================================================
 * ${name.replace(/\.sql$/, '')}  (PostgreSQL — bản SQL Server cùng tên ở database/migrations/)
 * ----------------------------------------------------------------------------
 *   <Mô tả thay đổi: bảng / cột nào, để làm gì, ai dùng>
 * Chạy trong 1 transaction (thêm dòng "-- @no-transaction" nếu cần CREATE
 * INDEX CONCURRENTLY). Idempotent: IF NOT EXISTS / CREATE OR REPLACE.
 * ==========================================================================*/

-- ALTER TABLE <bảng> ADD COLUMN IF NOT EXISTS <cột> varchar(255);
`;

const inTransaction = async (conn, text, fn) => {
	if (NO_TRANSACTION.test(text)) return fn();
	await conn.query('BEGIN');
	try {
		const r = await fn();
		await conn.query('COMMIT');
		return r;
	} catch (err) {
		await conn.query('ROLLBACK').catch(() => {});
		throw err;
	}
};

const run = async (conn, label, text) => {
	try {
		await conn.query(text); // không tham số → chạy được nhiều câu lệnh 1 lần
	} catch (err) {
		err.message = `${label}: ${err.message}`;
		throw err;
	}
};

module.exports = {
	TABLE,
	BASELINE_DIR,
	BASELINE_FILES,
	template,
	open: async () => {
		const { Client } = require('pg');
		// Kết nối riêng, không giới hạn thời gian câu lệnh (migration / tạo index lâu)
		const { statement_timeout: _t, max: _m, idleTimeoutMillis: _i, ...cfg } = dbConfig;
		const client = new Client({ ...cfg, application_name: 'hospital-rms-migrate' });
		await client.connect();
		return client;
	},
	close: (conn) => conn.end(),
	hasTable: async (conn) => (await conn.query(`SELECT to_regclass('public.${TABLE}') AS t`)).rows[0].t != null,
	hasChecksum: async () => true,
	rows: async (conn) => (await conn.query(`SELECT filename, checksum, applied_at FROM ${TABLE}`)).rows,
	record: (conn, filename, sum) =>
		conn.query(`INSERT INTO ${TABLE} (filename, checksum, git_sha) VALUES ($1, $2, $3)`, [
			filename,
			sum,
			process.env.GIT_SHA || null,
		]),
	forget: (conn, names) => conn.query(`DELETE FROM ${TABLE} WHERE filename = ANY($1)`, [names]),
	ensureTable: (conn) =>
		conn.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (
      filename   varchar(200) PRIMARY KEY,
      applied_at timestamp(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
      git_sha    varchar(40),
      checksum   char(64)
    )`),
	rename: (conn, from, to) =>
		conn.query(
			`UPDATE ${TABLE} SET filename = $2 WHERE filename = $1
       AND NOT EXISTS (SELECT 1 FROM ${TABLE} WHERE filename = $2)`,
			[from, to],
		),
	dropMerged: (conn, from, to) =>
		conn.query(
			`DELETE FROM ${TABLE} WHERE filename = $1 AND EXISTS (SELECT 1 FROM ${TABLE} WHERE filename = $2)`,
			[from, to],
		),
	blankChecksums: async (conn) => (await conn.query(`SELECT filename FROM ${TABLE} WHERE checksum IS NULL`)).rows,
	setChecksum: (conn, filename, sum) =>
		conn.query(`UPDATE ${TABLE} SET checksum = $2 WHERE filename = $1`, [filename, sum]),
	// Khoá theo phiên, tự nhả khi đóng kết nối. Chờ tối đa 10 phút như khoá bên SQL Server.
	lock: async (conn) => {
		await conn.query("SET lock_timeout = '600s'");
		await conn.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK]);
		await conn.query('RESET lock_timeout');
	},
	// pg_dump chạy ở máy ứng dụng (không cần thư mục trên máy DB như BACKUP DATABASE)
	backup: async (_conn, backupDir, log) => {
		const { execFile } = require('child_process');
		const file = path.join(backupDir, `${dbConfig.database}_premigrate_${Date.now()}.dump`);
		log(`Backup (pg_dump) → ${file}`);
		// Mật khẩu dạng hàm = đọc từ pgpass → pg_dump tự đọc file đó
		const pw = typeof dbConfig.password === 'string' ? dbConfig.password : '';
		const env = { ...process.env, ...(pw ? { PGPASSWORD: pw } : {}) };
		const args = [
			'-Fc',
			'-h',
			dbConfig.host,
			'-p',
			String(dbConfig.port),
			'-U',
			dbConfig.user,
			'-f',
			file,
			dbConfig.database,
		];
		await new Promise((resolve, reject) =>
			execFile('pg_dump', args, { env }, (err, _out, stderr) =>
				err ? reject(new Error(`pg_dump lỗi: ${stderr || err.message}`)) : resolve(undefined),
			),
		);
	},
	inTransaction,
	run,
	// DB chưa có bảng ứng dụng nào (chỉ có thể có schema_migrations)
	isEmpty: async (conn) =>
		(
			await conn.query(
				`SELECT count(*)::int AS n FROM pg_class
         WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p') AND relname <> $1`,
				[TABLE],
			)
		).rows[0].n === 0,
	// `migrate init` trên DB PG trống: tạo schema từ database/pg/baseline/ (00 → 04)
	applyBaseline: async (conn, log) => {
		for (const f of BASELINE_FILES) {
			log(`→ baseline ${f}`);
			const text = fs.readFileSync(path.join(BASELINE_DIR, f), 'utf8');
			await inTransaction(conn, text, () => run(conn, f, text));
		}
	},
};
