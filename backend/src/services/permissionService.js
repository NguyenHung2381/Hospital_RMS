const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const permCache = require('../middlewares/permissionCache');
const { invalidate } = require('../utils/cache');

const getAll = async () => {
	const pool = await getPool();
	const result = await pool
		.request()
		.query(
			'SELECT id, name, resource, action, description FROM permissions ORDER BY resource, action',
		);
	return result.recordset;
};

const getRolePermissions = async (roleId) => {
	const pool = await getPool();
	const result = await pool.request().input('role_id', sql.VarChar(20), roleId)
		.query(`
      SELECT p.id
      FROM permissions p
      INNER JOIN role_permissions rp ON rp.permission_id = p.id
      WHERE rp.role_id = @role_id
    `);
	return result.recordset.map((r) => r.id);
};

const setRolePermissions = async (roleId, permissionIds, actorId) => {
	const pool = await getPool();
	const transaction = new sql.Transaction(pool);
	try {
		await transaction.begin();

		await new sql.Request(transaction)
			.input('role_id', sql.VarChar(20), roleId)
			.query('DELETE FROM role_permissions WHERE role_id = @role_id');

		for (const permId of permissionIds) {
			await new sql.Request(transaction)
				.input('role_id', sql.VarChar(20), roleId)
				.input('permission_id', sql.VarChar(20), permId)
				.input('created_by', sql.VarChar(20), actorId).query(`
          INSERT INTO role_permissions (role_id, permission_id, created_by)
          VALUES (@role_id, @permission_id, @created_by)
        `);
		}

		await transaction.commit();
		permCache.clear(roleId); // xóa cache để hiệu lực ngay
		await invalidate('lookup:roles:'); // permission_count trong danh sách roles vừa đổi
		broadcast('update', { entity: 'role' });
		return getRolePermissions(roleId);
	} catch (err) {
		await transaction.rollback();
		throw err;
	}
};

module.exports = { getAll, getRolePermissions, setRolePermissions };
