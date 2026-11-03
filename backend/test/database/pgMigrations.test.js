// Trong thời gian chuyển DB (chặng 2 → cutover), schema của 2 DB phải đi cùng
// nhau: mỗi migration SQL Server mới (database/migrations/) sau mốc sinh
// baseline PG phải có bản PostgreSQL CÙNG TÊN ở database/pg/migrations/.
// Mốc = file SQL Server mới nhất lúc chạy `npm run pg:baseline` lần cuối —
// sinh lại baseline thì dời mốc.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const BASELINE_CUTOFF = '2026-12-13_toi_uu_index_giai_doan_1.sql';
const DB_DIR = path.resolve(__dirname, '../../database');
const sqlFiles = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

test('migration SQL Server sau mốc baseline đều có bản PG cùng tên', () => {
	const mssql = sqlFiles(path.join(DB_DIR, 'migrations'));
	assert.ok(mssql.includes(BASELINE_CUTOFF), `Không thấy file mốc ${BASELINE_CUTOFF}`);
	const pg = new Set(sqlFiles(path.join(DB_DIR, 'pg/migrations')));
	const missing = mssql.filter((f) => f > BASELINE_CUTOFF && !pg.has(f));
	assert.deepEqual(missing, [], `Thiếu bản PostgreSQL ở database/pg/migrations/: ${missing.join(', ')}`);
});

test('file PG không có tên lạ (mỗi file PG ứng với 1 file SQL Server)', () => {
	const mssql = new Set(sqlFiles(path.join(DB_DIR, 'migrations')));
	const orphan = sqlFiles(path.join(DB_DIR, 'pg/migrations')).filter((f) => !mssql.has(f));
	assert.deepEqual(orphan, [], `File PG không có bản SQL Server: ${orphan.join(', ')}`);
});
