#!/usr/bin/env node
// Migration CSDL (database/migrations/*.sql) — xem database/README.md.
//   npm run migrate                       # chạy file mới (pipeline deploy gọi lệnh này)
//   npm run migrate -- --dry-run          # chỉ liệt kê file sẽ chạy
//   npm run migrate:status                # trạng thái từng file
//   npm run migrate -- --baseline         # LẦN ĐẦU trên DB đã nâng cấp tay:
//                                         # đánh dấu mọi file hiện có là đã chạy
//   npm run migrate -- --init             # DB trống: tạo bảng theo dõi rồi chạy hết
//   npm run migrate:new -- <mô tả>        # tạo file migration mới từ mẫu
// MIGRATION_BACKUP_DIR (thư mục TRÊN MÁY SQL Server): có file mới thì
// BACKUP DATABASE ... COPY_ONLY vào đó trước khi chạy — điểm phục hồi khi
// migration hỏng (rollback ứng dụng không hoàn tác được schema).
const fs = require('fs');
const path = require('path');
require('../src/config/loadEnv');
const migrator = require('../src/database/migrator');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const command = args.find((a) => !a.startsWith('--')) ?? 'up';

const TEMPLATE = (
	name,
) => `/* ============================================================================
 * ${name.replace(/\.sql$/, '')}
 * ----------------------------------------------------------------------------
 *   <Mô tả thay đổi: bảng / cột nào, để làm gì, ai dùng>
 * Idempotent — mỗi bước tự kiểm tra (OBJECT_ID / COL_LENGTH / sys.indexes)
 * nên chạy lại nhiều lần an toàn. Chỉ THÊM (bảng/cột/index); xoá hay đổi tên
 * thì để bản phát hành sau, khi code cũ không còn dùng.
 * ==========================================================================*/

-- Bảng mới: luôn có created_at, created_by, updated_at DATETIME2 NULL, updated_by VARCHAR(20) NULL
-- IF COL_LENGTH(N'dbo.<bảng>', N'<cột>') IS NULL
--     ALTER TABLE [dbo].[<bảng>] ADD [<cột>] NVARCHAR(255) NULL;
-- GO
`;

const printStatus = (s) => {
	if (!s.tracked)
		console.log('⚠️  Chưa có bảng schema_migrations (DB chưa từng chạy migration qua script)');
	for (const f of s.files) {
		const row = s.applied.get(f);
		const mark = !row ? '·' : s.changed.includes(f) ? '!' : '✓';
		const when = row?.applied_at
			? new Date(row.applied_at).toISOString().slice(0, 16).replace('T', ' ')
			: '';
		console.log(`  ${mark} ${f}${when ? `  (${when})` : ''}`);
	}
	console.log(
		`\n${s.files.length} file · ${s.files.length - s.pending.length} đã chạy · ${s.pending.length} chờ chạy`,
	);
};

const warn = (s) => {
	if (s.changed.length)
		console.warn(
			`⚠️  Đã sửa SAU khi chạy (không chạy lại — viết migration mới): ${s.changed.join(', ')}`,
		);
	if (s.missing.length)
		console.warn(`⚠️  Có trong schema_migrations nhưng không còn file: ${s.missing.join(', ')}`);
	if (s.outOfOrder.length)
		console.warn(`⚠️  Chạy lệch thứ tự (đứng trước file đã chạy): ${s.outOfOrder.join(', ')}`);
};

const main = async () => {
	if (command === 'new') {
		const name = migrator.nextFilename(
			args
				.filter((a) => !a.startsWith('--'))
				.slice(1)
				.join(' '),
		);
		const file = path.join(migrator.MIGRATIONS_DIR, name);
		fs.writeFileSync(file, TEMPLATE(name));
		console.log(`Đã tạo ${path.relative(process.cwd(), file)}`);
		return;
	}
	if (command === 'status') {
		const s = await migrator.status();
		printStatus(s);
		warn(s);
		return;
	}
	if (command !== 'up') throw new Error(`Lệnh không hợp lệ: ${command} (up | status | new)`);

	const dryRun = flag('dry-run');
	const baseline = flag('baseline');
	const result = await migrator.migrate({
		dryRun,
		baseline,
		requireTracked: !flag('init'),
		backupDir: process.env.MIGRATION_BACKUP_DIR,
	});
	warn(result);
	if (dryRun || !result.ran.length) {
		console.log(
			result.pending.length
				? `Migration chờ chạy:\n  ${result.pending.join('\n  ')}`
				: 'Không có migration mới',
		);
		return;
	}
	console.log(
		baseline
			? `Đã đánh dấu ${result.ran.length} file là đã chạy`
			: `Đã chạy ${result.ran.length} migration`,
	);
};

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(`❌ Migration lỗi: ${err.message}`);
		process.exit(1);
	});
