const { getPool, sql } = require('../config/db');
const { createCrudService } = require('./crudService');
const { broadcast } = require('./eventService');
const { paging } = require('../utils/paging');

const base = createCrudService('roles', 4);

// Override getAll để kèm user_count (số tài khoản đang gán vai trò) và
// permission_count (số quyền đã gán cho vai trò) — crudService mặc định chỉ
// SELECT * FROM roles nên cột "Người dùng" và "Quyền" luôn hiện 0 / "Chưa xem".
const getAll = async ({ page = 1, limit = 100, search } = {}) => {
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
  `);
	return {
		data: result.recordsets[0],
		pagination: {
			page: pg.page,
			limit: pg.limit,
			total: result.recordsets[1][0].total,
		},
	};
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
	broadcast('update', { entity: 'role' });
	return result.recordset[0];
};

module.exports = { ...base, getAll, create };
