const { getPool, sql } = require('../config/db');
const permCache = require('../middlewares/permissionCache');
const { invalidate } = require('../utils/cache');
const { RESOURCE_SCOPES, isScoped, LEGACY_REMOVED_KEYS, normalizeLegacy } = require('./scopes');

// Nâng cấp mô hình phân quyền: phạm vi dữ liệu thành cột role_permissions.scope.
// Idempotent — chạy mỗi lần khởi động (permissions/index.js), hoặc tay:
//   npm run migrate:permissions [-- --dry-run]
//
//   1. Thêm cột role_permissions.scope (+ CHECK) nếu chưa có.
//   2. CHỈ MỘT LẦN — khi DB còn các quyền kiểu cũ (topics:read_all,
//      users:read_department, courses:read_assigned, X:manage dạng wildcard):
//      mỗi vai trò được quy đổi bằng normalizeLegacy (permissions/scopes.js) —
//      giữ nguyên quyền hiệu lực, phạm vi ghi vào cột scope, manage-wildcard
//      bung thành từng quyền cụ thể — rồi xoá các quyền kiểu cũ đó.
//   3. Lượt cấp của resource có phạm vi mà scope còn NULL (vd do phiên bản cũ
//      ghi vào) → gán phạm vi HẸP nhất.
// Bước 2–3 chạy trong 1 transaction: lỗi giữa chừng không để lại dữ liệu dở.

const migratePermissionScopes = async ({ dryRun = false } = {}) => {
	const pool = await getPool();
	const report = { addedColumn: false, roles: [], deletedPermissions: [], filledNullScopes: 0, warnings: [] };

	const hasColumn =
		(await pool.request().query(`SELECT COL_LENGTH('role_permissions', 'scope') AS len`))
			.recordset[0].len != null;
	if (!hasColumn) {
		report.addedColumn = true;
		if (!dryRun) {
			await pool.request().query(`ALTER TABLE role_permissions ADD scope VARCHAR(20) NULL`);
			await pool.request().query(`
        ALTER TABLE role_permissions ADD CONSTRAINT CK_role_permissions_scope
          CHECK (scope IS NULL OR scope IN ('own', 'assigned', 'department', 'all'))
      `);
			permCache.resetSchemaCheck();
		}
	}
	const scopeCol = hasColumn || !dryRun;

	const permRows = (await pool.request().query('SELECT id, resource, action FROM permissions')).recordset;
	const idByKey = new Map(permRows.map((r) => [`${r.resource}:${r.action}`, r.id]));
	const legacyPresent = permRows.filter((r) => LEGACY_REMOVED_KEYS.includes(`${r.resource}:${r.action}`));

	const grantRows = (
		await pool.request().query(`
      SELECT rp.role_id, p.resource, p.action${scopeCol ? ', rp.scope' : ''}
      FROM role_permissions rp INNER JOIN permissions p ON p.id = rp.permission_id
    `)
	).recordset;
	const byRole = new Map();
	for (const g of grantRows) {
		if (!byRole.has(g.role_id)) byRole.set(g.role_id, new Map());
		byRole.get(g.role_id).set(`${g.resource}:${g.action}`, g.scope ?? null);
	}

	// Kế hoạch thay đổi cho từng vai trò
	const plan = [];
	for (const [roleId, current] of byRole) {
		const change = { role_id: roleId, added: [], removed: [], scoped: [] };
		if (legacyPresent.length) {
			const desired = normalizeLegacy(new Set(current.keys()));
			for (const key of desired.keys) {
				if (!idByKey.has(key)) {
					report.warnings.push(`${roleId}: ${key} chưa có trong bảng permissions — bỏ qua`);
					continue;
				}
				const scope = desired.scopes.get(key) ?? null;
				if (!current.has(key)) change.added.push({ key, scope });
				else if (current.get(key) !== scope) change.scoped.push({ key, scope });
			}
			for (const key of current.keys()) {
				if (!desired.keys.has(key)) change.removed.push({ key });
			}
		} else {
			for (const [key, scope] of current) {
				const [resource] = key.split(':');
				if (isScoped(resource) && !scope) {
					change.scoped.push({ key, scope: RESOURCE_SCOPES[resource][0] });
				}
			}
		}
		if (change.added.length || change.removed.length || change.scoped.length) plan.push(change);
	}
	report.roles = plan.map((c) => ({
		role_id: c.role_id,
		added: c.added.map((g) => (g.scope ? `${g.key}@${g.scope}` : g.key)),
		removed: c.removed.map((g) => g.key),
		scoped: c.scoped.map((g) => `${g.key}@${g.scope}`),
	}));
	report.deletedPermissions = legacyPresent.map((r) => `${r.resource}:${r.action}`);
	if (!legacyPresent.length) {
		report.filledNullScopes = plan.reduce((n, c) => n + c.scoped.length, 0);
	}

	if (dryRun || (!plan.length && !legacyPresent.length)) return report;

	const transaction = new sql.Transaction(pool);
	await transaction.begin();
	try {
		const run = (query, params) => {
			const req = new sql.Request(transaction);
			for (const [name, type, value] of params) req.input(name, type, value);
			return req.query(query);
		};
		for (const c of plan) {
			for (const g of c.added) {
				await run(
					`INSERT INTO role_permissions (role_id, permission_id, scope) VALUES (@role_id, @perm_id, @scope)`,
					[
						['role_id', sql.VarChar(20), c.role_id],
						['perm_id', sql.VarChar(20), idByKey.get(g.key)],
						['scope', sql.VarChar(20), g.scope],
					],
				);
			}
			for (const g of c.scoped) {
				await run(
					`UPDATE role_permissions SET scope = @scope WHERE role_id = @role_id AND permission_id = @perm_id`,
					[
						['role_id', sql.VarChar(20), c.role_id],
						['perm_id', sql.VarChar(20), idByKey.get(g.key)],
						['scope', sql.VarChar(20), g.scope],
					],
				);
			}
		}
		// FK_rp_perm là ON DELETE CASCADE → xoá luôn các lượt cấp quyền kiểu cũ.
		for (const r of legacyPresent) {
			await run(`DELETE FROM permissions WHERE id = @id`, [['id', sql.VarChar(20), r.id]]);
		}
		await transaction.commit();
	} catch (err) {
		await transaction.rollback();
		throw err;
	}

	permCache.clear();
	await invalidate('lookup:roles:');
	return report;
};

// ─── Giai đoạn 3: phiên đăng nhập + vai trò hệ thống ─────────────────────────
// Idempotent, tương đương backend/migrations/20260924_02_token_version_role_codes.sql.
//   1. users.token_version — tăng lên là mọi access token cũ của tài khoản hết
//      hiệu lực ngay (reset mật khẩu, đăng xuất mọi thiết bị...).
//   2. roles.code (UNIQUE khi có giá trị), roles.is_system, roles.is_superuser.
//   3. CHỈ MỘT LẦN, khi DB còn quyền system:manage: gán mã + cờ hệ thống cho 8
//      vai trò gốc, vai trò đang có system:manage thành is_superuser = 1, rồi
//      xoá quyền system:manage — superuser là thuộc tính của vai trò, không cấp
//      được qua ma trận phân quyền nữa.
const { LEGACY_ROLE_IDS } = require('../services/roleCodes');
const schema = require('../utils/schema');

const migrateRolesAndSessions = async ({ dryRun = false } = {}) => {
	const pool = await getPool();
	const report = { addedColumns: [], codedRoles: [], superuserRoles: [], removedSystemManage: false };
	const colLen = async (t, c) =>
		(await pool.request().query(`SELECT COL_LENGTH('${t}', '${c}') AS len`)).recordset[0].len != null;

	const ddl = [
		['users', 'token_version', `ALTER TABLE users ADD token_version INT NOT NULL CONSTRAINT DF_users_token_version DEFAULT 0`],
		['roles', 'code', `ALTER TABLE roles ADD code VARCHAR(30) NULL`],
		['roles', 'is_system', `ALTER TABLE roles ADD is_system BIT NOT NULL CONSTRAINT DF_roles_is_system DEFAULT 0`],
		['roles', 'is_superuser', `ALTER TABLE roles ADD is_superuser BIT NOT NULL CONSTRAINT DF_roles_is_superuser DEFAULT 0`],
	];
	for (const [t, c, stmt] of ddl) {
		if (await colLen(t, c)) continue;
		report.addedColumns.push(`${t}.${c}`);
		if (!dryRun) await pool.request().query(stmt);
	}
	if (report.addedColumns.length && !dryRun) schema.reset();
	if (dryRun && report.addedColumns.length) return report; // chưa có cột thì chưa tính tiếp được
	if (!dryRun) {
		await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_roles_code' AND object_id = OBJECT_ID('roles'))
        CREATE UNIQUE INDEX UX_roles_code ON roles(code) WHERE code IS NOT NULL
    `);
	}

	const sysPerm = (
		await pool.request().query(`SELECT id FROM permissions WHERE resource = 'system' AND action = 'manage'`)
	).recordset[0];
	if (!sysPerm) return report;

	const roles = (await pool.request().query('SELECT id, code FROM roles')).recordset;
	const taken = new Set(roles.map((r) => r.code).filter(Boolean));
	for (const [code, id] of Object.entries(LEGACY_ROLE_IDS)) {
		const role = roles.find((r) => r.id === id);
		if (role && !role.code && !taken.has(code)) report.codedRoles.push(`${id}=${code}`);
	}
	report.superuserRoles = (
		await pool
			.request()
			.input('pid', sql.VarChar(20), sysPerm.id)
			.query('SELECT DISTINCT role_id FROM role_permissions WHERE permission_id = @pid')
	).recordset.map((r) => r.role_id);
	report.removedSystemManage = true;
	if (dryRun) return report;

	const transaction = new sql.Transaction(pool);
	await transaction.begin();
	try {
		for (const pair of report.codedRoles) {
			const [id, code] = pair.split('=');
			await new sql.Request(transaction)
				.input('id', sql.VarChar(20), id)
				.input('code', sql.VarChar(30), code)
				.query('UPDATE roles SET code = @code, is_system = 1 WHERE id = @id AND code IS NULL');
		}
		// Vai trò gốc đã có mã từ trước (chạy tay...) vẫn phải là vai trò hệ thống
		const ids = Object.values(LEGACY_ROLE_IDS);
		const req = new sql.Request(transaction);
		ids.forEach((id, i) => req.input(`r${i}`, sql.VarChar(20), id));
		await req.query(`UPDATE roles SET is_system = 1 WHERE is_system = 0 AND id IN (${ids.map((_, i) => `@r${i}`).join(',')})`);
		await new sql.Request(transaction)
			.input('pid', sql.VarChar(20), sysPerm.id)
			.query(`
        UPDATE roles SET is_superuser = 1
        WHERE id IN (SELECT role_id FROM role_permissions WHERE permission_id = @pid);
        DELETE FROM permissions WHERE id = @pid;
      `);
		await transaction.commit();
	} catch (err) {
		await transaction.rollback();
		throw err;
	}
	permCache.clear();
	require('../services/roleCodes').clear();
	await invalidate('lookup:roles:');
	return report;
};

const summarizeRoles = (report) => {
	const parts = [];
	if (report.addedColumns.length) parts.push(`thêm cột ${report.addedColumns.join(', ')}`);
	if (report.codedRoles.length) parts.push(`gán mã ${report.codedRoles.join(', ')}`);
	if (report.removedSystemManage) {
		parts.push(`superuser chuyển thành cờ vai trò (${report.superuserRoles.join(', ') || 'không vai trò nào'}), bỏ quyền system:manage`);
	}
	return parts.join('; ');
};

// Tóm tắt 1 dòng cho log khởi động.
const summarize = (report) => {
	const parts = [];
	if (report.addedColumn) parts.push('thêm cột role_permissions.scope');
	if (report.deletedPermissions.length) {
		parts.push(`quy đổi ${report.roles.length} vai trò, bỏ ${report.deletedPermissions.length} quyền kiểu cũ`);
	}
	if (report.filledNullScopes) parts.push(`gán phạm vi cho ${report.filledNullScopes} lượt cấp còn trống`);
	return parts.join('; ');
};

module.exports = { migratePermissionScopes, summarize, migrateRolesAndSessions, summarizeRoles };
