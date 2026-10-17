const { getPool, sql } = require('../config/db');
const { createCrudService } = require('../shared/crudService');
const { broadcast } = require('./eventService');
const { paging } = require('../utils/paging');
const { remember, invalidate } = require('../utils/cache');
const permCache = require('../middlewares/permissionCache');
const { httpError } = require('../utils/httpError');

// Cùng prefix `lookup:roles:` mà createCrudService('roles', ...) tự invalidate
// sau update/remove — getAll/create ở dưới bị override nên tự quản cache riêng.
const CACHE_PREFIX = 'lookup:roles:';

const base = createCrudService('roles', 4, '', [
	{ table: 'users', column: 'role_id', label: 'tài khoản' },
]);

// Override getAll để kèm user_count (số tài khoản đang gán vai trò) và
// permission_count (số quyền đã gán cho vai trò) — crudService mặc định chỉ
// SELECT * FROM roles nên cột "Người dùng" và "Quyền" luôn hiện 0 / "Chưa xem".
const getAll = async ({ page = 1, limit = 100, search } = {}) => {
	const key = `${CACHE_PREFIX}all:${page}:${limit}:${search || ''}`;
	return remember(key, 300, async () => {
		const pool = await getPool();
		const pg = paging(page, limit, 100);
		let where = 'WHERE 1=1';
		const req = pool
			.request()
			.input('offset', sql.Int, pg.offset)
			.input('limit', sql.Int, pg.limit);

		if (search) {
			where += ' AND (r.name LIKE @search OR r.description LIKE @search)';
			req.input('search', sql.NVarChar, `%${search}%`);
		}

		const result = await req.query(`
      SELECT r.*,
             (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count,
             (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS permission_count
      FROM roles r ${where} ORDER BY r.created_at DESC
      ${pg.fetchClause};
      SELECT COUNT(*) AS total FROM roles r ${where};

      SELECT COUNT(*) AS total,
             SUM(CASE WHEN uc.user_count > 0 THEN 1 ELSE 0 END) AS with_users,
             SUM(uc.user_count) AS total_users
      FROM roles r
      CROSS APPLY (SELECT COUNT(*) AS user_count FROM users u WHERE u.role_id = r.id) uc;
    `);
		const statsRow = result.recordsets[2][0];
		return {
			data: result.recordsets[0],
			pagination: {
				page: pg.page,
				limit: pg.limit,
				total: result.recordsets[1][0].total,
			},
			// Tổng quan toàn bộ vai trò, bỏ qua search/phân trang (server tính, tránh
			// lệch khi client chỉ còn giữ 1 trang dữ liệu).
			stats: {
				total: statsRow.total,
				withUsers: statsRow.with_users ?? 0,
				totalUsers: statsRow.total_users ?? 0,
			},
		};
	});
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('name', sql.NVarChar(500), data.name)
		.input('description', sql.NVarChar(sql.MAX), data.description || null)
		.query(`
      DECLARE @count INT, @new_id VARCHAR(4);
      SELECT @count = COUNT(*) + 1 FROM roles;
      SET @new_id = 'VT' + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
      WHILE EXISTS (SELECT 1 FROM roles WHERE id = @new_id)
      BEGIN
        SET @count = @count + 1;
        SET @new_id = 'VT' + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
      END
      EXEC sp_set_actor @actor_id;
      INSERT INTO roles (id, name, description, created_by)
      VALUES (@new_id, @name, @description, @actor_id);
      SELECT * FROM roles WHERE id = @new_id;
    `);
	await invalidate(CACHE_PREFIX);
	broadcast('update', { entity: 'role' });
	return result.recordset[0];
};

// Vai trò hệ thống (roles.is_system — 8 vai trò gốc, code nghiệp vụ tham chiếu
// qua roles.code) không được xoá: xoá đi thì cấp tài khoản chủ nhiệm / học viên,
// lọc tài khoản khoa... lỗi ngay. Sửa tên / mô tả / quyền vẫn được.
const remove = async (id, actorId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query('SELECT is_system FROM roles WHERE id = @id');
	if (r.recordset[0]?.is_system) {
		throw httpError(409, 'Không thể xoá vai trò hệ thống');
	}
	await base.remove(id, actorId);
	permCache.clear(id);
};

module.exports = { ...base, getAll, create, remove };
