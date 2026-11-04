const {
	getPool,
	sql,
	withActorTransaction,
	actorRequest,
	queryAll,
	nowSql,
} = require('../../config/db');
const { genDeptId } = require('../../utils/idGenerator');
const { broadcast } = require('../events/eventService');
const { paging } = require('../../utils/paging');
const { remember, invalidate } = require('../../utils/cache');

const CACHE_PREFIX = 'lookup:departments:';

const departmentSelect = `
  SELECT d.*,
         hu.full_name AS head_full_name,
         COALESCE(uc.user_count, 0) AS user_count,
         COALESCE(tc.topic_count, 0) AS topic_count
  FROM departments d
  LEFT JOIN users hu ON hu.id = d.head_user_id
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

const getAll = async ({ page = 1, limit = 100, search = undefined } = {}) => {
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
			where +=
				' AND (d.name LIKE @search OR d.code LIKE @search OR d.abbreviation LIKE @search OR d.description LIKE @search)';
			req.input('search', sql.NVarChar, `%${search}%`);
		}

		const sets = await queryAll(req, [
			`
      ${departmentSelect}
      ${where}
      ORDER BY d.created_at DESC
      ${pg.fetchClause}
			`,
			`
      SELECT COUNT(*) AS total FROM departments ${where}
			`,
		]);
		return {
			data: sets[0],
			pagination: { page: pg.page, limit: pg.limit, total: sets[1][0].total },
		};
	});
};

const getById = async (id) => {
	return remember(`${CACHE_PREFIX}id:${id}`, 300, async () => {
		const pool = await getPool();
		const result = await pool.request().input('id', sql.VarChar(20), id).query(`
        ${departmentSelect}
        WHERE d.id = @id
      `);
		return result.recordset[0] || null;
	});
};

const create = async (data, actorId) => {
	// Mã DVxxx sinh ở đây (trước là trigger trg_dept_gen_id — INSTEAD OF INSERT bỏ
	// mất mã truyền vào và các cột nó không chép; migration 2026-12-14 đã bỏ trigger).
	const newId = await withActorTransaction(actorId, async (tx) => {
		const id = await genDeptId(tx);
		await tx
			.request()
			.input('actor_id', sql.VarChar(20), actorId)
			.input('id', sql.VarChar(20), id)
			.input('name', sql.NVarChar(255), data.name)
			.input('code', sql.VarChar(20), data.code)
			.input('abbreviation', sql.VarChar(20), data.abbreviation)
			.input('description', sql.NVarChar(sql.MAX), data.description || null)
			.input('specialty_group', sql.NVarChar(100), data.specialty_group || null)
			.input('unit_type', sql.VarChar(20), data.unit_type || 'khoa')
			.input('head_user_id', sql.VarChar(20), data.head_user_id || null)
			.input('phone', sql.VarChar(20), data.phone || null)
			.input('email', sql.VarChar(100), data.email || null)
			.input('bed_count', sql.Int, data.bed_count ?? null).query(`
      INSERT INTO departments (id, name, code, abbreviation, description, specialty_group, unit_type, head_user_id, phone, email, bed_count, created_by)
      VALUES (@id, @name, @code, @abbreviation, @description, @specialty_group, @unit_type, @head_user_id, @phone, @email, @bed_count, @actor_id);
    `);
		return id;
	});
	await invalidate(CACHE_PREFIX);
	const dept = await getById(newId);
	broadcast('update', { entity: 'department' });
	return dept;
};

const update = async (id, data, actorId) => {
	const sets = [`updated_at = ${nowSql}`, 'updated_by = @actor_id'];
	const req = actorRequest(actorId)
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
	if (data.unit_type !== undefined) {
		sets.push('unit_type = @unit_type');
		req.input('unit_type', sql.VarChar(20), data.unit_type);
	}
	if (data.head_user_id !== undefined) {
		sets.push('head_user_id = @head_user_id');
		req.input('head_user_id', sql.VarChar(20), data.head_user_id || null);
	}
	if (data.phone !== undefined) {
		sets.push('phone = @phone');
		req.input('phone', sql.VarChar(20), data.phone || null);
	}
	if (data.email !== undefined) {
		sets.push('email = @email');
		req.input('email', sql.VarChar(100), data.email || null);
	}
	if (data.bed_count !== undefined) {
		sets.push('bed_count = @bed_count');
		req.input('bed_count', sql.Int, data.bed_count ?? null);
	}

	await req.query(`UPDATE departments SET ${sets.join(', ')} WHERE id = @id`);
	await invalidate(CACHE_PREFIX);
	const dept = await getById(id);
	broadcast('update', { entity: 'department' });
	return dept;
};

// Xóa khoa/phòng: gỡ liên kết (set NULL) mọi bản ghi đang trỏ tới khoa này
// thay vì xóa kèm, để giữ lại user / đề tài. Riêng topic_related_departments có
// department_id NOT NULL nên phải xóa dòng. Toàn bộ chạy trong 1 transaction:
// câu nào lỗi thì withActorTransaction rollback cả.
const REMOVE_DEPT_SQL = [
	'UPDATE users SET department_id = NULL WHERE department_id = @id',
	'UPDATE topics SET department_id = NULL WHERE department_id = @id',
	'UPDATE topic_members SET department_id = NULL WHERE department_id = @id',
	'UPDATE departments SET parent_id = NULL WHERE parent_id = @id',
	'DELETE FROM topic_related_departments WHERE department_id = @id',
	'DELETE FROM departments WHERE id = @id',
];
const remove = async (id, actorId) => {
	await withActorTransaction(actorId, async (tx) => {
		for (const text of REMOVE_DEPT_SQL) {
			await tx.request().input('id', sql.VarChar(20), id).query(text);
		}
	});
	await invalidate(CACHE_PREFIX);
	broadcast('update', { entity: 'department' });
};

module.exports = { getAll, getById, create, update, remove };
