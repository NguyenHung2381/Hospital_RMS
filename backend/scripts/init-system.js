#!/usr/bin/env node
// Khởi tạo hệ thống MỚI (DB vừa `migrate init`, chưa có ai đăng nhập được):
//   1. Đồng bộ danh mục quyền (permissions/catalog.js → bảng permissions).
//   2. Tạo 8 vai trò hệ thống theo database/seed/system-roles.json, kèm quyền mặc định.
//   3. Tạo tài khoản quản trị đầu tiên (vai trò superuser) với mật khẩu tạm ngẫu
//      nhiên, in ra 1 lần. Bắt đổi mật khẩu ở lần đăng nhập đầu; mật khẩu tạm hết
//      hạn sau TEMP_PASSWORD_TTL_DAYS ngày (mặc định 7).
// Chạy lại an toàn: vai trò đã có (cùng mã) thì không đụng tới quyền của nó; đã có
// tài khoản quản trị đang hoạt động thì không tạo thêm.
//
//   npm run init:system
//   npm run init:system -- --username=admin --full-name="Nguyễn Văn A" --email=it@bvnghean.vn
//   npm run init:system -- --reset-admin --username=admin
//       quản trị mất mật khẩu / mật khẩu tạm hết hạn / bị khoá: cấp mật khẩu tạm mới,
//       mở khoá, đăng xuất mọi phiên. KHÔNG tắt 2FA.
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
const username = arg('username', 'admin');
const fullName = arg('full-name', 'Quản trị hệ thống');
const email = arg('email', '') || null;
const resetAdmin = process.argv.includes('--reset-admin');

const printCredentials = (title, password) => {
	const ttl = process.env.TEMP_PASSWORD_TTL_DAYS || '7';
	console.log(`
✓ ${title}
  ┌──────────────────────────────────────────────
  │ Tên đăng nhập : ${username}
  │ Mật khẩu tạm  : ${password}
  └──────────────────────────────────────────────
  Mật khẩu này CHỈ IN 1 LẦN. Đăng nhập và đổi mật khẩu trong ${ttl} ngày.
  Quá hạn / quên: chạy lại lệnh này với --reset-admin --username=${username}`);
};

// 16 ký tự chữ + số, đạt passwordPolicy (người dùng đổi ngay ở lần đăng nhập đầu)
const tempPassword = () => {
	const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
	for (;;) {
		const pw = Array.from(crypto.randomBytes(16), (b) => abc[b % abc.length]).join('');
		if (!checkPassword(pw, { username })) return pw;
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

const ensureAdmin = async (pool, adminRoleId) => {
	const admins = (
		await pool.request().query(`
			SELECT u.username FROM users u JOIN roles r ON r.id = u.role_id
			WHERE r.is_superuser AND u.is_active
		`)
	).recordset;
	if (admins.length) {
		console.log(
			`• Đã có tài khoản quản trị: ${admins.map((a) => a.username).join(', ')} — không tạo thêm`,
		);
		return;
	}
	const taken = (
		await pool
			.request()
			.input('username', sql.VarChar(100), username)
			.query('SELECT id FROM users WHERE username = @username')
	).recordset[0];
	if (taken) {
		throw new Error(
			`Tên đăng nhập "${username}" đã có (${taken.id}) nhưng không phải quản trị — chạy lại với --username=<tên khác>`,
		);
	}

	// require muộn: userService nạp event bus / redis, không cần khi chỉ tạo vai trò
	const userService = require('../src/modules/users/userService');
	const password = tempPassword();
	const user = await userService.create(
		{ username, password, full_name: fullName, email, role_id: adminRoleId },
		null,
	);
	printCredentials(`Tạo tài khoản quản trị ${user.id}`, password);
	console.log(
		`  Tài khoản quản trị phải bật 2FA trong ${process.env.TWOFA_GRACE_DAYS || '14'} ngày.`,
	);
};

const resetAdminPassword = async (pool) => {
	const user = (
		await pool.request().input('username', sql.VarChar(100), username).query(`
			SELECT u.id, r.is_superuser FROM users u LEFT JOIN roles r ON r.id = u.role_id
			WHERE u.username = @username
		`)
	).recordset[0];
	if (!user) throw new Error(`Không có tài khoản "${username}"`);
	if (!user.is_superuser) throw new Error(`"${username}" không phải tài khoản quản trị`);

	const userService = require('../src/modules/users/userService');
	const password = tempPassword();
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
	const adminRoleId = byCode.get('admin');
	if (!adminRoleId) throw new Error('Không có vai trò admin — không tạo được tài khoản quản trị');
	await ensureAdmin(pool, adminRoleId);
	process.exit(0);
})().catch((err) => {
	console.error(`❌ ${err.message}`);
	process.exit(1);
});
