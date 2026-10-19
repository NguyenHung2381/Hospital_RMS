const { getPool, sql } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const { paging } = require('../../utils/paging');
const { httpError } = require('../../utils/httpError');

// Hồ sơ chứng chỉ hành nghề (CCHN) — 1 user 1 hồ sơ hiện hành (xem
// 2026-09-14_staff_practice_licenses.sql). Không tách bảng lịch sử, cập nhật
// tại chỗ giống pattern lecturers/trainees.
const licenseSelect = `
  SELECT sl.*, u.full_name AS user_full_name, u.staff_number, u.department_id, d.name AS department_name
  FROM staff_practice_licenses sl
  JOIN users u ON u.id = sl.user_id
  LEFT JOIN departments d ON d.id = u.department_id
`;

const getAll = async ({
	page = 1,
	limit = 20,
	search = undefined,
	department_id = undefined,
	has_license = undefined,
} = {}) => {
	const pool = await getPool();
	const pg = paging(page, limit, 100);
	const where = ['1=1'];
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	if (search) {
		where.push(
			'(u.full_name LIKE @search OR sl.license_no LIKE @search OR sl.practice_scope LIKE @search OR CAST(u.staff_number AS VARCHAR(20)) = @search_exact)',
		);
		req.input('search_exact', sql.VarChar(20), String(search).trim());
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	if (department_id) {
		where.push('u.department_id = @department_id');
		req.input('department_id', sql.VarChar(20), department_id);
	}
	if (has_license === '1') where.push('sl.license_no IS NOT NULL');
	if (has_license === '0') where.push('sl.license_no IS NULL');
	const whereSql = `WHERE ${where.join(' AND ')}`;

	const result = await req.query(`
    ${licenseSelect} ${whereSql} ORDER BY u.full_name
    ${pg.fetchClause};
    SELECT COUNT(*) AS total FROM staff_practice_licenses sl JOIN users u ON u.id = sl.user_id ${whereSql};
  `);
	return {
		data: result.recordsets[0],
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
	};
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query(`${licenseSelect} WHERE sl.id = @id`);
	return result.recordset[0] || null;
};

const getByUserId = async (userId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('user_id', sql.VarChar(20), userId)
		.query(`${licenseSelect} WHERE sl.user_id = @user_id`);
	return result.recordset[0] || null;
};

/** @type {Array<[string, any]>} [cột, kiểu SQL] */
const fieldDefs = [
	['license_no', sql.NVarChar(50)], // NVARCHAR từ 2026-11-09: số CCHN có chữ "Đ"
	['issued_date', sql.Date],
	['issuing_authority', sql.NVarChar(255)],
	['practice_scope', sql.NVarChar(500)],
	['primary_specialty', sql.NVarChar(255)],
	['cme_specialty', sql.NVarChar(300)],
	['qualification', sql.NVarChar(150)],
	['title', sql.NVarChar(150)],
	['notes', sql.NVarChar(500)],
	['scope_decision_no', sql.NVarChar(100)],
	['adjusted_scope', sql.NVarChar(500)],
	['scope_adjusted_date', sql.Date],
	['scope_code', sql.NVarChar(50)], // mã hoá phạm vi theo QĐ 2148 (BHXH)
];

/**
 * Tìm người hướng dẫn thực hành (NHD) — nhân sự (có MNV) đang hoạt động, gõ MNV
 * / tên / số CCHN. Trả đủ trường để chụp lại thông tin NHD trên hồ sơ thực hành
 * (Phiếu nhận xét: ông/bà, ngày sinh, trình độ, số CCHN, ngày cấp, phạm vi).
 * Người có CCHN xếp trước; licensed_only=1 thì chỉ lấy người có CCHN.
 */
const getMentors = async ({
	search = undefined,
	department_id = undefined,
	licensed_only = undefined,
	limit = 20,
} = {}) => {
	const pool = await getPool();
	const where = ['u.staff_number IS NOT NULL', 'u.is_active = 1'];
	const req = pool
		.request()
		.input('limit', sql.Int, Math.min(Math.max(parseInt(String(limit), 10) || 20, 1), 50));
	const q = String(search ?? '').trim();
	if (q) {
		where.push(
			'(u.full_name LIKE @search OR sl.license_no LIKE @search OR CAST(u.staff_number AS VARCHAR(20)) = @search_exact)',
		);
		req.input('search', sql.NVarChar, `%${q}%`);
		req.input('search_exact', sql.VarChar(20), q);
	}
	if (department_id) {
		where.push('u.department_id = @department_id');
		req.input('department_id', sql.VarChar(20), department_id);
	}
	if (licensed_only === '1' || licensed_only === true) where.push('sl.license_no IS NOT NULL');

	const result = await req.query(`
    SELECT TOP (@limit)
           u.id AS user_id, u.staff_number, u.full_name, u.date_of_birth, u.gender,
           COALESCE(sl.qualification, q.name) AS qualification,
           sl.license_no, sl.issued_date, sl.issuing_authority, sl.practice_scope, sl.scope_code,
           u.phone_number AS phone, u.department_id, d.name AS department_name
    FROM users u
    LEFT JOIN staff_practice_licenses sl ON sl.user_id = u.id
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN qualifications q ON q.id = u.qualification_id
    WHERE ${where.join(' AND ')}
    ORDER BY CASE WHEN sl.license_no IS NULL THEN 1 ELSE 0 END, u.full_name`);
	return result.recordset;
};

const create = async (data, actorId) => {
	if (!data.user_id) {
		throw httpError(400, 'Thiếu user_id');
	}
	const pool = await getPool();
	const req = pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('user_id', sql.VarChar(20), data.user_id);
	for (const [field, type] of fieldDefs) req.input(field, type, data[field] || null);

	const cols = ['id', 'user_id', ...fieldDefs.map(([f]) => f), 'created_by'];
	const vals = ['@new_id', '@user_id', ...fieldDefs.map(([f]) => `@${f}`), '@actor_id'];

	const result = await req.query(`
      DECLARE @new_id VARCHAR(20) = 'LIC' + LEFT(REPLACE(NEWID(),'-',''), 17);
      EXEC sp_set_actor @actor_id;
      INSERT INTO staff_practice_licenses (${cols.join(', ')})
      VALUES (${vals.join(', ')});
      SELECT @new_id AS id;
    `);
	const id = result.recordset[0].id;
	broadcast('update', { entity: 'staff_license' });
	return getById(id);
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId);

	for (const [field, type] of fieldDefs) {
		if (data[field] !== undefined) {
			sets.push(`${field} = @${field}`);
			req.input(field, type, data[field] || null);
		}
	}

	await req.query(
		`EXEC sp_set_actor @actor_id; UPDATE staff_practice_licenses SET ${sets.join(', ')} WHERE id = @id`,
	);
	broadcast('update', { entity: 'staff_license' });
	return getById(id);
};

const remove = async (id, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId)
		.query('EXEC sp_set_actor @actor_id; DELETE FROM staff_practice_licenses WHERE id = @id');
	broadcast('update', { entity: 'staff_license' });
};

module.exports = { getAll, getById, getByUserId, getMentors, create, update, remove, fieldDefs };
