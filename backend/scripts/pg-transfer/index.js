#!/usr/bin/env node
// Chuyển dữ liệu SQL Server → PostgreSQL (POSTGRESQL_MIGRATION_PLAN.md mục 6.5).
//   npm run pg:transfer precheck   kiểm tra dữ liệu nguồn, không ghi gì
//   npm run pg:transfer load       DB PG rỗng → schema + dữ liệu + ràng buộc + trigger
//   npm run pg:transfer verify     so số dòng, checksum từng bảng, sequence, ràng buộc
// Nguồn: biến DB_* (.env) trỏ tới SQL Server. Đích: PG_TARGET_* (xem connect.js).
// Mã thoát 1 khi có lỗi chặn / chênh lệch — dùng được trong script cutover.
const { openSource, describeTarget } = require('./connect');

const COMMANDS = {
	precheck: () => require('./precheck'),
	load: () => require('./load'),
	verify: () => require('./verify'),
};
const log = (m) => console.log(m);

const main = async () => {
	const command = process.argv[2];
	if (!COMMANDS[command]) {
		log('Cách dùng: npm run pg:transfer <precheck | load | verify>');
		return 1;
	}
	log(
		`pg:transfer ${command} — nguồn SQL Server ${process.env.DB_SERVER}/${process.env.DB_DATABASE}` +
			(command === 'precheck' ? '' : `, đích PostgreSQL ${describeTarget()}`),
	);
	const pool = await openSource();
	try {
		const result = await COMMANDS[command]().run(pool, log);
		if (command === 'precheck') {
			for (const w of result.warnings) log(`⚠️  ${w}`);
			for (const b of result.blockers) log(`❌ ${b}`);
			log(
				result.blockers.length
					? `${result.blockers.length} lỗi phải sửa trước khi load`
					: '✅ Không có lỗi chặn',
			);
			return result.blockers.length ? 1 : 0;
		}
		if (command === 'verify') {
			for (const p of result.problems) log(`❌ ${p}`);
			log(result.problems.length ? `${result.problems.length} chênh lệch` : '✅ Khớp hoàn toàn');
			return result.problems.length ? 1 : 0;
		}
		return 0;
	} finally {
		await pool.close();
	}
};

main()
	.then((code) => process.exit(code))
	.catch((err) => {
		log(`❌ ${err.message}`);
		process.exit(1);
	});
