const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sql, dbConfig } = require('../config/db');

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
//   phần xong ghi tên file cũ; đủ hết thì ghi tên file gộp, xoá bản ghi phần.
//   DB đã chạy đủ các file cũ = file gộp đã chạy, không chạy lại gì.
//
// Quy ước viết file: database/README.md.

// MIGRATIONS_DIR ghi đè được (test với thư mục tạm).
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.resolve(__dirname, '../../database/migrations');
const TABLE = 'dbo.schema_migrations';
const LOCK = 'rms:schema_migrations';

// Tên cũ → tên mới. DB đã ghi tên cũ trong schema_migrations được đổi tên tại
// chỗ, không chạy lại file.
const RENAMED = {
	'20260924_01_permission_scopes.sql': '2026-09-28_00_permission_scopes.sql',
	'20260924_02_token_version_role_codes.sql': '2026-09-28_01_token_version_role_codes.sql',
};

// File đã xoá vì nội dung được gộp vào file khác → file gộp. Bản ghi cũ trong
// schema_migrations không bị coi là "thiếu file"; xoá đi khi file gộp đã chạy.
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

// 1 kết nối riêng, không timeout: migration lớn chạy lâu hơn requestTimeout của app.
const openConnection = () =>
	new sql.ConnectionPool({ ...dbConfig, requestTimeout: 0, pool: { max: 1, min: 0 } }).connect();

const scalar = async (conn, query) => Object.values((await conn.request().query(query)).recordset[0] ?? {})[0];

const hasTable = async (conn) => (await scalar(conn, `SELECT OBJECT_ID(N'${TABLE}', N'U')`)) != null;

// Trạng thái từ một kết nối có sẵn (chỉ đọc).
const readStatus = async (conn) => {
	const files = listFiles();
	if (!(await hasTable(conn))) return { ...computeStatus(files, []), tracked: false };

	const hasChecksum = (await scalar(conn, `SELECT COL_LENGTH(N'${TABLE}', N'checksum')`)) != null;
	const rows = (
		await conn.request().query(`SELECT filename${hasChecksum ? ', checksum' : ''}, applied_at FROM ${TABLE}`)
	).recordset;
	return { ...computeStatus(files, rows), tracked: true };
};

const status = async () => {
	const conn = await openConnection();
	try {
		return await readStatus(conn);
	} finally {
		await conn.close();
	}
};

const record = (conn, filename, sum) =>
	conn.request().input('f', filename).input('c', sum).input('sha', process.env.GIT_SHA || null)
		.query(`INSERT INTO ${TABLE} (filename, checksum, git_sha) VALUES (@f, @c, @sha)`);

const forget = async (conn, names) => {
	if (!names.length) return;
	const req = conn.request();
	names.forEach((n, i) => req.input(`n${i}`, n));
	await req.query(`DELETE FROM ${TABLE} WHERE filename IN (${names.map((_, i) => `@n${i}`).join(', ')})`);
};

// Tạo / nâng cấp bảng theo dõi, đổi tên file cũ, điền checksum còn trống
// (bản ghi có từ trước khi có cột checksum = coi như file hiện tại), ghi nhận
// file gộp mà DB đã chạy đủ các phần.
const prepareTable = async (conn, log) => {
	await conn.request().query(`
    IF OBJECT_ID(N'${TABLE}', N'U') IS NULL
      CREATE TABLE ${TABLE} (
        filename   NVARCHAR(200) NOT NULL PRIMARY KEY,
        applied_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        git_sha    VARCHAR(40)   NULL,
        checksum   CHAR(64)      NULL
      );
    ELSE IF COL_LENGTH(N'${TABLE}', N'checksum') IS NULL
      ALTER TABLE ${TABLE} ADD checksum CHAR(64) NULL;
  `);
	for (const [from, to] of Object.entries(RENAMED)) {
		await conn.request().input('from', from).input('to', to).query(`
      UPDATE ${TABLE} SET filename = @to
      WHERE filename = @from AND NOT EXISTS (SELECT 1 FROM ${TABLE} WHERE filename = @to)`);
	}
	for (const [from, to] of Object.entries(MERGED)) {
		await conn.request().input('from', from).input('to', to).query(`
      DELETE FROM ${TABLE}
      WHERE filename = @from AND EXISTS (SELECT 1 FROM ${TABLE} WHERE filename = @to)`);
	}
	const files = listFiles();
	const blank = (await conn.request().query(`SELECT filename FROM ${TABLE} WHERE checksum IS NULL`)).recordset;
	for (const { filename } of blank) {
		if (!files.includes(filename)) continue;
		await conn.request().input('f', filename).input('c', checksum(readFile(filename)))
			.query(`UPDATE ${TABLE} SET checksum = @c WHERE filename = @f`);
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
 *              toàn bộ lịch sử trên DB đã nâng cấp tay); false = DB trống, tạo bảng.
 *   backupDir — thư mục TRÊN MÁY SQL Server: BACKUP COPY_ONLY trước khi chạy.
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
		if (dryRun || (!before.pending.length && !before.squashed.length)) return { ...before, ran: [] };

		// Nhiều tiến trình cùng khởi động (cluster, nhiều container) → chỉ 1 nơi chạy.
		const lock = await scalar(conn, `
      DECLARE @r INT;
      EXEC @r = sp_getapplock @Resource = N'${LOCK}', @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 600000;
      SELECT @r`);
		if (lock < 0) throw new Error(`Không lấy được khoá ${LOCK} (mã ${lock})`);

		await prepareTable(conn, log);
		const { pending, recorded } = await readStatus(conn); // nơi khác có thể vừa chạy xong trong lúc chờ khoá

		if (baseline) {
			for (const f of pending) await record(conn, f, checksum(readFile(f)));
			return { ...before, pending, ran: pending };
		}
		if (pending.length && backupDir) {
			const dir = backupDir.replace(/[\\/]+$/, '');
			const file = `${dir}${dir.includes('\\') ? '\\' : '/'}${dbConfig.database}_premigrate_${Date.now()}.bak`;
			log(`Backup → ${file}`);
			await conn.request().input('file', file)
				.query(`BACKUP DATABASE [${dbConfig.database}] TO DISK = @file WITH COPY_ONLY, INIT`);
		}

		const runBatches = async (label, text) => {
			for (const [i, batch] of splitBatches(text, dbConfig.database).entries()) {
				try {
					await conn.request().batch(batch);
				} catch (err) {
					err.message = `${label} (batch ${i + 1}): ${err.message}`;
					throw err;
				}
			}
		};

		const ran = [];
		for (const f of pending) {
			const text = readFile(f);
			const parts = parseSections(text);
			log(`→ ${f}`);
			const started = Date.now();
			if (!parts.length) await runBatches(f, text);
			for (const part of parts.filter((p) => !recorded.has(p.name))) {
				log(`  · ${part.name}`);
				await runBatches(`${f} › ${part.name}`, part.text);
				await record(conn, part.name, checksum(part.text)); // hỏng giữa chừng → lần sau chạy tiếp từ phần này
			}
			await record(conn, f, checksum(text));
			await forget(conn, coveredNames(parts.map((p) => p.name)));
			ran.push(f);
			log(`  ✓ ${Date.now() - started}ms`);
		}
		return { ...before, pending, ran };
	} finally {
		await conn.close();
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
	MIGRATIONS_DIR,
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
