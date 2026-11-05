#!/usr/bin/env node
// Khởi tạo hệ thống MỚI (DB vừa `migrate init`, chưa có ai đăng nhập được):
//   1. Đồng bộ danh mục quyền (permissions/catalog.js → bảng permissions).
//   2. Tạo các vai trò hệ thống theo database/seed/system-roles.json, kèm quyền mặc định.
//   3. Tạo 2 tài khoản quản trị, mỗi tài khoản 1 mật khẩu tạm ngẫu nhiên in ra 1 lần:
//        superadmin (vai trò superadmin) — toàn quyền
//        admin      (vai trò admin)      — chỉ NCKH, đào tạo / CME, người dùng
//      Bắt đổi mật khẩu ở lần đăng nhập đầu; mật khẩu tạm hết hạn sau
//      TEMP_PASSWORD_TTL_DAYS ngày (mặc định 7).
// Chạy lại an toàn: vai trò đã có (cùng mã) thì không đụng tới quyền của nó; vai trò
// đã có tài khoản đang hoạt động (superadmin: bất kỳ vai trò toàn quyền nào) thì
// không tạo thêm; tên đăng nhập đã bị dùng thì bỏ qua tài khoản đó kèm cảnh báo.
//
//   npm run init:system
//   npm run init:system -- --username=superadmin --full-name="Nguyễn Văn A" --email=it@bvnghean.vn
//   npm run init:system -- --admin-username=admin --admin-full-name="..." --admin-email=...
//   npm run init:system -- --no-admin-account
//       chỉ tạo tài khoản superadmin (DB chuyển dữ liệu: vai trò Admin vẫn được tạo,
//       ai cần thì superadmin tự gán ở màn Người dùng)
//   npm run init:system -- --reset-admin --username=admin
//       tài khoản superadmin / admin mất mật khẩu / mật khẩu tạm hết hạn / bị khoá: cấp
//       mật khẩu tạm mới, mở khoá, đăng xuất mọi phiên. KHÔNG tắt 2FA.
//   npm run init:system -- --replace-legacy-admin
//       DÙNG NGAY SAU KHI CHUYỂN DỮ LIỆU TỪ .bak (setup-dev / setup-server tự thêm): nếu
//       tài khoản toàn quyền đang hoạt động DUY NHẤT là "admin" (tài khoản quản trị của
//       hệ thống cũ) thì bỏ nó rồi tạo superadmin + admin mới. Xoá hẳn nếu không còn
//       dữ liệu gắn với nó; còn (đề tài, hội đồng, tệp…) thì vô hiệu hoá, đổi tên đăng
//       nhập thành admin_cu (giữ lịch sử, nhường tên "admin"), đăng xuất mọi phiên.
//
// Trên server (image production không có npm), chạy trong image backend bằng role
// rms_migrate — scripts/setup-server.sh tự làm việc này khi DB_MODE=new:
//   docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
//     -e DB_USER=rms_migrate -e DB_PASSWORD backend node scripts/init-system.js
require('../src/config/loadEnv');
const crypto = require('crypto');
const { getPool, sql, withActorTransaction } = require('../src/config/db');
const { findSchemaProblems } = require('../src/permissions');
const { syncPermissions } = require('../src/permissions/sync');
const { RESOURCE_SCOPES, isScoped, nullScopeFill } = require('../src/permissions/scopes');
const { checkPassword } = require('../src/utils/passwordPolicy');
const TEMPLATES = require('../database/seed/system-roles.json');

const arg = (name, def) => {
	const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3).trim() : def;
};
// --username / --full-name / --email: tài khoản superadmin (giữ tên cờ cũ cho
// scripts/setup-server.sh); --admin-*: tài khoản admin.
const ACCOUNTS = [
	{
		roleCode: 'superadmin',
		label: 'Super Admin',
		username: arg('username', 'superadmin'),
		fullName: arg('full-name', 'Super Admin'),
		email: arg('email', '') || null,
	},
	{
		roleCode: 'admin',
		label: 'Admin',
		username: arg('admin-username', 'admin'),
		fullName: arg('admin-full-name', 'Quản trị nghiệp vụ'),
		email: arg('admin-email', '') || null,
	},
];
if (process.argv.includes('--no-admin-account')) ACCOUNTS.pop();
const username = ACCOUNTS[0].username; // --reset-admin
const resetAdmin = process.argv.includes('--reset-admin');
const replaceLegacyAdmin = process.argv.includes('--replace-legacy-admin');
const LEGACY_ADMIN = 'admin';

const printCredentials = (title, password, login = username) => {
	const ttl = process.env.TEMP_PASSWORD_TTL_DAYS || '7';
	console.log(`
✓ ${title}
  ┌──────────────────────────────────────────────
  │ Tên đăng nhập : ${login}
  │ Mật khẩu tạm  : ${password}
  └──────────────────────────────────────────────
  Mật khẩu này CHỈ IN 1 LẦN. Đăng nhập và đổi mật khẩu trong ${ttl} ngày.
  Quá hạn / quên: chạy lại lệnh này với --reset-admin --username=${login}`);
};

// 16 ký tự chữ + số, đạt passwordPolicy (người dùng đổi ngay ở lần đăng nhập đầu)
const tempPassword = (login) => {
	const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
	for (;;) {
		const pw = Array.from(crypto.randomBytes(16), (b) => abc[b % abc.length]).join('');
		if (!checkPassword(pw, { username: login })) return pw;
	}
};

// Phạm vi lưu vào role_permissions.scope: resource có phạm vi thì phải là 1 giá
// trị hợp lệ (thiếu → mức hẹp mặc định), resource không có phạm vi thì NULL.
const scopeOf = (resource, scope) => {
	if (!isScoped(resource)) return null;
	if (scope && RESOURCE_SCOPES[resource].includes(scope)) return scope;
	return nullScopeFill(resource);
};

const seedRoles = async (pool) => {
	const roles = (await pool.request().query('SELECT id, code FROM roles')).recordset;
	const byCode = new Map(roles.filter((r) => r.code).map((r) => [r.code, r.id]));
	const ids = new Set(roles.map((r) => r.id));
	const permIdByKey = new Map(
		(await pool.request().query('SELECT id, resource, action FROM permissions')).recordset.map(
			(p) => [`${p.resource}:${p.action}`, p.id],
		),
	);

	for (const [code, t] of Object.entries(TEMPLATES)) {
		if (byCode.has(code)) {
			console.log(`• Vai trò ${code} đã có (${byCode.get(code)}), giữ nguyên quyền`);
			continue;
		}
		if (ids.has(t.id)) {
			console.warn(`⚠️  Mã vai trò ${t.id} đã dùng cho vai trò khác, bỏ qua ${code}`);
			continue;
		}
		const grants = [];
		for (const [key, scope] of Object.entries(t.grants)) {
			const permId = permIdByKey.get(key);
			if (!permId) {
				console.warn(`⚠️  ${code}: quyền ${key} không có trong danh mục, bỏ qua`);
				continue;
			}
			grants.push({ permId, scope: scopeOf(key.split(':')[0], scope) });
		}
		await withActorTransaction(null, async (tx) => {
			await tx
				.request()
				.input('id', sql.VarChar(6), t.id)
				.input('name', sql.NVarChar(100), t.name)
				.input('code', sql.VarChar(30), code)
				.input('superuser', sql.Bit, !!t.superuser).query(`
					INSERT INTO roles (id, name, code, is_system, is_superuser)
					VALUES (@id, @name, @code, true, @superuser)
				`);
			for (const g of grants) {
				await tx
					.request()
					.input('role_id', sql.VarChar(6), t.id)
					.input('perm_id', sql.VarChar(20), g.permId)
					.input('scope', sql.VarChar(20), g.scope)
					.query(
						'INSERT INTO role_permissions (role_id, permission_id, scope) VALUES (@role_id, @perm_id, @scope)',
					);
			}
		});
		byCode.set(code, t.id);
		console.log(`✓ Tạo vai trò ${t.id} ${t.name} (${code}), ${grants.length} quyền`);
	}
	return byCode;
};

// Tạo tài khoản cho 1 vai trò quản trị nếu vai trò đó chưa có ai đang hoạt động.
// Superadmin: coi như đã có khi có BẤT KỲ tài khoản toàn quyền nào (DB cũ dùng vai trò khác).
const ensureAccount = async (pool, account, roleId) => {
	const { username: login, fullName, email, label } = account;
	const holders = (
		await pool.request().input('role_id', sql.VarChar(10), roleId).query(`
			SELECT u.username FROM users u JOIN roles r ON r.id = u.role_id
			WHERE u.is_active AND ${account.roleCode === 'superadmin' ? 'r.is_superuser' : 'r.id = @role_id'}
		`)
	).recordset;
	if (holders.length) {
		console.log(
			`• Đã có tài khoản ${label}: ${holders.map((a) => a.username).join(', ')} — không tạo thêm`,
		);
		return;
	}
	const taken = (
		await pool
			.request()
			.input('username', sql.VarChar(100), login)
			.query('SELECT id FROM users WHERE username = @username')
	).recordset[0];
	if (taken) {
		console.warn(
			`⚠️  Tên đăng nhập "${login}" đã có (${taken.id}) — bỏ qua tài khoản ${label}. Chạy lại với tên khác (--${account.roleCode === 'superadmin' ? '' : 'admin-'}username=...)`,
		);
		return;
	}

	// require muộn: userService nạp event bus / redis, không cần khi chỉ tạo vai trò
	const userService = require('../src/modules/users/userService');
	const password = tempPassword(login);
	const user = await userService.create(
		{ username: login, password, full_name: fullName, email, role_id: roleId },
		null,
	);
	printCredentials(`Tạo tài khoản ${label} ${user.id}`, password, login);
	console.log(
		`  Tài khoản quản trị phải bật 2FA trong ${process.env.TWOFA_GRACE_DAYS || '14'} ngày.`,
	);
};

// Tên đăng nhập còn trống: admin_cu, admin_cu2, admin_cu3…
const freeUsername = async (pool, base) => {
	for (let i = 1; ; i++) {
		const name = i === 1 ? base : `${base}${i}`;
		const hit = (
			await pool
				.request()
				.input('username', sql.VarChar(100), name)
				.query('SELECT 1 FROM users WHERE username = @username')
		).recordset.length;
		if (!hit) return name;
	}
};

// --replace-legacy-admin: bỏ tài khoản "admin" của hệ thống cũ khi nó là tài khoản
// toàn quyền duy nhất, để ensureAccount tạo superadmin + admin mới ngay sau đó.
const replaceLegacy = async (pool, byCode) => {
	const supers = (
		await pool.request().query(`
			SELECT u.id, u.username FROM users u JOIN roles r ON r.id = u.role_id
			WHERE r.is_superuser AND u.is_active
		`)
	).recordset;
	if (supers.length !== 1 || supers[0].username.toLowerCase() !== LEGACY_ADMIN) {
		console.log(
			`• Không thay tài khoản quản trị cũ — tài khoản toàn quyền đang hoạt động: ${
				supers.map((u) => u.username).join(', ') || '(không có)'
			}`,
		);
		return;
	}
	// Chỉ bỏ admin cũ khi CHẮC tạo được superadmin mới — không thì DB mất hết quản trị
	const sa = ACCOUNTS[0];
	const problem =
		sa.username.toLowerCase() === LEGACY_ADMIN
			? `tài khoản Super Admin mới cũng tên "${LEGACY_ADMIN}"`
			: !byCode.get(sa.roleCode)
				? `chưa có vai trò ${sa.roleCode}`
				: (await freeUsername(pool, sa.username)) !== sa.username
					? `tên "${sa.username}" đã có người dùng (đặt tên khác bằng --username=)`
					: null;
	if (problem) {
		console.warn(`⚠️  Không thay tài khoản quản trị cũ: ${problem} — giữ nguyên "${LEGACY_ADMIN}"`);
		return;
	}
	const old = supers[0];
	const userService = require('../src/modules/users/userService');
	try {
		await userService.remove(old.id, null);
		console.log(`✓ Xoá tài khoản quản trị cũ "${old.username}" (${old.id})`);
		return;
	} catch (err) {
		if (err.statusCode !== 409) throw err;
		console.log(`• "${old.username}" còn dữ liệu liên kết — không xoá hẳn: ${err.message}`);
	}
	const newName = await freeUsername(pool, `${LEGACY_ADMIN}_cu`);
	await withActorTransaction(null, (tx) =>
		tx
			.request()
			.input('id', sql.VarChar(20), old.id)
			.input('username', sql.VarChar(100), newName)
			.query(
				`UPDATE users SET is_active = false, username = @username, token_version = token_version + 1
				 WHERE id = @id`,
			),
	);
	await pool
		.request()
		.input('id', sql.VarChar(20), old.id)
		.query('DELETE FROM refresh_tokens WHERE user_id = @id');
	require('../src/permissions/userStatusCache').clear(old.id);
	console.log(
		`✓ Vô hiệu hoá tài khoản cũ ${old.id}, đổi tên đăng nhập "${old.username}" → "${newName}" (giữ lịch sử, đã đăng xuất mọi phiên)`,
	);
};

const resetAdminPassword = async (pool) => {
	const user = (
		await pool.request().input('username', sql.VarChar(100), username).query(`
			SELECT u.id, r.is_superuser, r.code FROM users u LEFT JOIN roles r ON r.id = u.role_id
			WHERE u.username = @username
		`)
	).recordset[0];
	if (!user) throw new Error(`Không có tài khoản "${username}"`);
	if (!user.is_superuser && user.code !== 'admin')
		throw new Error(`"${username}" không phải tài khoản quản trị (superadmin / admin)`);

	const userService = require('../src/modules/users/userService');
	const password = tempPassword(username);
	await userService.resetPassword(user.id, password, null);
	await withActorTransaction(null, (tx) =>
		tx
			.request()
			.input('id', sql.VarChar(20), user.id)
			.query(
				'UPDATE users SET is_active = true, failed_login_count = 0, locked_until = NULL WHERE id = @id',
			),
	);
	printCredentials(`Đặt lại mật khẩu, mở khoá ${user.id}`, password);
};

(async () => {
	const problems = await findSchemaProblems();
	if (problems.length)
		throw new Error(`CSDL chưa nâng cấp — chạy migrate trước:\n  - ${problems.join('\n  - ')}`);

	if (resetAdmin) {
		await resetAdminPassword(await getPool());
		process.exit(0);
	}

	const sync = await syncPermissions();
	console.log(
		sync.inserted.length
			? `✓ Thêm ${sync.inserted.length} quyền từ danh mục`
			: '• Danh mục quyền đã khớp',
	);
	for (const w of sync.warnings) console.warn(`⚠️  ${w}`);

	const pool = await getPool();
	const byCode = await seedRoles(pool);
	if (replaceLegacyAdmin) await replaceLegacy(pool, byCode);
	for (const account of ACCOUNTS) {
		const roleId = byCode.get(account.roleCode);
		if (!roleId) {
			console.warn(
				`⚠️  Không có vai trò ${account.roleCode} — không tạo được tài khoản ${account.label}`,
			);
			continue;
		}
		await ensureAccount(pool, account, roleId);
	}
	process.exit(0);
})().catch((err) => {
	console.error(`❌ ${err.message}`);
	process.exit(1);
});
