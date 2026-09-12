const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const { paging } = require('../utils/paging');

// Đợt đào tạo — đơn giản hơn research_rounds (không round_number/round_type_id/
// public_token vì chưa có luồng đăng ký công khai ở giai đoạn này). Cửa sổ
// đăng ký khóa học nằm ngay trên bảng (enrollment_start/end_date) thay vì một
// bảng "giai đoạn" riêng như round_deadlines — xem giải thích trong migration.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const todayVN = () => {
	const vn = new Date(Date.now() + VN_OFFSET_MS);
	return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
};

const normalize = (r) => ({
	...r,
	enrollment_open: isEnrollmentOpenRow(r),
});

const isEnrollmentOpenRow = (r) => {
	if (!r.enrollment_start_date && !r.enrollment_end_date) return true; // chưa cấu hình = mở
	const today = todayVN();
	const afterStart = !r.enrollment_start_date || today >= new Date(r.enrollment_start_date);
	const beforeEnd = !r.enrollment_end_date || today <= new Date(r.enrollment_end_date);
	return afterStart && beforeEnd;
};

const isEnrollmentOpen = async (roundId) => {
	if (!roundId) return true;
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), roundId)
		.query('SELECT enrollment_start_date, enrollment_end_date FROM training_rounds WHERE id = @id');
	if (!r.recordset[0]) return true;
	return isEnrollmentOpenRow(r.recordset[0]);
};

const getAll = async ({ page = 1, limit = 20, year, status } = {}) => {
	const pool = await getPool();
	const pg = paging(page, limit, 100);
	const where = ['1=1'];
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	if (year) {
		where.push('r.year = @year');
		req.input('year', sql.Int, Number(year));
	}
	if (status) {
		where.push('r.status = @status');
		req.input('status', sql.VarChar(10), status);
	}
	const whereSql = `WHERE ${where.join(' AND ')}`;

	const result = await req.query(`
    SELECT r.*, (SELECT COUNT(*) FROM courses WHERE training_round_id = r.id) AS course_count
    FROM training_rounds r ${whereSql}
    ORDER BY r.year DESC, r.start_date DESC
    ${pg.fetchClause};
    SELECT COUNT(*) AS total FROM training_rounds r ${whereSql};
  `);
	return {
		data: result.recordsets[0].map(normalize),
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
	};
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query('SELECT * FROM training_rounds WHERE id = @id');
	return result.recordset[0] ? normalize(result.recordset[0]) : null;
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('name', sql.NVarChar(200), data.name)
		.input('year', sql.Int, Number(data.year) || new Date().getFullYear())
		.input('start_date', sql.Date, new Date(data.start_date))
		.input('end_date', sql.Date, new Date(data.end_date))
		.input('enrollment_start_date', sql.Date, data.enrollment_start_date || null)
		.input('enrollment_end_date', sql.Date, data.enrollment_end_date || null)
		.input('status', sql.VarChar(10), data.status || 'draft')
		.query(`
      DECLARE @new_id VARCHAR(20) = 'DT' + LEFT(REPLACE(NEWID(),'-',''), 18);
      EXEC sp_set_actor @actor_id;
      INSERT INTO training_rounds (id, name, year, start_date, end_date, enrollment_start_date, enrollment_end_date, status, created_by)
      VALUES (@new_id, @name, @year, @start_date, @end_date, @enrollment_start_date, @enrollment_end_date, @status, @actor_id);
      SELECT @new_id AS id;
    `);
	const id = result.recordset[0].id;
	broadcast('update', { entity: 'training_round' });
	return getById(id);
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool.request().input('id', sql.VarChar(20), id).input('actor_id', sql.VarChar(20), actorId);

	if (data.name !== undefined) {
		sets.push('name = @name');
		req.input('name', sql.NVarChar(200), data.name);
	}
	if (data.year !== undefined) {
		sets.push('year = @year');
		req.input('year', sql.Int, data.year);
	}
	if (data.start_date !== undefined) {
		sets.push('start_date = @start_date');
		req.input('start_date', sql.Date, new Date(data.start_date));
	}
	if (data.end_date !== undefined) {
		sets.push('end_date = @end_date');
		req.input('end_date', sql.Date, new Date(data.end_date));
	}
	if (data.enrollment_start_date !== undefined) {
		sets.push('enrollment_start_date = @enrollment_start_date');
		req.input('enrollment_start_date', sql.Date, data.enrollment_start_date || null);
	}
	if (data.enrollment_end_date !== undefined) {
		sets.push('enrollment_end_date = @enrollment_end_date');
		req.input('enrollment_end_date', sql.Date, data.enrollment_end_date || null);
	}
	if (data.status !== undefined) {
		sets.push('status = @status');
		req.input('status', sql.VarChar(10), data.status);
	}

	await req.query(`EXEC sp_set_actor @actor_id; UPDATE training_rounds SET ${sets.join(', ')} WHERE id = @id`);
	broadcast('update', { entity: 'training_round' });
	return getById(id);
};

const remove = async (id, actorId) => {
	const pool = await getPool();
	const linked = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query('SELECT COUNT(*) AS cnt FROM courses WHERE training_round_id = @id');
	if (linked.recordset[0].cnt > 0) {
		const err = new Error(
			`Không thể xoá đợt đào tạo vì đang có ${linked.recordset[0].cnt} khóa học liên kết.`,
		);
		err.statusCode = 409;
		throw err;
	}
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId)
		.query('EXEC sp_set_actor @actor_id; DELETE FROM training_rounds WHERE id = @id');
	broadcast('update', { entity: 'training_round' });
};

module.exports = { getAll, getById, create, update, remove, isEnrollmentOpen };
