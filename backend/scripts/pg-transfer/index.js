#!/usr/bin/env node
// Chuyển dữ liệu SQL Server → PostgreSQL (POSTGRESQL_MIGRATION_PLAN.md mục 6.5).
//   npm run pg:transfer restore <file.bak> [--replace]
//                                  nạp file backup vào SQL Server nguồn (tạm)
//   npm run pg:transfer precheck   kiểm tra dữ liệu nguồn, không ghi gì
//   npm run pg:transfer load       DB PG rỗng → schema + dữ liệu + ràng buộc + trigger
//   npm run pg:transfer verify     so số dòng, checksum từng bảng, sequence, ràng buộc
// Cả quy trình từ 1 file .bak trên máy Ubuntu: scripts/pg-transfer/transfer-from-bak.sh.
// Nguồn: MSSQL_SOURCE_*. Đích: PG_TARGET_* (xem connect.js).
// Mã thoát 1 khi có lỗi chặn / chênh lệch — dùng được trong script cutover.
const { openSource, describeSource, describeTarget } = require('./connect');
const { sourceVersionProblem } = require('./sourceVersion');

const COMMANDS = {
	precheck: () => require('./precheck'),
	load: () => require('./load'),
	verify: () => require('./verify'),
};
const USAGE =
	'Cách dùng: npm run pg:transfer <restore <file.bak> [--replace] | precheck | load | verify>';
const log = (m) => console.log(m);

const main = async () => {
	const [command, ...rest] = process.argv.slice(2);
	if (command === 'restore') {
		log(`pg:transfer restore — SQL Server ${describeSource()}`);
		const file = rest.find((a) => !a.startsWith('--'));
		await require('./restore').run(file, { replace: rest.includes('--replace') }, log);
		return 0;
	}
	if (!Object.hasOwn(COMMANDS, command ?? '')) {
		log(USAGE);
		return 1;
	}
	log(
		`pg:transfer ${command} — nguồn SQL Server ${describeSource()}` +
			(command === 'precheck' ? '' : `, đích PostgreSQL ${describeTarget()}`),
	);
	const pool = await openSource();
	try {
		// precheck tự báo lỗi này cùng các lỗi khác; load dừng ngay
		if (command === 'load') {
			const problem = await sourceVersionProblem(pool);
			if (problem) throw new Error(problem);
		}
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
