#!/usr/bin/env node
// Đổi username MỌI tài khoản học viên sang dạng "<chữ cái đầu họ tên>_<số thứ tự
// 4 chữ số>" (NVA_0001, NVA_0002...) — cùng quy tắc với lúc cấp mới
// (src/modules/training/trainees/traineeUsername.js). Thay cho các dạng cũ: 4 số
// cuối CCCD, rồi 4 số cuối mã học viên.
// Số thứ tự đánh lại từ 0001 theo từng viết tắt, theo thứ tự cấp tài khoản
// (account_granted_at, mã tài khoản) — chạy lại cho cùng kết quả, không đổi gì thêm.
// Tài khoản CHƯA đổi mật khẩu lần nào (must_change_password = 1) được đặt lại
// mật khẩu = username mới cho khớp quy tắc "mật khẩu mặc định = tên đăng nhập";
// tài khoản đã tự đặt mật khẩu giữ nguyên mật khẩu.
// Mặc định CHỈ LIỆT KÊ; thêm --apply để đổi thật. In bảng username cũ → mới để
// thông báo cho học viên.
//   npm run rename:trainee-usernames              # xem trước
//   npm run rename:trainee-usernames -- --apply   # thực hiện
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const bcrypt = require('bcrypt');
const { getPool, sql } = require('../src/config/db');
const { defaultPassword } = require('../src/utils/passwordPolicy');
const {
	traineeUsernamePrefix,
	nextTraineeUsername,
} = require('../src/modules/training/trainees/traineeUsername');

const apply = process.argv.includes('--apply');

(async () => {
	const pool = await getPool();
	const rows = (
		await pool.request().query(`
			SELECT u.id AS user_id, u.username, u.full_name AS user_full_name,
			       u.must_change_password, t.id AS trainee_id, t.full_name
			FROM trainees t
			JOIN users u ON u.id = t.user_id
			JOIN roles r ON r.id = u.role_id AND r.code = 'trainee'
			ORDER BY t.account_granted_at, u.id
		`)
	).recordset;
	const traineeUserIds = new Set(rows.map((r) => r.user_id));

	// Username của tài khoản KHÔNG phải học viên giữ nguyên ⇒ phải nhảy qua
	const taken = new Set(
		(await pool.request().query('SELECT id, username FROM users')).recordset
			.filter((u) => !traineeUserIds.has(u.id))
			.map((u) => String(u.username).toUpperCase()),
	);
	const assignedByPrefix = new Map(); // prefix → username học viên đã xếp
	const changes = [];
	for (const r of rows) {
		const prefix = traineeUsernamePrefix(r.full_name || r.user_full_name);
		const assigned = assignedByPrefix.get(prefix) ?? [];
		const next = nextTraineeUsername(prefix, assigned, taken);
		assigned.push(next);
		assignedByPrefix.set(prefix, assigned);
		taken.add(next.toUpperCase());
		if (next !== r.username) changes.push({ ...r, next });
	}

	if (apply && changes.length > 0) {
		const tx = new sql.Transaction(pool);
		await tx.begin();
		try {
			// 2 bước để không đụng trùng giữa chính các tài khoản đang đổi chỗ cho
			// nhau (A: NVA_0002 → NVA_0001 trong khi B: NVA_0001 → NVA_0002)
			for (const c of changes) {
				await new sql.Request(tx)
					.input('id', sql.VarChar(20), c.user_id)
					.input('username', sql.VarChar(100), `~${c.user_id}`)
					.query('UPDATE users SET username = @username WHERE id = @id');
			}
			for (const c of changes) {
				const req = new sql.Request(tx)
					.input('id', sql.VarChar(20), c.user_id)
					.input('username', sql.VarChar(100), c.next);
				let setPassword = '';
				if (c.must_change_password) {
					req.input('password', sql.VarChar(255), await bcrypt.hash(defaultPassword(c.next), 12));
					setPassword = ', password = @password, password_changed_at = GETDATE()';
				}
				await req.query(
					`UPDATE users SET username = @username${setPassword}, updated_at = GETDATE() WHERE id = @id`,
				);
			}
			await tx.commit();
		} catch (err) {
			await tx.rollback();
			throw err;
		}
	}

	console.log(
		`${apply ? 'Đã đổi' : '[xem trước] Sẽ đổi'} ${changes.length}/${rows.length} username học viên:`,
	);
	for (const c of changes) {
		const note = c.must_change_password ? '  (mật khẩu mặc định = tên mới)' : '';
		console.log(`  ${c.trainee_id}  ${c.username}  →  ${c.next}${note}`);
	}
	if (!apply && changes.length) console.log('Chạy lại với --apply để thực hiện.');
	process.exit(0);
})().catch((err) => {
	console.error(`❌ ${err.message}`);
	process.exit(1);
});
