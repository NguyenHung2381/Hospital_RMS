const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');

// Ngưỡng tín chỉ CME theo năm — toàn viện (department_id NULL) hoặc riêng
// theo khoa/phòng (ghi đè ngưỡng toàn viện cho khoa đó).
const getAll = async ({ year } = {}) => {
	const pool = await getPool();
	const req = pool.request();
	let where = '1=1';
	if (year) {
		where += ' AND r.year = @year';
		req.input('year', sql.Int, Number(year));
	}
	const result = await req.query(`
    SELECT r.*, d.name AS department_name
    FROM cme_requirements r
    LEFT JOIN departments d ON d.id = r.department_id
    WHERE ${where}
    ORDER BY r.year DESC, d.name
  `);
	return result.recordset;
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('year', sql.Int, Number(data.year))
		.input('required_credits', sql.Decimal(6, 2), Number(data.required_credits))
		.input('department_id', sql.VarChar(20), data.department_id || null)
		.input('note', sql.NVarChar(255), data.note || null)
		.query(`
      DECLARE @new_id VARCHAR(20) = 'CR' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO cme_requirements (id, year, required_credits, department_id, note, created_by)
      VALUES (@new_id, @year, @required_credits, @department_id, @note, @actor_id);
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'cme_requirement' });
	return { id: result.recordset[0].id };
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool.request().input('id', sql.VarChar(20), id).input('actor_id', sql.VarChar(20), actorId);

	if (data.required_credits !== undefined) {
		sets.push('required_credits = @required_credits');
		req.input('required_credits', sql.Decimal(6, 2), Number(data.required_credits));
	}
	if (data.note !== undefined) {
		sets.push('note = @note');
		req.input('note', sql.NVarChar(255), data.note || null);
	}
	await req.query(`UPDATE cme_requirements SET ${sets.join(', ')} WHERE id = @id`);
	broadcast('update', { entity: 'cme_requirement' });
};

const remove = async (id) => {
	const pool = await getPool();
	await pool.request().input('id', sql.VarChar(20), id).query('DELETE FROM cme_requirements WHERE id = @id');
	broadcast('update', { entity: 'cme_requirement' });
};

// Danh sách nhân sự CHƯA đạt ngưỡng tín chỉ CME của năm — ưu tiên ngưỡng
// riêng theo khoa/phòng, nếu khoa chưa cấu hình thì dùng ngưỡng toàn viện
// (department_id NULL). Nhân sự thuộc khoa/phòng không có ngưỡng nào áp dụng
// (không có cả ngưỡng riêng lẫn ngưỡng toàn viện) thì bỏ qua, không tính "chưa đạt".
const getComplianceReport = async (year) => {
	const pool = await getPool();
	const result = await pool.request().input('year', sql.Int, Number(year)).query(`
    SELECT u.id, u.full_name, u.department_id, d.name AS department_name,
           req.required_credits,
           ISNULL(SUM(CASE WHEN p.cme_year = @year THEN p.cme_credits ELSE 0 END), 0) AS earned_credits
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN seminar_participants p ON p.user_id = u.id
    OUTER APPLY (
      SELECT TOP 1 required_credits
      FROM cme_requirements
      WHERE year = @year AND (department_id = u.department_id OR department_id IS NULL)
      ORDER BY CASE WHEN department_id IS NOT NULL THEN 0 ELSE 1 END
    ) req
    WHERE u.is_active = 1 AND req.required_credits IS NOT NULL
    GROUP BY u.id, u.full_name, u.department_id, d.name, req.required_credits
    HAVING ISNULL(SUM(CASE WHEN p.cme_year = @year THEN p.cme_credits ELSE 0 END), 0) < req.required_credits
    ORDER BY d.name, u.full_name
  `);
	return result.recordset;
};

module.exports = { getAll, create, update, remove, getComplianceReport };
