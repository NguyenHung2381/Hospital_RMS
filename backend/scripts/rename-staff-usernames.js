#!/usr/bin/env node
// Đổi username tài khoản nhân viên sang dạng chữ cái đầu họ tên + MNV ("NVA_0123",
// không có MNV → "NVA"; trùng → thêm _1, _2...) — cùng quy tắc buildMemberUsername.
// Bỏ qua tài khoản quản trị, tài khoản khoa dùng chung, học viên và tài khoản chưa có MNV.
// Mặc định CHỈ LIỆT KÊ; thêm --apply để đổi thật. In bảng username cũ → mới để
// thông báo cho nhân viên (mật khẩu không đổi, nhưng phải đăng nhập bằng tên mới).
//   npm run rename:staff-usernames              # xem trước
//   npm run rename:staff-usernames -- --apply   # thực hiện
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const { getPool, sql } = require('../src/config/db');
const { buildMemberUsername } = require('../src/modules/topics/topicMemberService');

const apply = process.argv.includes('--apply');

(async () => {
	const pool = await getPool();
	const users = (
		await pool.request().query(`
			SELECT u.id, u.username, u.full_name, u.staff_number
			FROM users u
			LEFT JOIN roles r ON r.id = u.role_id
			WHERE ISNULL(r.code, '') NOT IN ('admin', 'dept_head', 'trainee')
			  AND u.full_name IS NOT NULL AND LTRIM(u.full_name) <> ''
			  -- Không có MNV thường là tài khoản dùng chung/test ("Tài khoản Ban Giám đốc") → không đổi
			  AND u.staff_number IS NOT NULL
			ORDER BY u.staff_number, u.id
		`)
	).recordset;

	const taken = new Set(
		(await pool.request().query('SELECT username FROM users')).recordset.map((r) => r.username.toLowerCase()),
	);
	const changes = [];
	for (const u of users) {
		const base = buildMemberUsername(u.full_name, u.staff_number);
		// Đã đúng dạng (kể cả hậu tố _n do trùng) → giữ nguyên
		if (new RegExp(`^${base}(_\\d{1,2})?$`, 'i').test(u.username)) continue;
		let next = base;
		for (let n = 1; taken.has(next.toLowerCase()); n++) next = `${base}_${n}`;
		taken.add(next.toLowerCase());
		changes.push({ ...u, next });
	}

	if (apply) {
		for (const c of changes) {
			await pool
				.request()
				.input('id', sql.VarChar(20), c.id)
				.input('username', sql.VarChar(100), c.next)
				.query('UPDATE users SET username = @username, updated_at = GETDATE() WHERE id = @id');
		}
	}

	console.log(`${apply ? 'Đã đổi' : '[xem trước] Sẽ đổi'} ${changes.length} username:`);
	for (const c of changes) console.log(`  ${c.username}  →  ${c.next}   (${c.full_name}, MNV: ${c.staff_number ?? '—'})`);
	if (!apply && changes.length) console.log('Chạy lại với --apply để thực hiện.');
	process.exit(0);
})().catch((err) => {
	console.error(`❌ ${err.message}`);
	process.exit(1);
});
