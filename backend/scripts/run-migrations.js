#!/usr/bin/env node
// Chạy các file backend/migrations/*.sql CHƯA chạy, theo thứ tự tên file (như
// `sqlcmd -I`), ghi lại vào bảng schema_migrations. Pipeline deploy gọi script
// này trong image MỚI trước khi đổi container (scripts/deploy.ps1).
//   node scripts/run-migrations.js              # chạy file mới
//   node scripts/run-migrations.js --dry-run    # chỉ liệt kê file sẽ chạy
//   node scripts/run-migrations.js --baseline   # LẦN ĐẦU trên DB đã nâng cấp tay:
//                                               # đánh dấu mọi file hiện có là đã chạy
// MIGRATION_BACKUP_DIR (thư mục TRÊN MÁY SQL Server): có file mới thì
// BACKUP DATABASE ... COPY_ONLY vào đó trước khi chạy — điểm phục hồi khi
// migration hỏng (rollback ứng dụng không hoàn tác được schema).
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { sql, dbConfig } = require('../src/config/db');

const DIR = path.join(__dirname, '../migrations');
const dryRun = process.argv.includes('--dry-run');
const baseline = process.argv.includes('--baseline');

(async () => {
	// 1 kết nối duy nhất: USE / SET trong batch trước còn hiệu lực cho batch sau
	const pool = await new sql.ConnectionPool({ ...dbConfig, requestTimeout: 0, pool: { max: 1, min: 0 } }).connect();
	const db = dbConfig.database;
	// File bắt đầu bằng "_" là script chạy tay (dọn dữ liệu...), không tự chạy
	const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql') && !f.startsWith('_')).sort();

	const hasTable = (await pool.request().query(`SELECT OBJECT_ID(N'dbo.schema_migrations', N'U') AS id`)).recordset[0].id != null;
	if (!hasTable && !baseline) {
		throw new Error('Chưa có bảng schema_migrations — DB đã nâng cấp tay thì chạy 1 lần với --baseline');
	}
	if (!hasTable && !dryRun) {
		await pool.request().query(`CREATE TABLE dbo.schema_migrations (
			filename NVARCHAR(200) NOT NULL PRIMARY KEY,
			applied_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
			git_sha VARCHAR(40) NULL)`);
	}
	const done = new Set(
		hasTable ? (await pool.request().query('SELECT filename FROM dbo.schema_migrations')).recordset.map((r) => r.filename) : [],
	);
	const pending = files.filter((f) => !done.has(f));
	console.log(pending.length ? `Migration chờ chạy:\n  ${pending.join('\n  ')}` : 'Không có migration mới');
	if (dryRun || !pending.length) return pool.close();

	const record = (f) =>
		pool.request().input('f', f).input('sha', process.env.GIT_SHA || null)
			.query('INSERT INTO dbo.schema_migrations (filename, git_sha) VALUES (@f, @sha)');

	if (baseline) {
		for (const f of pending) await record(f);
		console.log(`Đã đánh dấu ${pending.length} file là đã chạy`);
		return pool.close();
	}

	if (process.env.MIGRATION_BACKUP_DIR) {
		const dir = process.env.MIGRATION_BACKUP_DIR.replace(/[\\/]+$/, '');
		const file = `${dir}${dir.includes('\\') ? '\\' : '/'}${db}_premigrate_${Date.now()}.bak`;
		console.log(`Backup → ${file}`);
		await pool.request().input('file', file).query(`BACKUP DATABASE [${db}] TO DISK = @file WITH COPY_ONLY, INIT`);
	}

	for (const f of pending) {
		// File ghi cứng USE [RMS_HOSPITAL] — đổi sang DB đang cấu hình (staging dùng DB khác)
		const text = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/^\s*USE\s+\[RMS_HOSPITAL\]\s*;?\s*$/gim, `USE [${db}];`);
		console.log(`→ ${f}`);
		for (const batch of text.split(/^\s*GO\s*$/im)) {
			if (batch.trim()) await pool.request().batch(batch);
		}
		await record(f);
	}
	console.log(`Đã chạy ${pending.length} migration`);
	await pool.close();
})().catch((err) => {
	console.error(`Migration lỗi: ${err.message}`);
	process.exit(1);
});
