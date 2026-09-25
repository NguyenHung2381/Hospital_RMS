#!/usr/bin/env node
// Đổi username của tài khoản học viên đang chứa 4 số cuối CCCD (cách đặt tên
// cũ của traineeService.grantAccounts) sang hậu tố lấy từ mã học viên.
// Username hiển thị ở nhiều nơi nên phần CCCD trong đó là lộ dữ liệu cá nhân.
// Mặc định CHỈ LIỆT KÊ; thêm --apply để đổi thật. In bảng username cũ → mới để
// thông báo cho học viên (mật khẩu, phiên đăng nhập không bị ảnh hưởng).
//   npm run rename:trainee-usernames              # xem trước
//   npm run rename:trainee-usernames -- --apply   # thực hiện
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const { getPool, sql } = require('../src/config/db');

const apply = process.argv.includes('--apply');

(async () => {
	const pool = await getPool();
	const rows = (
		await pool.request().query(`
			SELECT u.id AS user_id, u.username, t.id AS trainee_id, t.national_id
			FROM trainees t
			JOIN users u ON u.id = t.user_id
			WHERE t.national_id IS NOT NULL AND LEN(t.national_id) >= 4
		`)
	).recordset;

	// Username cũ: "<chữ cái đầu>_<4 số cuối CCCD>" hoặc thêm "_<n>" khi trùng
	const affected = rows.filter((r) => {
		const parts = String(r.username).split('_');
		return parts.length >= 2 && parts[1] === String(r.national_id).slice(-4);
	});

	const taken = new Set(
		(await pool.request().query('SELECT username FROM users')).recordset.map((r) => r.username.toLowerCase()),
	);
	const changes = [];
	for (const r of affected) {
		const base = `${String(r.username).split('_')[0]}_${String(r.trainee_id).slice(-4).padStart(4, '0')}`;
		let next = base;
		for (let n = 1; taken.has(next.toLowerCase()); n++) next = `${base}_${n}`;
		taken.add(next.toLowerCase());
		changes.push({ ...r, next });
	}

	if (apply) {
		for (const c of changes) {
			await pool
				.request()
				.input('id', sql.VarChar(20), c.user_id)
				.input('username', sql.VarChar(100), c.next)
				.query('UPDATE users SET username = @username, updated_at = GETDATE() WHERE id = @id');
		}
	}

	console.log(`${apply ? 'Đã đổi' : '[xem trước] Sẽ đổi'} ${changes.length} username:`);
	for (const c of changes) console.log(`  ${c.username}  →  ${c.next}`);
	if (!apply && changes.length) console.log('Chạy lại với --apply để thực hiện.');
	process.exit(0);
})().catch((err) => {
	console.error(`❌ ${err.message}`);
	process.exit(1);
});
