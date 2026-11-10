// Tài khoản quản trị đang hoạt động để ghi làm "người thực hiện" (created_by /
// updated_by / nhật ký) cho script nhập liệu. Ưu tiên vai trò toàn quyền
// (roles.is_superuser — mã 'superadmin'), không có thì vai trò mã 'admin'.
const { ROLE } = require('../../src/modules/access/roleCodes');

const findAdminActor = async (pool, sql) => {
	const row = (
		await pool.request().input('admin_code', sql.VarChar(50), ROLE.ADMIN).query(`
			SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
			WHERE u.is_active = 'true' AND (r.is_superuser = 'true' OR r.code = @admin_code)
			ORDER BY CASE WHEN r.is_superuser = 'true' THEN 0 ELSE 1 END, u.id
			OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY
		`)
	).recordset[0];
	if (!row)
		throw new Error('Không tìm thấy tài khoản quản trị đang hoạt động để ghi người thực hiện');
	return row.id;
};

module.exports = { findAdminActor };
