const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');

const getAll = async ({
	page = 1,
	limit = 20,
	search,
	department_id,
	role_id,
	account_type,
	is_active,
}) => {
	const pool = await getPool();
	const offset = (page - 1) * limit;

	let where = 'WHERE 1=1';
	const req = pool
		.request()
		.input('offset', sql.Int, offset)
		.input('limit', sql.Int, limit);

	if (search) {
		where +=
			' AND (u.username LIKE @search OR u.full_name LIKE @search OR u.email LIKE @search OR CAST(u.staff_number AS VARCHAR(20)) LIKE @search)';
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	if (department_id) {
		where += ' AND u.department_id = @dept';
		req.input('dept', sql.VarChar(20), department_id);
	}
	if (role_id) {
		where += ' AND u.role_id = @role_id';
		req.input('role_id', sql.VarChar(20), role_id);
	}
	if (account_type) {
		where += ' AND u.account_type = @account_type';
		req.input('account_type', sql.VarChar(20), account_type);
	}
	if (is_active !== undefined) {
		where += ' AND u.is_active = @is_active';
		req.input('is_active', sql.Bit, is_active);
	}

	const result = await req.query(`
    SELECT u.id, u.username, u.staff_number, u.full_name, u.email, u.account_type, u.is_active,
           u.department_id, d.name AS department_name,
           u.role_id, r.name AS role_name,
           u.created_at, u.updated_at
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN roles r ON r.id = u.role_id
    ${where}
    ORDER BY u.created_at DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

    SELECT COUNT(*) AS total FROM users u ${where};
  `);

	return {
		data: result.recordsets[0],
		pagination: { page, limit, total: result.recordsets[1][0].total },
	};
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(20), id).query(`
      SELECT u.id, u.username, u.staff_number, u.full_name, u.email, u.account_type, u.is_active,
             u.department_id, d.name AS department_name,
             u.role_id, r.name AS role_name,
             u.password_changed_at, u.created_at, u.updated_at
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = @id
    `);
	return result.recordset[0] || null;
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const hashed = await bcrypt.hash(data.password, 10);

	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('username', sql.VarChar(50), data.username)
		.input('password', sql.VarChar(255), hashed)
		.input(
			'staff_number',
			sql.Int,
			data.staff_number != null && data.staff_number !== ''
				? parseInt(String(data.staff_number), 10)
				: null,
		)
		.input('full_name', sql.NVarChar(200), data.full_name)
		.input('email', sql.VarChar(100), data.email || null)
		.input('department_id', sql.VarChar(20), data.department_id || null)
		.input('role_id', sql.VarChar(20), data.role_id || null)
		.input('account_type', sql.VarChar(15), data.account_type || 'member')
		.query(`
      DECLARE @new_id VARCHAR(20);
      SET @new_id = 'NV' + LEFT(REPLACE(NEWID(), '-', ''), 8);
      EXEC sp_set_actor @actor_id;
      INSERT INTO users (id, username, password, staff_number, full_name, email, department_id, role_id, account_type, created_by)
      VALUES (@new_id, @username, @password, @staff_number, @full_name, @email, @department_id, @role_id, @account_type, @actor_id);
      SELECT @new_id AS id;
    `);

	const user = await getById(result.recordset[0].id);
	broadcast('update', { entity: 'user' });
	return user;
};

const update = async (id, data, actorId) => {
	const pool = await getPool();

	const sets = [];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId);

	if (data.staff_number !== undefined) {
		sets.push('staff_number = @staff_number');
		req.input(
			'staff_number',
			sql.Int,
			data.staff_number != null && data.staff_number !== ''
				? parseInt(String(data.staff_number), 10)
				: null,
		);
	}
	if (data.full_name !== undefined) {
		sets.push('full_name = @full_name');
		req.input('full_name', sql.NVarChar(200), data.full_name);
	}
	if (data.email !== undefined) {
		sets.push('email = @email');
		req.input('email', sql.VarChar(100), data.email);
	}
	if (data.department_id !== undefined) {
		sets.push('department_id = @department_id');
		req.input('department_id', sql.VarChar(20), data.department_id);
	}
	if (data.role_id !== undefined) {
		sets.push('role_id = @role_id');
		req.input('role_id', sql.VarChar(20), data.role_id);
	}
	if (data.account_type !== undefined) {
		sets.push('account_type = @account_type');
		req.input('account_type', sql.VarChar(15), data.account_type);
	}
	if (data.is_active !== undefined) {
		sets.push('is_active = @is_active');
		req.input('is_active', sql.Bit, data.is_active);
	}

	if (!sets.length) return getById(id);

	sets.push('updated_at = GETDATE()', 'updated_by = @actor_id');
	await req.query(
		`EXEC sp_set_actor @actor_id; UPDATE users SET ${sets.join(', ')} WHERE id = @id`,
	);
	const user = await getById(id);
	broadcast('update', { entity: 'user' });
	return user;
};

const remove = async (id, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId).query(`
			EXEC sp_set_actor @actor_id;
			UPDATE topic_members SET user_id = NULL, account_granted = 0, account_granted_at = NULL WHERE user_id = @id;
			UPDATE round_deadlines SET created_by = @actor_id WHERE created_by = @id;
			DELETE FROM users WHERE id = @id;
		`);
	broadcast('update', { entity: 'user' });
};

const resetPassword = async (id, newPassword, actorId) => {
	const pool = await getPool();
	const hashed = await bcrypt.hash(newPassword, 10);
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('password', sql.VarChar(255), hashed)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			`EXEC sp_set_actor @actor_id; UPDATE users SET password=@password, password_changed_at=GETDATE(), updated_at=GETDATE(), updated_by=@actor_id WHERE id=@id`,
		);
	broadcast('update', { entity: 'user' });
};

const searchForMember = async ({ q, department_id, limit = 10 }) => {
	const pool = await getPool();
	let where = 'WHERE u.is_active = 1';
	const req = pool.request().input('limit', sql.Int, Number(limit));

	if (q && q.trim()) {
		where +=
			' AND (u.username LIKE @search OR u.full_name LIKE @search OR CAST(u.staff_number AS VARCHAR(20)) LIKE @search)';
		req.input('search', sql.NVarChar, `%${q.trim()}%`);
	}
	if (department_id) {
		where += ' AND u.department_id = @dept';
		req.input('dept', sql.VarChar(20), department_id);
	}

	const result = await req.query(`
    SELECT TOP (@limit) u.id, u.full_name, u.username, u.staff_number, u.email, u.department_id
    FROM users u
    ${where}
    ORDER BY u.full_name
  `);

	return {
		data: result.recordset,
		pagination: {
			page: 1,
			limit: Number(limit),
			total: result.recordset.length,
		},
	};
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	remove,
	resetPassword,
	searchForMember,
};
