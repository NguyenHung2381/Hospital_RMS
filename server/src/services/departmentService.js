const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');

const departmentSelect = `
  SELECT d.*,
         COALESCE(uc.user_count, 0) AS user_count,
         COALESCE(tc.topic_count, 0) AS topic_count
  FROM departments d
  LEFT JOIN (
    SELECT department_id, COUNT(*) AS user_count
    FROM users
    WHERE department_id IS NOT NULL
    GROUP BY department_id
  ) uc ON uc.department_id = d.id
  LEFT JOIN (
    SELECT department_id, COUNT(*) AS topic_count
    FROM topics
    WHERE department_id IS NOT NULL
    GROUP BY department_id
  ) tc ON tc.department_id = d.id
`;

const getAll = async ({ page = 1, limit = 100, search } = {}) => {
	const pool = await getPool();
	const offset = (page - 1) * limit;
	let where = 'WHERE 1=1';
	const req = pool
		.request()
		.input('offset', sql.Int, offset)
		.input('limit', sql.Int, limit);

	if (search) {
		where +=
			' AND (d.name LIKE @search OR d.code LIKE @search OR d.abbreviation LIKE @search OR d.description LIKE @search)';
		req.input('search', sql.NVarChar, `%${search}%`);
	}

	const result = await req.query(`
    ${departmentSelect}
    ${where}
    ORDER BY d.created_at DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

    SELECT COUNT(*) AS total FROM departments ${where};
  `);
	return {
		data: result.recordsets[0],
		pagination: { page, limit, total: result.recordsets[1][0].total },
	};
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(20), id).query(`
      ${departmentSelect}
      WHERE d.id = @id
    `);
	return result.recordset[0] || null;
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const idResult = await pool
		.request()
		.input('abbreviation', sql.VarChar(20), data.abbreviation)
		.output('new_id', sql.VarChar(20))
		.execute('sp_gen_dept_id');
	const newId = idResult.output.new_id;

	await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('id', sql.VarChar(20), newId)
		.input('name', sql.NVarChar(255), data.name)
		.input('code', sql.VarChar(20), data.code)
		.input('abbreviation', sql.VarChar(20), data.abbreviation)
		.input('description', sql.NVarChar(sql.MAX), data.description || null)
		.input('specialty_group', sql.NVarChar(100), data.specialty_group || null)
		.query(`
      EXEC sp_set_actor @actor_id;
      INSERT INTO departments (id, name, code, abbreviation, description, specialty_group, created_by)
      VALUES (@id, @name, @code, @abbreviation, @description, @specialty_group, @actor_id);
    `);
	const dept = await getById(newId);
	broadcast('update', { entity: 'department' });
	return dept;
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId);

	if (data.name !== undefined) {
		sets.push('name = @name');
		req.input('name', sql.NVarChar(255), data.name);
	}
	if (data.code !== undefined) {
		sets.push('code = @code');
		req.input('code', sql.VarChar(20), data.code);
	}
	if (data.abbreviation !== undefined) {
		sets.push('abbreviation = @abbreviation');
		req.input('abbreviation', sql.VarChar(20), data.abbreviation);
	}
	if (data.description !== undefined) {
		sets.push('description = @description');
		req.input('description', sql.NVarChar(sql.MAX), data.description);
	}
	if (data.specialty_group !== undefined) {
		sets.push('specialty_group = @specialty_group');
		req.input('specialty_group', sql.NVarChar(100), data.specialty_group || null);
	}

	await req.query(
		`EXEC sp_set_actor @actor_id; UPDATE departments SET ${sets.join(', ')} WHERE id = @id`,
	);
	const dept = await getById(id);
	broadcast('update', { entity: 'department' });
	return dept;
};

const remove = async (id, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			`EXEC sp_set_actor @actor_id; DELETE FROM departments WHERE id = @id`,
		);
	broadcast('update', { entity: 'department' });
};

module.exports = { getAll, getById, create, update, remove };
