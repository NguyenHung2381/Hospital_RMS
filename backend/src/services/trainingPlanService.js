const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const { paging } = require('../utils/paging');

const planSelect = `
  SELECT p.*, d.name AS department_name
  FROM training_plans p
  LEFT JOIN departments d ON d.id = p.department_id
`;

const getAll = async ({ page = 1, limit = 20, search, department_id, year, status } = {}) => {
	const pool = await getPool();
	const pg = paging(page, limit, 100);
	const where = ['1=1'];
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	if (search) {
		where.push('(p.title LIKE @search OR p.description LIKE @search)');
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	if (department_id) {
		where.push('p.department_id = @department_id');
		req.input('department_id', sql.VarChar(20), department_id);
	}
	if (year) {
		where.push('p.year = @year');
		req.input('year', sql.Int, year);
	}
	if (status) {
		where.push('p.status = @status');
		req.input('status', sql.VarChar(20), status);
	}
	const whereSql = `WHERE ${where.join(' AND ')}`;

	const result = await req.query(`
    ${planSelect} ${whereSql} ORDER BY p.year DESC, p.created_at DESC
    ${pg.fetchClause};
    SELECT COUNT(*) AS total FROM training_plans p ${whereSql};
  `);
	return {
		data: result.recordsets[0],
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
	};
};

const listItems = async (planId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('plan_id', sql.VarChar(20), planId)
		.query('SELECT * FROM training_plan_items WHERE plan_id = @plan_id ORDER BY quarter ASC, created_at ASC');
	return r.recordset;
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(20), id).query(`${planSelect} WHERE p.id = @id`);
	const row = result.recordset[0];
	if (!row) return null;
	row.items = await listItems(id);
	return row;
};

// Xoá hết rồi chèn lại toàn bộ hạng mục (mirror trainingProgramService.setSubjectIds)
// — đơn giản hơn diff từng dòng, phù hợp vì số hạng mục/kế hoạch nhỏ và chỉ
// admin/phòng đào tạo thao tác (không có concurrency cao).
const setItems = async (planId, items, actorId) => {
	const pool = await getPool();
	await pool.request().input('plan_id', sql.VarChar(20), planId).query('DELETE FROM training_plan_items WHERE plan_id = @plan_id');
	for (const item of items || []) {
		if (!item || !item.title) continue;
		await pool
			.request()
			.input('plan_id', sql.VarChar(20), planId)
			.input('title', sql.NVarChar(255), item.title)
			.input('quarter', sql.Int, item.quarter || null)
			.input('target_count', sql.Int, item.target_count || null)
			.input('note', sql.NVarChar(sql.MAX), item.note || null)
			.input('actor_id', sql.VarChar(20), actorId).query(`
        DECLARE @new_id VARCHAR(20) = 'HM' + LEFT(REPLACE(NEWID(),'-',''), 18);
        INSERT INTO training_plan_items (id, plan_id, title, quarter, target_count, note, created_by)
        VALUES (@new_id, @plan_id, @title, @quarter, @target_count, @note, @actor_id);
      `);
	}
	broadcast('update', { entity: 'training_plan' });
	return listItems(planId);
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('department_id', sql.VarChar(20), data.department_id || null)
		.input('year', sql.Int, data.year)
		.input('title', sql.NVarChar(255), data.title)
		.input('description', sql.NVarChar(sql.MAX), data.description || null)
		.input('status', sql.VarChar(20), data.status || 'draft')
		.query(`
      DECLARE @new_id VARCHAR(20) = 'KH' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO training_plans (id, department_id, year, title, description, status, created_by)
      VALUES (@new_id, @department_id, @year, @title, @description, @status, @actor_id);
      SELECT @new_id AS id;
    `);
	const id = result.recordset[0].id;
	if (Array.isArray(data.items) && data.items.length) await setItems(id, data.items, actorId);
	broadcast('update', { entity: 'training_plan' });
	return getById(id);
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool.request().input('id', sql.VarChar(20), id).input('actor_id', sql.VarChar(20), actorId);

	if (data.department_id !== undefined) {
		sets.push('department_id = @department_id');
		req.input('department_id', sql.VarChar(20), data.department_id || null);
	}
	if (data.year !== undefined) {
		sets.push('year = @year');
		req.input('year', sql.Int, data.year);
	}
	if (data.title !== undefined) {
		sets.push('title = @title');
		req.input('title', sql.NVarChar(255), data.title);
	}
	if (data.description !== undefined) {
		sets.push('description = @description');
		req.input('description', sql.NVarChar(sql.MAX), data.description || null);
	}
	if (data.status !== undefined) {
		sets.push('status = @status');
		req.input('status', sql.VarChar(20), data.status);
	}

	if (sets.length > 2) await req.query(`UPDATE training_plans SET ${sets.join(', ')} WHERE id = @id`);
	if (Array.isArray(data.items)) await setItems(id, data.items, actorId);
	broadcast('update', { entity: 'training_plan' });
	return getById(id);
};

const remove = async (id) => {
	const pool = await getPool();
	await pool.request().input('id', sql.VarChar(20), id).query('DELETE FROM training_plans WHERE id = @id');
	broadcast('update', { entity: 'training_plan' });
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	remove,
	listItems,
	setItems,
};
