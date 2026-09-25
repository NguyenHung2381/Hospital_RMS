const { getPool } = require('../config/db');
const schema = require('../utils/schema');
const {
	migratePermissionScopes,
	summarize,
	migrateRolesAndSessions,
	summarizeRoles,
} = require('./migrations');
const { syncPermissions } = require('./sync');

// Chạy lúc server khởi động, TRƯỚC khi nhận request:
//   1. migrations: nâng cấp CSDL phân quyền nếu còn thiếu (idempotent — đã
//      nâng cấp thì không làm gì). Cần quyền ALTER TABLE; login ứng dụng
//      không có quyền thì DBA chạy các file trong backend/migrations/.
//   2. Kiểm tra CSDL đã ở mô hình mới — code KHÔNG còn nhánh chạy theo mô hình
//      cũ, nên chưa đủ thì DỪNG server (initPermissions ném lỗi) thay vì chạy
//      với phân quyền sai.
//   3. sync: đồng bộ permissions/catalog.js vào bảng permissions.
// Không kết nối được CSDL (SQL Server chưa lên...) thì chỉ cảnh báo và cho
// server chạy tiếp như trước — mọi API cần DB tự lỗi cho tới khi DB sẵn sàng.

const REQUIRED_COLUMNS = [
	['role_permissions', 'scope', '20260924_01_permission_scopes.sql'],
	['users', 'token_version', '20260924_02_token_version_role_codes.sql'],
	['roles', 'code', '20260924_02_token_version_role_codes.sql'],
	['roles', 'is_system', '20260924_02_token_version_role_codes.sql'],
	['roles', 'is_superuser', '20260924_02_token_version_role_codes.sql'],
	['users', 'must_change_password', '2026-10-09_must_change_password.sql'],
	['refresh_tokens', 'family_id', '2026-10-10_refresh_token_family.sql'],
	['refresh_tokens', 'revoked_at', '2026-10-10_refresh_token_family.sql'],
	['users', 'totp_last_step', '2026-10-11_2fa_hardening.sql'],
	['users', 'twofa_required_since', '2026-10-11_2fa_hardening.sql'],
	['user_backup_codes', 'code_hash', '2026-10-11_2fa_hardening.sql'],
];

// Danh sách vấn đề (rỗng = CSDL đã sẵn sàng cho mô hình phân quyền mới).
const findSchemaProblems = async () => {
	schema.reset();
	const problems = [];
	for (const [table, column, file] of REQUIRED_COLUMNS) {
		if (!(await schema.hasColumn(table, column))) problems.push(`thiếu cột ${table}.${column} (${file})`);
	}
	const pool = await getPool();
	const legacy = (
		await pool.request().query(`
      SELECT resource + ':' + action AS k FROM permissions
      WHERE action IN ('read_all', 'read_department', 'read_assigned')
         OR (resource = 'system' AND action = 'manage')
    `)
	).recordset.map((r) => r.k);
	if (legacy.length) problems.push(`còn quyền kiểu cũ: ${legacy.join(', ')}`);
	return problems;
};

const isConnectionError = (err) =>
	['ESOCKET', 'ETIMEOUT', 'ELOGIN', 'ECONNCLOSED', 'ENOTOPEN'].includes(err?.code) ||
	err?.name === 'ConnectionError';

const initPermissions = async () => {
	try {
		await getPool();
	} catch (err) {
		console.warn(`⚠️  [permissions] Chưa kết nối được CSDL (${err.message}) — bỏ qua bước nâng cấp/kiểm tra phân quyền`);
		return;
	}

	try {
		const report = await migratePermissionScopes();
		const summary = summarize(report);
		if (summary) console.log(`✅ [permissions] Nâng cấp mô hình phân quyền: ${summary}`);
		for (const w of report.warnings) console.warn(`⚠️  [permissions] ${w}`);
		const roles = await migrateRolesAndSessions();
		const rolesSummary = summarizeRoles(roles);
		if (rolesSummary) console.log(`✅ [permissions] Nâng cấp vai trò & phiên đăng nhập: ${rolesSummary}`);
	} catch (err) {
		if (isConnectionError(err)) {
			console.warn(`⚠️  [permissions] Mất kết nối CSDL khi nâng cấp (${err.message}) — bỏ qua`);
			return;
		}
		// Thường gặp: login không có quyền ALTER — bước kiểm tra dưới sẽ báo rõ thiếu gì
		console.error(`❌ [permissions] Tự nâng cấp CSDL thất bại: ${err.message}`);
	}

	const problems = await findSchemaProblems();
	if (problems.length) {
		throw Object.assign(
			new Error(
				'CSDL chưa được nâng cấp phân quyền — chạy lần lượt các file trong backend/migrations/ ' +
					'(sqlcmd -C -I -b -f 65001) hoặc `npm run migrate:permissions` bằng tài khoản có quyền ALTER TABLE:\n  - ' +
					problems.join('\n  - '),
			),
			{ code: 'PERMISSION_SCHEMA_OUTDATED' },
		);
	}

	try {
		await syncPermissions();
	} catch (err) {
		console.error(`❌ [permissions] Đồng bộ danh mục quyền thất bại: ${err.message}`);
	}
};

module.exports = { initPermissions, findSchemaProblems };
