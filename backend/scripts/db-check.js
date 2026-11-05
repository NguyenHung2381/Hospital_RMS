#!/usr/bin/env node
// Kiểm tra nhanh CSDL theo backend/.env, in 1 dòng JSON (dòng cuối, bắt đầu bằng @@db-check):
//   { ok: true, tracked, empty, pending }       kết nối được
//   { ok: false, code, message }                không kết nối được (code = SQLSTATE / lỗi mạng)
// scripts/setup-dev.js ở thư mục gốc dùng kết quả này để quyết định tạo DB,
// `migrate init` hay `migrate up`. Luôn thoát mã 0 (kết quả nằm trong JSON).
//
//   node scripts/db-check.js
require('../src/config/loadEnv');
const { getPool } = require('../src/config/db');
const migrator = require('../src/database/migrator');

const print = (obj) => console.log(`@@db-check ${JSON.stringify(obj)}`);

const main = async () => {
	let pool;
	try {
		pool = await getPool();
	} catch (err) {
		print({ ok: false, code: err.code || null, message: err.message });
		return;
	}
	try {
		const { recordset } = await pool.request().query(
			`SELECT count(*)::int AS n FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p')
         AND relname <> 'schema_migrations'`,
		);
		const s = await migrator.status();
		print({ ok: true, tracked: s.tracked, empty: recordset[0].n === 0, pending: s.pending.length });
	} catch (err) {
		print({ ok: false, code: err.code || null, message: err.message });
	}
};

main().then(() => process.exit(0));
