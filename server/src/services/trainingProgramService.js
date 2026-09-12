const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const { paging } = require('../utils/paging');

const programSelect = `
  SELECT p.*, d.name AS department_name, tt.name AS trainee_type_name, tp.name AS training_type_name
  FROM training_programs p
  LEFT JOIN departments d ON d.id = p.department_id
  LEFT JOIN trainee_types tt ON tt.id = p.trainee_type_id
  LEFT JOIN training_types tp ON tp.id = p.training_type_id
`;

const getAll = async ({ page = 1, limit = 20, search, department_id } = {}) => {
	const pool = await getPool();
	const pg = paging(page, limit, 100);
	const where = ['1=1'];
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	if (search) {
		where.push('(p.name LIKE @search OR p.description LIKE @search)');
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	if (department_id) {
		where.push('p.department_id = @department_id');
		req.input('department_id', sql.VarChar(20), department_id);
	}
	const whereSql = `WHERE ${where.join(' AND ')}`;

	const result = await req.query(`
    ${programSelect} ${whereSql} ORDER BY p.created_at DESC
    ${pg.fetchClause};
    SELECT COUNT(*) AS total FROM training_programs p ${whereSql};
  `);
	return {
		data: result.recordsets[0],
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
	};
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(20), id).query(`${programSelect} WHERE p.id = @id`);
	const row = result.recordset[0];
	if (!row) return null;
	row.subject_ids = await getSubjectIds(id);
	return row;
};

const getSubjectIds = async (programId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('program_id', sql.VarChar(20), programId)
		.query('SELECT subject_id FROM program_subjects WHERE program_id = @program_id');
	return r.recordset.map((x) => x.subject_id);
};

const setSubjectIds = async (programId, subjectIds = []) => {
	const pool = await getPool();
	const ids = [...new Set((subjectIds || []).filter(Boolean))];
	await pool.request().input('program_id', sql.VarChar(20), programId)
		.query('DELETE FROM program_subjects WHERE program_id = @program_id');
	for (const sid of ids) {
		await pool
			.request()
			.input('program_id', sql.VarChar(20), programId)
			.input('subject_id', sql.VarChar(20), sid).query(`
				IF EXISTS (SELECT 1 FROM subjects WHERE id = @subject_id)
				INSERT INTO program_subjects (program_id, subject_id) VALUES (@program_id, @subject_id)
			`);
	}
	broadcast('update', { entity: 'training_program' });
	return getSubjectIds(programId);
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('name', sql.NVarChar(255), data.name)
		.input('department_id', sql.VarChar(20), data.department_id || null)
		.input('trainee_type_id', sql.VarChar(20), data.trainee_type_id || null)
		.input('training_type_id', sql.VarChar(20), data.training_type_id || null)
		.input('description', sql.NVarChar(sql.MAX), data.description || null)
		.query(`
      DECLARE @new_id VARCHAR(20) = 'CT' + LEFT(REPLACE(NEWID(),'-',''), 18);
      EXEC sp_set_actor @actor_id;
      INSERT INTO training_programs (id, name, department_id, trainee_type_id, training_type_id, description, created_by)
      VALUES (@new_id, @name, @department_id, @trainee_type_id, @training_type_id, @description, @actor_id);
      SELECT @new_id AS id;
    `);
	const id = result.recordset[0].id;
	if (Array.isArray(data.subject_ids) && data.subject_ids.length) await setSubjectIds(id, data.subject_ids);
	broadcast('update', { entity: 'training_program' });
	return getById(id);
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool.request().input('id', sql.VarChar(20), id).input('actor_id', sql.VarChar(20), actorId);

	if (data.name !== undefined) {
		sets.push('name = @name');
		req.input('name', sql.NVarChar(255), data.name);
	}
	if (data.department_id !== undefined) {
		sets.push('department_id = @department_id');
		req.input('department_id', sql.VarChar(20), data.department_id || null);
	}
	if (data.trainee_type_id !== undefined) {
		sets.push('trainee_type_id = @trainee_type_id');
		req.input('trainee_type_id', sql.VarChar(20), data.trainee_type_id || null);
	}
	if (data.training_type_id !== undefined) {
		sets.push('training_type_id = @training_type_id');
		req.input('training_type_id', sql.VarChar(20), data.training_type_id || null);
	}
	if (data.description !== undefined) {
		sets.push('description = @description');
		req.input('description', sql.NVarChar(sql.MAX), data.description || null);
	}

	if (sets.length > 2)
		await req.query(`EXEC sp_set_actor @actor_id; UPDATE training_programs SET ${sets.join(', ')} WHERE id = @id`);
	if (Array.isArray(data.subject_ids)) await setSubjectIds(id, data.subject_ids);
	broadcast('update', { entity: 'training_program' });
	return getById(id);
};

const remove = async (id, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId)
		.query('EXEC sp_set_actor @actor_id; DELETE FROM training_programs WHERE id = @id');
	broadcast('update', { entity: 'training_program' });
};

module.exports = { getAll, getById, create, update, remove, getSubjectIds, setSubjectIds };
