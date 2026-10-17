#!/usr/bin/env node
// Xuất định nghĩa stored procedure / function / trigger / view từ CSDL ra
// backend/database/objects/<loại>/<tên>.sql để đưa vào git. Nhiều object (sp_create_refresh_token,
// sp_gen_user_id, trg_users_audit...) chỉ tồn tại trong DB, không có trong repo —
// không review được, không tái lập được môi trường.
// CHỈ ĐỌC (sys.sql_modules), không sửa CSDL. Chạy lại sau mỗi lần sửa object
// trong DB rồi commit phần thay đổi.
//   npm run dump:db-objects                 # ghi đè thư mục backend/database/objects
//   npm run dump:db-objects -- --check      # chỉ báo khác biệt, exit 1 nếu có (CI)
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const { getPool } = require('../src/config/db');

const OUT = path.join(__dirname, '..', 'database', 'objects');
const FOLDER = {
	P: 'procedures',
	FN: 'functions',
	IF: 'functions',
	TF: 'functions',
	TR: 'triggers',
	V: 'views',
};
const check = process.argv.includes('--check');

// Chặn vô tình commit bí mật nằm trong mã T-SQL (mật khẩu, chuỗi kết nối...)
const SECRET_PATTERNS = [
	/PASSWORD\s*=\s*N?'[^']+'/i,
	/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/, // bcrypt hash thật
	/(pwd|password)\s*=\s*[^;'"\s]+;/i, // chuỗi kết nối
];

const normalize = (sqlText) => `${sqlText.replace(/\r\n?/g, '\n').trim()}\n`;

(async () => {
	const pool = await getPool();
	const rows = (
		await pool.request().query(`
			SELECT s.name AS schema_name, o.name, RTRIM(o.type) AS type, m.definition
			FROM sys.sql_modules m
			JOIN sys.objects o ON o.object_id = m.object_id
			JOIN sys.schemas s ON s.schema_id = o.schema_id
			WHERE o.is_ms_shipped = 0 AND RTRIM(o.type) IN ('P', 'FN', 'IF', 'TF', 'TR', 'V')
			  -- Object hỗ trợ sơ đồ (Database Diagrams) do SSMS tự tạo — không thuộc ứng dụng
			  AND o.name NOT LIKE '%diagram%'
			ORDER BY o.type, o.name
		`)
	).recordset;

	const expected = new Map(); // đường dẫn tương đối → nội dung
	const blocked = [];
	for (const r of rows) {
		if (!r.definition) continue; // WITH ENCRYPTION — không đọc được
		const body = normalize(r.definition);
		if (SECRET_PATTERNS.some((re) => re.test(body))) {
			blocked.push(`${r.schema_name}.${r.name}`);
			continue;
		}
		const file = path.join(FOLDER[r.type], `${r.schema_name}.${r.name}.sql`);
		expected.set(
			file,
			`-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc\n` +
				`-- migration) rồi chạy lại script, không sửa tay file này.\n${body}`,
		);
	}

	const existing = new Set();
	for (const dir of new Set(Object.values(FOLDER))) {
		const abs = path.join(OUT, dir);
		if (!fs.existsSync(abs)) continue;
		for (const f of fs.readdirSync(abs)) if (f.endsWith('.sql')) existing.add(path.join(dir, f));
	}

	const changed = [];
	for (const [file, content] of expected) {
		const abs = path.join(OUT, file);
		const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
		if (current === content) continue;
		changed.push(`${current === null ? '+' : '~'} ${file}`);
		if (!check) {
			fs.mkdirSync(path.dirname(abs), { recursive: true });
			fs.writeFileSync(abs, content);
		}
	}
	for (const file of existing) {
		if (expected.has(file)) continue;
		changed.push(`- ${file}`);
		if (!check) fs.unlinkSync(path.join(OUT, file));
	}

	console.log(`${expected.size} object; ${changed.length} thay đổi${check ? ' (chế độ --check, không ghi)' : ''}`);
	for (const c of changed) console.log(`  ${c}`);
	if (blocked.length) {
		console.warn(`⚠️  Không xuất vì có vẻ chứa bí mật (mật khẩu / hash / chuỗi kết nối): ${blocked.join(', ')}`);
	}
	process.exit(check && changed.length ? 1 : 0);
})().catch((err) => {
	console.error(`❌ ${err.message}`);
	process.exit(1);
});
