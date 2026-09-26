#!/usr/bin/env node
// Đánh dấu bắt buộc đổi mật khẩu (users.must_change_password = 1) cho mọi tài
// khoản còn dùng mật khẩu mặc định cũ '123456', chạy tay 1 lần sau khi nâng cấp.
// Migration chỉ bắt được tài khoản có password_changed_at NULL; tài khoản bị
// quản trị "đặt lại về 123456" thì password_changed_at đã có giá trị, phải so
// hash từng tài khoản (bcrypt ~0,2s/tài khoản — vì vậy không chạy lúc khởi động).
//   npm run flag:default-passwords -- --dry-run   # chỉ đếm, không ghi DB
//   npm run flag:default-passwords                # thực hiện
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const bcrypt = require('bcrypt');
const { getPool, sql } = require('../src/config/db');

const DEFAULT_PASSWORDS = ['123456'];
const dryRun = process.argv.includes('--dry-run');

(async () => {
	const pool = await getPool();
	const users = (
		await pool.request().query('SELECT id, username, password FROM users WHERE must_change_password = 0')
	).recordset;
	console.log(`Kiểm tra ${users.length} tài khoản...`);

	const flagged = [];
	for (const [i, u] of users.entries()) {
		for (const pw of DEFAULT_PASSWORDS) {
			if (u.password && (await bcrypt.compare(pw, u.password))) {
				flagged.push(u);
				break;
			}
		}
		if ((i + 1) % 100 === 0) console.log(`  ...${i + 1}/${users.length}`);
	}

	if (!dryRun) {
		for (const u of flagged) {
			await pool
				.request()
				.input('id', sql.VarChar(20), u.id)
				.query('UPDATE users SET must_change_password = 1 WHERE id = @id');
		}
	}
	console.log(
		`${dryRun ? '[dry-run] Sẽ đánh dấu' : 'Đã đánh dấu'} ${flagged.length} tài khoản dùng mật khẩu mặc định` +
			(flagged.length ? `: ${flagged.map((u) => u.username).join(', ')}` : ''),
	);
	process.exit(0);
})().catch((err) => {
	console.error(`❌ ${err.message}`);
	process.exit(1);
});
