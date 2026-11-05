#!/usr/bin/env node
// Nạp danh mục cơ bản (database/seed/catalogs.json) cho DB MỚI:
//   research — loại đề tài, cấp đề tài, loại đợt
//   training — loại hình đào tạo, đối tượng học viên, loại hồ sơ học viên,
//              nhóm + loại tín chỉ CME
//   staff    — chức vụ, chức danh nghề nghiệp, học hàm / học vị
// Chỉ nạp vào bảng đang TRỐNG (bảng đã có dữ liệu thì bỏ qua cả bảng, không trộn
// với dữ liệu đang dùng). Giữ nguyên mã (id) trong file: các service sinh mã mới
// bằng MAX(id) nên thêm dòng sau này vẫn nối tiếp đúng.
// Chạy sau `migrate init`; scripts/setup-dev.js ở thư mục gốc tự gọi.
//
//   npm run seed:catalogs
//   npm run seed:catalogs -- --only=research,staff
require('../src/config/loadEnv');
const { getPool, withActorTransaction } = require('../src/config/db');
const SEED = require('../database/seed/catalogs.json');

const only = process.argv
	.slice(2)
	.find((a) => a.startsWith('--only='))
	?.slice('--only='.length)
	.split(',')
	.map((s) => s.trim());

// Tên bảng / cột lấy từ file seed nằm trong repo — vẫn kiểm tra cho chắc trước
// khi ghép vào câu SQL.
const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (name) => {
	if (!IDENT.test(name)) throw new Error(`Tên bảng / cột không hợp lệ trong seed: ${name}`);
	return name;
};

const seedTable = async (pool, table, rows) => {
	const { recordset } = await pool
		.request()
		.query(`SELECT count(*)::int AS n FROM ${ident(table)}`);
	if (recordset[0].n > 0) {
		console.log(`• ${table}: đã có ${recordset[0].n} dòng — bỏ qua`);
		return 0;
	}
	if (!rows.length) return 0;
	const cols = Object.keys(rows[0]).map(ident);
	await withActorTransaction(null, async (tx) => {
		for (const row of rows) {
			const req = tx.request();
			cols.forEach((c, i) => req.input(`p${i}`, row[c] ?? null));
			await req.query(
				`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `@p${i}`).join(', ')})
				 ON CONFLICT (id) DO NOTHING`,
			);
		}
	});
	console.log(`✓ ${table}: nạp ${rows.length} dòng`);
	return rows.length;
};

(async () => {
	const pool = await getPool();
	let total = 0;
	for (const [group, tables] of Object.entries(SEED)) {
		if (only && !only.includes(group)) continue;
		// Thứ tự bảng trong file đã đúng thứ tự khoá ngoại (nhóm CME trước loại CME)
		for (const [table, rows] of Object.entries(tables)) total += await seedTable(pool, table, rows);
	}
	console.log(total ? `Đã nạp ${total} dòng danh mục` : 'Không có danh mục nào cần nạp');
	process.exit(0);
})().catch((err) => {
	console.error(`❌ Nạp danh mục lỗi: ${err.message}`);
	process.exit(1);
});
