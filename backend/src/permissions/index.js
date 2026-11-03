const { getPool } = require('../config/db');
const { syncPermissions } = require('./sync');
const logger = require('../config/logger');

// Gọi từ database/index.js lúc khởi động, sau bước migration:
//   1. Kiểm tra CSDL đã ở mô hình phân quyền mới — code KHÔNG còn nhánh chạy
//      theo mô hình cũ, nên chưa đủ thì DỪNG server (ném DB_SCHEMA_OUTDATED)
//      thay vì chạy với phân quyền sai.
//   2. sync: đồng bộ permissions/catalog.js vào bảng permissions.

const REQUIRED_COLUMNS = [
	['role_permissions', 'scope', '2026-09-28_00_permission_scopes.sql'],
	['users', 'token_version', '2026-09-28_01_token_version_role_codes.sql'],
	['roles', 'code', '2026-09-28_01_token_version_role_codes.sql'],
	['roles', 'is_system', '2026-09-28_01_token_version_role_codes.sql'],
	['roles', 'is_superuser', '2026-09-28_01_token_version_role_codes.sql'],
	['users', 'must_change_password', '2026-10-09_must_change_password.sql'],
	['refresh_tokens', 'family_id', '2026-10-10_refresh_token_family.sql'],
	['refresh_tokens', 'revoked_at', '2026-10-10_refresh_token_family.sql'],
	['users', 'totp_last_step', '2026-10-11_2fa_hardening.sql'],
	['users', 'twofa_required_since', '2026-10-11_2fa_hardening.sql'],
	['user_backup_codes', 'code_hash', '2026-10-11_2fa_hardening.sql'],
	['users', 'temp_password_issued_at', '2026-12-12_han_dung_mat_khau_tam.sql'],
];

// Danh sách vấn đề (rỗng = CSDL đã sẵn sàng cho mô hình phân quyền mới). Đọc cột
// qua information_schema (có ở cả SQL Server và PG); tên bảng / cột là hằng trong code.
const findSchemaProblems = async () => {
	const pool = await getPool();
	const tables = [...new Set([...REQUIRED_COLUMNS.map(([t]) => t), 'permissions'])];
	const { recordset: found } = await pool.request().query(`
    SELECT LOWER(table_name) AS t, LOWER(column_name) AS c FROM information_schema.columns
    WHERE LOWER(table_name) IN (${tables.map((t) => `'${t}'`).join(', ')})`);
	const has = new Set(found.map((r) => `${r.t}.${r.c}`));
	const problems = REQUIRED_COLUMNS.filter(([t, c]) => !has.has(`${t}.${c}`)).map(
		([table, column, file]) => `thiếu cột ${table}.${column} (${file})`,
	);
	const legacy = found.some((r) => r.t === 'permissions')
		? (
				await pool.request().query(`
          SELECT CONCAT(resource, ':', action) AS k FROM permissions
          WHERE action IN ('read_all', 'read_department', 'read_assigned')
             OR (resource = 'system' AND action = 'manage')`)
			).recordset.map((r) => r.k)
		: [];
	if (legacy.length)
		problems.push(`còn quyền kiểu cũ: ${legacy.join(', ')} (2026-09-28_00_permission_scopes.sql)`);
	return problems;
};

const initPermissions = async () => {
	const problems = await findSchemaProblems();
	if (problems.length) {
		throw Object.assign(
			new Error(
				'CSDL chưa được nâng cấp — chạy `npm run migrate` bằng tài khoản có quyền ALTER TABLE:\n  - ' +
					problems.join('\n  - '),
			),
			{ code: 'DB_SCHEMA_OUTDATED' },
		);
	}

	try {
		await syncPermissions();
	} catch (err) {
		logger.error(`❌ [permissions] Đồng bộ danh mục quyền thất bại: ${err.message}`);
	}
};

module.exports = { initPermissions, findSchemaProblems };
