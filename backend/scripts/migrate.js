#!/usr/bin/env node
// Migration CSDL (database/migrations/*.sql) — xem database/README.md.
// Một lệnh duy nhất, việc chọn bằng lệnh con (xem USAGE). Cờ cũ --dry-run /
// --baseline / --init vẫn nhận (= status / baseline / init).
// MIGRATION_BACKUP_DIR: có file mới thì pg_dump -Fc ra thư mục này (ở máy chạy
// lệnh, cần pg_dump) trước khi chạy — điểm phục hồi khi migration hỏng (rollback
// ứng dụng không hoàn tác được schema). Image Docker không có pg_dump: khi
// deploy, scripts/deploy.sh tự backup trên máy host trước khi gọi lệnh này.
const fs = require('fs');
const path = require('path');
require('../src/config/loadEnv');
const migrator = require('../src/database/migrator');

const USAGE = `Cách dùng: npm run migrate [lệnh]   (hoặc node scripts/migrate.js [lệnh])
  (trống) | up      chạy file mới (pipeline deploy gọi lệnh này)
  status            trạng thái từng file + file chờ chạy, không ghi gì
  new <mô tả>       tạo file migration mới từ mẫu, tên đã đúng quy ước
  baseline          LẦN ĐẦU trên DB đã nâng cấp tay: đánh dấu mọi file hiện có là đã chạy
  init              DB trống: tạo bảng theo dõi rồi chạy hết
  help              in hướng dẫn này`;

const FLAG_COMMANDS = {
	'--dry-run': 'status',
	'--baseline': 'baseline',
	'--init': 'init',
	'--help': 'help',
	'-h': 'help',
};
const args = process.argv.slice(2);
const words = args.filter((a) => !a.startsWith('-'));
const flagCommand = args.map((a) => FLAG_COMMANDS[a]).find(Boolean);
const command = flagCommand ?? words[0] ?? 'up';
const rest = flagCommand ? words : words.slice(1);

const printStatus = (s) => {
	if (!s.tracked)
		console.log('⚠️  Chưa có bảng schema_migrations (DB chưa từng chạy migration qua script)');
	for (const f of s.files) {
		const row = s.applied.get(f);
		const mark = !row ? '·' : s.changed.includes(f) ? '!' : '✓';
		const when = row?.applied_at
			? new Date(row.applied_at).toISOString().slice(0, 16).replace('T', ' ')
			: '';
		const parts = s.sections.get(f);
		const done = parts?.filter((p) => s.recorded.has(p)).length;
		const detail = !parts
			? ''
			: row
				? `gộp ${parts.length} file`
				: `${done}/${parts.length} phần đã chạy`;
		const info = [when, detail].filter(Boolean).join(' · ');
		console.log(`  ${mark} ${f}${info ? `  (${info})` : ''}`);
	}
	console.log(
		`\n${s.files.length} file · ${s.files.length - s.pending.length} đã chạy · ${s.pending.length} chờ chạy`,
	);
	if (s.pending.length) console.log(`Chờ chạy:\n  ${s.pending.join('\n  ')}`);
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

const run = async (options) => {
	const result = await migrator.migrate({
		...options,
		backupDir: process.env.MIGRATION_BACKUP_DIR,
	});
	warn(result);
	if (!result.ran.length) {
		console.log('Không có migration mới');
		return;
	}
	console.log(
		options.baseline
			? `Đã đánh dấu ${result.ran.length} file là đã chạy`
			: `Đã chạy ${result.ran.length} migration`,
	);
};

const COMMANDS = {
	up: () => run({}),
	baseline: () => run({ baseline: true }),
	init: () => run({ requireTracked: false }),
	status: async () => {
		const s = await migrator.status();
		printStatus(s);
		warn(s);
	},
	new: () => {
		const name = migrator.nextFilename(rest.join(' '));
		const file = path.join(migrator.MIGRATIONS_DIR, name);
		fs.writeFileSync(file, migrator.template(name));
		console.log(`Đã tạo ${path.relative(process.cwd(), file)}`);
	},
	help: () => console.log(USAGE),
};

const main = async () => {
	if (!Object.hasOwn(COMMANDS, command)) throw new Error(`Lệnh không hợp lệ: ${command}\n${USAGE}`);
	await COMMANDS[command]();
};

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(`❌ Migration lỗi: ${err.message}`);
		process.exit(1);
	});
