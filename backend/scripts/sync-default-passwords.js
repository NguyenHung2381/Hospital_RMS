#!/usr/bin/env node
// Đặt lại mật khẩu = đúng tên đăng nhập (defaultPassword) cho tài khoản còn dùng
// mật khẩu mặc định (must_change_password = 1) mà mật khẩu lệch username — vd. sau
// khi chạy rename:*-usernames, mật khẩu mặc định vẫn là username CŨ.
// Đi qua userService.resetPassword: vẫn bắt đổi mật khẩu lần đầu, thu hồi phiên,
// ghi security event. --all: áp cho MỌI tài khoản (kể cả đã tự đổi mật khẩu).
// Mặc định CHỈ LIỆT KÊ; thêm --apply để đổi thật.
//   npm run sync:default-passwords                     # xem trước
//   npm run sync:default-passwords -- --apply          # thực hiện
//   npm run sync:default-passwords -- --all --apply    # mọi tài khoản
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const bcrypt = require('bcrypt');
const { getPool } = require('../src/config/db');
const { resetPassword } = require('../src/modules/users/userService');
const { defaultPassword } = require('../src/utils/passwordPolicy');

// Chống spam theo (sự kiện + tài khoản) → mỗi tài khoản 1 email cảnh báo, hàng
// nghìn email. Tắt email trong script; security_events vẫn ghi đủ từng tài khoản.
require('../src/modules/audit/securityAlertService').notify = async () => {};

const apply = process.argv.includes('--apply');
const all = process.argv.includes('--all');

(async () => {
	const pool = await getPool();
	const users = (
		await pool
			.request()
			.query(
				`SELECT id, username, password FROM users ${all ? '' : 'WHERE must_change_password = 1'} ORDER BY username`,
			)
	).recordset;
	console.log(`Kiểm tra ${users.length} tài khoản...`);

	// bcrypt ~0,2s/tài khoản — chỉ đặt lại tài khoản thật sự lệch
	const changes = [];
	for (const [i, u] of users.entries()) {
		if (!u.password || !(await bcrypt.compare(defaultPassword(u.username), u.password)))
			changes.push(u);
		if ((i + 1) % 100 === 0) console.log(`  ...${i + 1}/${users.length}`);
	}

	if (apply) for (const u of changes) await resetPassword(u.id, null, null);

	console.log(
		`${apply ? 'Đã đặt lại' : '[xem trước] Sẽ đặt lại'} mật khẩu = username cho ${changes.length} tài khoản:`,
	);
	for (const u of changes) console.log(`  ${u.username}`);
	if (!apply && changes.length) console.log('Chạy lại với --apply để thực hiện.');
	process.exit(0);
})().catch((err) => {
	console.error(`❌ ${err.message}`);
	process.exit(1);
});
