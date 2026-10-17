const { getPool, sql } = require('../config/db');
const { broadcast } = require('../modules/events/eventService');
const { paging } = require('../utils/paging');

// Tiến độ: hạng mục "đã triển khai" khi có ít nhất 1 khóa học (chưa huỷ) mở theo nó
const planSelect = `
  SELECT p.*, d.name AS department_name,
         (SELECT COUNT(*) FROM training_plan_items i WHERE i.plan_id = p.id) AS item_count,
         (SELECT COUNT(*) FROM training_plan_items i WHERE i.plan_id = p.id
            AND EXISTS (SELECT 1 FROM courses c WHERE c.plan_item_id = i.id AND c.status <> 'cancelled')) AS done_item_count
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

// Hạng mục kèm các khóa học đã mở theo nó + số học viên đã duyệt (so với chỉ tiêu target_count)
const listItems = async (planId) => {
	const pool = await getPool();
	const r = await pool.request().input('plan_id', sql.VarChar(20), planId).query(`
    SELECT * FROM training_plan_items WHERE plan_id = @plan_id ORDER BY quarter ASC, created_at ASC;
    SELECT c.id, c.name, c.plan_item_id, c.start_date, c.end_date, c.status,
           (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id AND e.status = 'approved') AS approved_count
    FROM courses c
    JOIN training_plan_items i ON i.id = c.plan_item_id
    WHERE i.plan_id = @plan_id
    ORDER BY c.start_date, c.created_at;
  `);
	const [items, courses] = r.recordsets;
	return items.map((item) => {
		const own = courses.filter((c) => c.plan_item_id === item.id);
		return {
			...item,
			courses: own,
			trainee_count: own.filter((c) => c.status !== 'cancelled').reduce((n, c) => n + c.approved_count, 0),
		};
	});
};

// Ô chọn "Thuộc kế hoạch" ở form khóa học: hạng mục của các kế hoạch chưa huỷ/hoàn thành
const listItemOptions = async () => {
	const pool = await getPool();
	const r = await pool.request().query(`
    SELECT i.id, i.title, i.quarter, p.title AS plan_title, p.year
    FROM training_plan_items i
    JOIN training_plans p ON p.id = i.plan_id
    WHERE p.status IN ('draft', 'active')
    ORDER BY p.year DESC, p.title, i.quarter, i.created_at
  `);
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

// Hạng mục có id → cập nhật tại chỗ (giữ liên kết khóa học courses.plan_item_id),
// không id → thêm mới, hạng mục bị bỏ khỏi danh sách → xoá (khóa học liên kết về NULL).
const setItems = async (planId, items, actorId) => {
	const pool = await getPool();
	const keep = (items || []).filter((item) => item && item.title);
	const existing = new Set(
		(
			await pool
				.request()
				.input('plan_id', sql.VarChar(20), planId)
				.query('SELECT id FROM training_plan_items WHERE plan_id = @plan_id')
		).recordset.map((r) => r.id),
	);
	const keepIds = new Set(keep.map((item) => item.id).filter((id) => existing.has(id)));
	for (const id of [...existing].filter((id) => !keepIds.has(id))) {
		await pool.request().input('id', sql.VarChar(20), id).query(`
      UPDATE courses SET plan_item_id = NULL WHERE plan_item_id = @id;
      DELETE FROM training_plan_items WHERE id = @id;
    `);
	}
	for (const item of keep) {
		const req = pool
			.request()
			.input('plan_id', sql.VarChar(20), planId)
			.input('title', sql.NVarChar(255), item.title)
			.input('quarter', sql.Int, item.quarter || null)
			.input('target_count', sql.Int, item.target_count || null)
			.input('note', sql.NVarChar(sql.MAX), item.note || null)
			.input('actor_id', sql.VarChar(20), actorId);
		if (keepIds.has(item.id)) {
			await req.input('id', sql.VarChar(20), item.id).query(`
        UPDATE training_plan_items SET title = @title, quarter = @quarter, target_count = @target_count, note = @note
        WHERE id = @id AND plan_id = @plan_id;
      `);
		} else {
			await req.query(`
        DECLARE @new_id VARCHAR(20) = 'HM' + LEFT(REPLACE(NEWID(),'-',''), 18);
        INSERT INTO training_plan_items (id, plan_id, title, quarter, target_count, note, created_by)
        VALUES (@new_id, @plan_id, @title, @quarter, @target_count, @note, @actor_id);
      `);
		}
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
	await pool.request().input('id', sql.VarChar(20), id).query(`
    UPDATE courses SET plan_item_id = NULL
    WHERE plan_item_id IN (SELECT id FROM training_plan_items WHERE plan_id = @id);
    DELETE FROM training_plans WHERE id = @id;
  `);
	broadcast('update', { entity: 'training_plan' });
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	remove,
	listItems,
	listItemOptions,
	setItems,
};
