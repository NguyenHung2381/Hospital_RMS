const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sql, dbConfig, client } = require('../config/db');

// Bộ chạy migration DUY NHẤT của backend — dùng chung cho CLI (scripts/migrate.js,
// pipeline deploy) và lúc server khởi động ở môi trường dev (database/index.js).
//
//   database/migrations/*.sql  chạy theo thứ tự tên file, mỗi file 1 lần, ghi
//                              vào bảng dbo.schema_migrations (tên + checksum).
//   Batch tách theo dòng GO (như sqlcmd). Mọi batch chạy trên CÙNG 1 kết nối:
//   USE / SET của batch trước còn hiệu lực cho batch sau.
//   File ghi cứng USE [RMS_HOSPITAL] được đổi sang DB đang cấu hình (staging…).
//   File gộp (nhiều migration cũ nối lại, mỗi phần mở đầu bằng dòng
//   "-- @migration <tên file cũ>.sql"): chỉ chạy phần DB chưa ghi nhận, mỗi
//   phần xong ghi tên file cũ; đủ hết thì ghi tên file gộp, xóa bản ghi phần.
//   DB đã chạy đủ các file cũ = file gộp đã chạy, không chạy lại gì.
//
// Quy ước viết file: database/README.md.

// Theo DB_CLIENT: SQL Server chạy database/migrations/ (T-SQL), PostgreSQL chạy
// database/pg/migrations/ (SQL PG; schema ban đầu ở database/pg/baseline/).
// MIGRATIONS_DIR ghi đè được (test với thư mục tạm).
const MIGRATIONS_DIR =
	process.env.MIGRATIONS_DIR ||
	path.resolve(__dirname, client === 'pg' ? '../../database/pg/migrations' : '../../database/migrations');
const TABLE = client === 'pg' ? 'schema_migrations' : 'dbo.schema_migrations';
const BASELINE_DIR = path.resolve(__dirname, '../../database/pg/baseline');
const BASELINE_FILES = [
	'00_extensions.sql',
	'01_tables.sql',
	'02_constraints_indexes.sql',
	'03_toi_uu.sql',
	'04_trigger.sql',
];
const LOCK = 'rms:schema_migrations';

// Tên cũ → tên mới. DB đã ghi tên cũ trong schema_migrations được đổi tên tại
// chỗ, không chạy lại file.
const RENAMED = {
	'20260924_01_permission_scopes.sql': '2026-09-28_00_permission_scopes.sql',
	'20260924_02_token_version_role_codes.sql': '2026-09-28_01_token_version_role_codes.sql',
};

// File đã xóa vì nội dung được gộp vào file khác → file gộp. Bản ghi cũ trong
// schema_migrations không bị coi là "thiếu file"; xóa đi khi file gộp đã chạy.
// File gộp vẫn chạy bình thường ở DB chưa có nó (phải idempotent).
// (Gộp nhiều file nguyên văn thì dùng dòng "-- @migration", không cần thêm vào đây.)
const MERGED = {
	'2026-11-12_training_program_min_capacity.sql': '2026-11-12_dtlt_programs_lessons.sql',
	'2026-11-13_dtlt_programs_lessons_data.sql': '2026-11-12_dtlt_programs_lessons.sql',
	'2026-11-13_dtlt_programs_department_codes.sql': '2026-11-13_training_program_catalog.sql',
	'2026-11-14_program_trainee_types.sql': '2026-11-13_training_program_catalog.sql',
};

const listFiles = () =>
	fs
		.readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith('.sql'))
		.sort();

const readFile = (name) => fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8').replace(/\r\n?/g, '\n');

// Bỏ khác biệt xuống dòng / khoảng trắng cuối — checkout CRLF trên Windows
// không bị coi là "file đã sửa".
const checksum = (text) =>
	crypto.createHash('sha256').update(text.replace(/[ \t]+$/gm, '').trim()).digest('hex');

const splitBatches = (text, database) =>
	text
		.replace(/^\s*USE\s+\[?RMS_HOSPITAL\]?\s*;?\s*$/gim, `USE [${database}];`)
		.split(/^\s*GO\s*;?\s*$/im)
		.filter((b) => b.trim());

// Các phần của file gộp: [{ name: tên file cũ, text }]; file thường → [].
// Phần trước dòng @migration đầu tiên chỉ là chú thích, không chạy.
const SECTION_MARK = /^--[ \t]*@migration[ \t]+(\S+\.sql)[ \t]*$/gm;
const parseSections = (text) => {
	const marks = [...text.matchAll(SECTION_MARK)];
	return marks.map((m, i) => ({
		name: m[1],
		text: text.slice(m.index + m[0].length, marks[i + 1]?.index ?? text.length),
	}));
};

// Bản ghi thừa khi file gộp đã ghi nhận: từng phần + bản ghi MERGED trỏ vào phần đó.
const coveredNames = (parts) => [
	...parts,
	...Object.entries(MERGED)
		.filter(([, to]) => parts.includes(to))
		.map(([from]) => from),
];

/**
 * Trạng thái thuần (không cần DB) từ danh sách file + bản ghi schema_migrations.
 *   recorded — bản ghi trong bảng (đã quy đổi RENAMED, bỏ MERGED), gồm cả tên phần.
 *   applied  — file coi là đã chạy: có bản ghi, hoặc file gộp có đủ bản ghi mọi phần.
 *   sections — file gộp → tên các phần.
 *   squashed — file gộp đã chạy đủ phần nhưng chưa ghi tên file gộp.
 */
const computeStatus = (files, rows, read = readFile) => {
	const recorded = new Map(
		rows.filter((r) => !MERGED[r.filename]).map((r) => [RENAMED[r.filename] ?? r.filename, r]),
	);
	const texts = new Map(files.map((f) => [f, read(f)]));
	const sections = new Map();
	for (const f of files) {
		const parts = parseSections(texts.get(f)).map((s) => s.name);
		if (parts.length) sections.set(f, parts);
	}

	const applied = new Map();
	const squashed = [];
	for (const f of files) {
		const parts = sections.get(f);
		if (recorded.has(f)) applied.set(f, recorded.get(f));
		else if (parts?.every((p) => recorded.has(p))) {
			const last = parts.map((p) => recorded.get(p).applied_at).filter(Boolean).sort((a, b) => a - b).pop();
			applied.set(f, { filename: f, applied_at: last });
			squashed.push(f);
		}
	}

	const sectionNames = new Set([...sections.values()].flat());
	const pending = files.filter((f) => !applied.has(f));
	const changed = files.filter((f) => applied.get(f)?.checksum && applied.get(f).checksum !== checksum(texts.get(f)));
	const missing = [...recorded.keys()].filter((f) => !texts.has(f) && !sectionNames.has(f)).sort();
	const lastApplied = files.filter((f) => applied.has(f)).pop() ?? '';
	const outOfOrder = pending.filter((f) => f < lastApplied);
	return { files, recorded, applied, sections, squashed, pending, changed, missing, outOfOrder };
};

// ── Phần chạm DB: 1 "driver" cho mỗi loại DB, cùng các hàm ─────────────────
// SQL Server: logic cũ giữ nguyên. PostgreSQL: mỗi file chạy trong 1
// transaction cùng bản ghi schema_migrations (hỏng giữa chừng thì không để lại
// gì; PG cho DDL trong transaction), khoá pg_advisory_lock, backup = pg_dump.

const scalar = async (conn, query) => Object.values((await conn.request().query(query)).recordset[0] ?? {})[0];

const mssqlDriver = {
	// 1 kết nối riêng, không timeout: migration lớn chạy lâu hơn requestTimeout của app.
	open: () => new sql.ConnectionPool({ ...dbConfig, requestTimeout: 0, pool: { max: 1, min: 0 } }).connect(),
	close: (conn) => conn.close(),
	hasTable: async (conn) => (await scalar(conn, `SELECT OBJECT_ID('${TABLE}', 'U')`)) != null,
	hasChecksum: async (conn) => (await scalar(conn, `SELECT COL_LENGTH('${TABLE}', 'checksum')`)) != null,
	rows: async (conn, withChecksum) =>
		(await conn.request().query(`SELECT filename${withChecksum ? ', checksum' : ''}, applied_at FROM ${TABLE}`))
			.recordset,
	record: (conn, filename, sum) =>
		conn.request().input('f', filename).input('c', sum).input('sha', process.env.GIT_SHA || null)
			.query(`INSERT INTO ${TABLE} (filename, checksum, git_sha) VALUES (@f, @c, @sha)`),
	forget: async (conn, names) => {
		const req = conn.request();
		names.forEach((n, i) => req.input(`n${i}`, n));
		await req.query(`DELETE FROM ${TABLE} WHERE filename IN (${names.map((_, i) => `@n${i}`).join(', ')})`);
	},
	ensureTable: (conn) =>
		conn.request().query(`
    IF OBJECT_ID('${TABLE}', 'U') IS NULL
      CREATE TABLE ${TABLE} (
        filename   NVARCHAR(200) NOT NULL PRIMARY KEY,
        applied_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        git_sha    VARCHAR(40)   NULL,
        checksum   CHAR(64)      NULL
      );
    ELSE IF COL_LENGTH('${TABLE}', 'checksum') IS NULL
      ALTER TABLE ${TABLE} ADD checksum CHAR(64) NULL;
  `),
	rename: (conn, from, to) =>
		conn.request().input('from', from).input('to', to).query(`
      UPDATE ${TABLE} SET filename = @to
      WHERE filename = @from AND NOT EXISTS (SELECT 1 FROM ${TABLE} WHERE filename = @to)`),
	dropMerged: (conn, from, to) =>
		conn.request().input('from', from).input('to', to).query(`
      DELETE FROM ${TABLE}
      WHERE filename = @from AND EXISTS (SELECT 1 FROM ${TABLE} WHERE filename = @to)`),
	blankChecksums: async (conn) =>
		(await conn.request().query(`SELECT filename FROM ${TABLE} WHERE checksum IS NULL`)).recordset,
	setChecksum: (conn, filename, sum) =>
		conn.request().input('f', filename).input('c', sum).query(`UPDATE ${TABLE} SET checksum = @c WHERE filename = @f`),
	// Nhiều tiến trình cùng khởi động (cluster, nhiều container) → chỉ 1 nơi chạy.
	lock: async (conn) => {
		const lock = await scalar(conn, `
      DECLARE @r INT;
      EXEC @r = sp_getapplock @Resource = '${LOCK}', @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 600000;
      SELECT @r`);
		if (lock < 0) throw new Error(`Không lấy được khóa ${LOCK} (mã ${lock})`);
	},
	backup: async (conn, backupDir, log) => {
		const dir = backupDir.replace(/[\\/]+$/, '');
		const file = `${dir}${dir.includes('\\') ? '\\' : '/'}${dbConfig.database}_premigrate_${Date.now()}.bak`;
		log(`Backup → ${file}`);
		await conn.request().input('file', file)
			.query(`BACKUP DATABASE [${dbConfig.database}] TO DISK = @file WITH COPY_ONLY, INIT`);
	},
	// Không bọc transaction: giữ hành vi cũ (file T-SQL tự quản lý transaction nếu cần)
	inTransaction: (_conn, _text, fn) => fn(),
	run: async (conn, label, text) => {
		for (const [i, batch] of splitBatches(text, dbConfig.database).entries()) {
			try {
				await conn.request().batch(batch);
			} catch (err) {
				err.message = `${label} (batch ${i + 1}): ${err.message}`;
				throw err;
			}
		}
	},
	isEmpty: async () => false,
	applyBaseline: async () => {},
};

// File PG có dòng này thì chạy ngoài transaction (vd CREATE INDEX CONCURRENTLY).
const NO_TRANSACTION = /^--[ \t]*@no-transaction[ \t]*$/m;

const pgDriver = {
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
	rows: async (conn) =>
		(await conn.query(`SELECT filename, checksum, applied_at FROM ${TABLE}`)).rows,
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
		const args = ['-Fc', '-h', dbConfig.host, '-p', String(dbConfig.port), '-U', dbConfig.user, '-f', file, dbConfig.database];
		await new Promise((resolve, reject) =>
			execFile('pg_dump', args, { env }, (err, _out, stderr) =>
				err ? reject(new Error(`pg_dump lỗi: ${stderr || err.message}`)) : resolve(undefined),
			),
		);
	},
	inTransaction: async (conn, text, fn) => {
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
	},
	run: async (conn, label, text) => {
		try {
			await conn.query(text); // không tham số → chạy được nhiều câu lệnh 1 lần
		} catch (err) {
			err.message = `${label}: ${err.message}`;
			throw err;
		}
	},
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
			await pgDriver.inTransaction(conn, text, () => pgDriver.run(conn, f, text));
		}
	},
};

const driver = client === 'pg' ? pgDriver : mssqlDriver;

const openConnection = () => driver.open();

// Trạng thái từ một kết nối có sẵn (chỉ đọc).
const readStatus = async (conn) => {
	const files = listFiles();
	if (!(await driver.hasTable(conn))) return { ...computeStatus(files, []), tracked: false };
	const rows = await driver.rows(conn, await driver.hasChecksum(conn));
	return { ...computeStatus(files, rows), tracked: true };
};

const status = async () => {
	const conn = await openConnection();
	try {
		return await readStatus(conn);
	} finally {
		await driver.close(conn);
	}
};

const record = (conn, filename, sum) => driver.record(conn, filename, sum);

const forget = async (conn, names) => {
	if (names.length) await driver.forget(conn, names);
};

// Tạo / nâng cấp bảng theo dõi, đổi tên file cũ, điền checksum còn trống
// (bản ghi có từ trước khi có cột checksum = coi như file hiện tại), ghi nhận
// file gộp mà DB đã chạy đủ các phần.
const prepareTable = async (conn, log) => {
	await driver.ensureTable(conn);
	for (const [from, to] of Object.entries(RENAMED)) await driver.rename(conn, from, to);
	for (const [from, to] of Object.entries(MERGED)) await driver.dropMerged(conn, from, to);
	const files = listFiles();
	for (const { filename } of await driver.blankChecksums(conn)) {
		if (!files.includes(filename)) continue;
		await driver.setChecksum(conn, filename, checksum(readFile(filename)));
	}
	const s = await readStatus(conn);
	for (const [f, parts] of s.sections) {
		if (!s.applied.has(f)) continue;
		if (s.squashed.includes(f)) {
			await record(conn, f, checksum(readFile(f)));
			log(`Ghi nhận file gộp ${f} (đã chạy đủ ${parts.length} phần)`);
		}
		await forget(conn, coveredNames(parts));
	}
};

/**
 * Chạy các migration chưa chạy.
 *   dryRun   — chỉ trả trạng thái, không ghi gì.
 *   baseline — DB đã nâng cấp tay: đánh dấu mọi file chưa ghi nhận là đã chạy.
 *   requireTracked — chưa có bảng schema_migrations thì DỪNG (tránh chạy lại
 *              toàn bộ lịch sử trên DB đã nâng cấp tay); false = DB trống, tạo
 *              bảng (PG: DB chưa có bảng nào thì tạo schema từ baseline trước).
 *   backupDir — SQL Server: thư mục TRÊN MÁY SQL Server, BACKUP COPY_ONLY;
 *              PG: thư mục ở máy chạy lệnh, pg_dump -Fc. Chỉ khi có file mới.
 *   log      — hàm in tiến độ.
 * Trả { ...trạng thái trước khi chạy, ran: [file đã chạy / đánh dấu] }.
 */
// eslint-disable-next-line no-console -- mặc định cho CLI (scripts/migrate.js); server truyền logger
const migrate = async ({ dryRun = false, baseline = false, requireTracked = true, backupDir = undefined, log = console.log } = {}) => {
	const conn = await openConnection();
	try {
		const before = await readStatus(conn);
		if (!before.tracked && requireTracked && !baseline) {
			throw Object.assign(
				new Error(`Chưa có bảng ${TABLE} — DB đã nâng cấp tay thì chạy 1 lần: npm run migrate baseline`),
				{ code: 'MIGRATIONS_UNTRACKED' },
			);
		}
		const needBaseline = !requireTracked && !dryRun && (await driver.isEmpty(conn));
		if (dryRun || (!needBaseline && !before.pending.length && !before.squashed.length)) return { ...before, ran: [] };

		await driver.lock(conn);
		if (needBaseline && (await driver.isEmpty(conn))) await driver.applyBaseline(conn, log);

		await prepareTable(conn, log);
		const { pending, recorded } = await readStatus(conn); // nơi khác có thể vừa chạy xong trong lúc chờ khóa

		if (baseline) {
			for (const f of pending) await record(conn, f, checksum(readFile(f)));
			return { ...before, pending, ran: pending };
		}
		if (pending.length && backupDir) await driver.backup(conn, backupDir, log);

		const ran = [];
		for (const f of pending) {
			const text = readFile(f);
			const parts = parseSections(text);
			log(`→ ${f}`);
			const started = Date.now();
			for (const part of parts.filter((p) => !recorded.has(p.name))) {
				log(`  · ${part.name}`);
				await driver.inTransaction(conn, part.text, async () => {
					await driver.run(conn, `${f} › ${part.name}`, part.text);
					await record(conn, part.name, checksum(part.text)); // hỏng giữa chừng → lần sau chạy tiếp từ phần này
				});
			}
			await driver.inTransaction(conn, parts.length ? '' : text, async () => {
				if (!parts.length) await driver.run(conn, f, text);
				await record(conn, f, checksum(text));
				await forget(conn, coveredNames(parts.map((p) => p.name)));
			});
			ran.push(f);
			log(`  ✓ ${Date.now() - started}ms`);
		}
		return { ...before, pending, ran };
	} finally {
		await driver.close(conn);
	}
};

// Tên file cho migration mới: <ngày>_<mô-tả>.sql. Ngày = hôm nay, hoặc ngày sau
// file mới nhất nếu file đó đã mang ngày ≥ hôm nay — luôn đứng cuối thứ tự.
const nextFilename = (description, today = new Date()) => {
	const slug = String(description)
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/gi, 'd')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	if (!slug) throw new Error('Thiếu mô tả migration (vd: npm run migrate new seminar_rooms)');
	const iso = (d) => d.toISOString().slice(0, 10);
	const lastDate = listFiles().map((f) => f.slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).pop();
	let date = iso(today);
	if (lastDate && lastDate >= date) {
		const d = new Date(`${lastDate}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() + 1);
		date = iso(d);
	}
	return `${date}_${slug}.sql`;
};

module.exports = {
	client,
	MIGRATIONS_DIR,
	BASELINE_DIR,
	BASELINE_FILES,
	RENAMED,
	MERGED,
	listFiles,
	readFile,
	checksum,
	splitBatches,
	parseSections,
	computeStatus,
	status,
	migrate,
	nextFilename,
};
