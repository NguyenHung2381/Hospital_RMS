// Driver SQL Server của bộ chạy migration (src/database/migrator.js). T-SQL có chủ đích
// (sp_getapplock, BACKUP DATABASE, OBJECT_ID…): chỉ nạp khi DB_CLIENT=mssql, xoá cùng
// src/config/db.mssql.js sau cutover. Bản PostgreSQL: migrator.pg.js (cùng các hàm).
const { sql, dbConfig } = require('../config/db');

const TABLE = 'dbo.schema_migrations';
const LOCK = 'rms:schema_migrations';

// Batch tách theo dòng GO (như sqlcmd). Mọi batch chạy trên CÙNG 1 kết nối:
// USE / SET của batch trước còn hiệu lực cho batch sau. File ghi cứng
// USE [RMS_HOSPITAL] được đổi sang DB đang cấu hình (staging…).
const splitBatches = (text, database) =>
	text
		.replace(/^\s*USE\s+\[?RMS_HOSPITAL\]?\s*;?\s*$/gim, `USE [${database}];`)
		.split(/^\s*GO\s*;?\s*$/im)
		.filter((b) => b.trim());

const scalar = async (conn, query) => Object.values((await conn.request().query(query)).recordset[0] ?? {})[0];

// Mẫu cho `npm run migrate new` (database/migrations/)
const template = (name) => `/* ============================================================================
 * ${name.replace(/\.sql$/, '')}
 * ----------------------------------------------------------------------------
 *   <Mô tả thay đổi: bảng / cột nào, để làm gì, ai dùng>
 * Idempotent — mỗi bước tự kiểm tra (OBJECT_ID / COL_LENGTH / sys.indexes)
 * nên chạy lại nhiều lần an toàn. Chỉ THÊM (bảng/cột/index); xóa hay đổi tên
 * thì để bản phát hành sau, khi code cũ không còn dùng.
 * ==========================================================================*/

-- Bảng mới: luôn có created_at, created_by, updated_at DATETIME2 NULL, updated_by VARCHAR(20) NULL
-- IF COL_LENGTH(N'dbo.<bảng>', N'<cột>') IS NULL
--     ALTER TABLE [dbo].[<bảng>] ADD [<cột>] NVARCHAR(255) NULL;
-- GO
`;

module.exports = {
	TABLE,
	splitBatches,
	template,
	// 1 kết nối riêng, không timeout: migration lớn chạy lâu hơn requestTimeout của app.
	open: () => new sql.ConnectionPool({ ...dbConfig, requestTimeout: 0, pool: { max: 1, min: 0 } }).connect(),
	close: (conn) => conn.close(),
	hasTable: async (conn) => (await scalar(conn, `SELECT OBJECT_ID('${TABLE}', 'U')`)) != null,
	hasChecksum: async (conn) => (await scalar(conn, `SELECT COL_LENGTH('${TABLE}', 'checksum')`)) != null,
	rows: async (conn, withChecksum) =>
		(await conn.request().query(`SELECT filename${withChecksum ? ', checksum' : ''}, applied_at FROM ${TABLE}`))
			.recordset,
	record: (conn, filename, sum) =>
		conn
			.request()
			.input('f', filename)
			.input('c', sum)
			.input('sha', process.env.GIT_SHA || null)
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
		const lock = await scalar(
			conn,
			`
      DECLARE @r INT;
      EXEC @r = sp_getapplock @Resource = '${LOCK}', @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 600000;
      SELECT @r`,
		);
		if (lock < 0) throw new Error(`Không lấy được khóa ${LOCK} (mã ${lock})`);
	},
	backup: async (conn, backupDir, log) => {
		const dir = backupDir.replace(/[\\/]+$/, '');
		const file = `${dir}${dir.includes('\\') ? '\\' : '/'}${dbConfig.database}_premigrate_${Date.now()}.bak`;
		log(`Backup → ${file}`);
		await conn
			.request()
			.input('file', file)
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
