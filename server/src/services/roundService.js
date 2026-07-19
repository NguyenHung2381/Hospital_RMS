const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const { paging } = require('../utils/paging');

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 (Asia/Ho_Chi_Minh)

const fmtDate = (d) => {
	if (!d) return '';
	const dt = d instanceof Date ? d : new Date(d);
	if (isNaN(dt.getTime())) return '';
	// Shift to Vietnam local time then read with UTC getters so the result
	// is correct regardless of the Node.js server's own timezone setting.
	const vnDt = new Date(dt.getTime() + VN_OFFSET_MS);
	const dd = String(vnDt.getUTCDate()).padStart(2, '0');
	const mm = String(vnDt.getUTCMonth() + 1).padStart(2, '0');
	return `${dd}/${mm}/${vnDt.getUTCFullYear()}`;
};

const STATUS_TO_FRONT = { open: 'active' };
const STATUS_TO_DB = { active: 'open' };

const normalize = (r) => {
	const s =
		typeof r.status === 'string' ? r.status.trim().toLowerCase() : r.status;
	return {
		...r,
		status: STATUS_TO_FRONT[s] ?? s,
		start_date: fmtDate(r.start_date),
		end_date: fmtDate(r.end_date),
		created_at: fmtDate(r.created_at),
		updated_at: r.updated_at ? fmtDate(r.updated_at) : undefined,
	};
};

const getAll = async ({
	page = 1,
	limit = 20,
	year,
	status,
	public_token,
} = {}) => {
	const pool = await getPool();
	const pg = paging(page, limit);
	let where = 'WHERE 1=1';
	const req = pool
		.request()
		.input('offset', sql.Int, pg.offset)
		.input('limit', sql.Int, pg.limit);

	if (year) {
		where += ' AND r.year = @year';
		req.input('year', sql.Int, Number(year));
	}
	if (status) {
		where += ' AND r.status = @status';
		req.input('status', sql.VarChar(10), status);
	}
	if (public_token) {
		where += ' AND r.public_token = @public_token';
		req.input('public_token', sql.VarChar(255), public_token);
	}

	const result = await req.query(`
    SELECT r.*, u.full_name AS created_by_name,
           (SELECT COUNT(*) FROM topics WHERE round_id = r.id)                               AS topic_total,
           (SELECT COUNT(*) FROM topics WHERE round_id = r.id AND status = 'approved')       AS topic_active,
           (SELECT COUNT(*) FROM topics WHERE round_id = r.id AND status = 'submitted')      AS topic_pending,
           0                                                                                 AS topic_completed
    FROM research_rounds r
    LEFT JOIN users u ON u.id = r.created_by
    ${where}
    ORDER BY r.year DESC, r.round_number DESC
    ${pg.fetchClause};

    SELECT COUNT(*) AS total FROM research_rounds r ${where};
  `);

	return {
		data: result.recordsets[0].map(normalize),
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
	};
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(10), id).query(`
      SELECT r.*, u.full_name AS created_by_name,
             (SELECT COUNT(*) FROM topics WHERE round_id = r.id)                               AS topic_total,
             (SELECT COUNT(*) FROM topics WHERE round_id = r.id AND status = 'approved')       AS topic_active,
             (SELECT COUNT(*) FROM topics WHERE round_id = r.id AND status = 'submitted')      AS topic_pending,
             0                                                                                 AS topic_completed
      FROM research_rounds r
      LEFT JOIN users u ON u.id = r.created_by
      WHERE r.id = @id
    `);
	return result.recordset[0] ? normalize(result.recordset[0]) : null;
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const year = Number(data.year) || new Date().getFullYear();
	const round_number = Number(data.round_number) || 1;

	// Dùng SP để sinh ID (đồng thời kiểm tra trùng)
	let id;
	try {
		const idResult = await pool
			.request()
			.input('year', sql.Int, year)
			.input('round_number', sql.TinyInt, round_number)
			.output('new_id', sql.VarChar(10))
			.execute('sp_gen_round_id');
		id = idResult.output.new_id;
	} catch (spErr) {
		const err = new Error(
			`Đợt số ${round_number} năm ${year} đã tồn tại`,
		);
		err.statusCode = 409;
		throw err;
	}

	const req = pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('id', sql.VarChar(10), id)
		.input('name', sql.NVarChar(200), data.name)
		.input('year', sql.Int, year)
		.input('round_number', sql.TinyInt, round_number)
		.input('round_type', sql.NVarChar(100), data.round_type || null)
		.input('start_date', sql.Date, new Date(data.start_date))
		.input('end_date', sql.Date, new Date(data.end_date))
		.input(
			'status',
			sql.VarChar(10),
			STATUS_TO_DB[data.status] ?? data.status ?? 'draft',
		);

	await req.query(`
      EXEC sp_set_actor @actor_id;
      INSERT INTO research_rounds
        (id, name, year, round_number, round_type, start_date, end_date, status, public_token, created_by)
      VALUES
        (@id, @name, @year, @round_number, @round_type, @start_date, @end_date, @status,
         LOWER(REPLACE(NEWID(),'-','')), @actor_id);
    `);

	const round = await getById(id);
	broadcast('update', { entity: 'round' });
	return round;
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool
		.request()
		.input('id', sql.VarChar(10), id)
		.input('actor_id', sql.VarChar(20), actorId);

	if (data.name !== undefined) {
		sets.push('name = @name');
		req.input('name', sql.NVarChar(200), data.name);
	}
	if (data.year !== undefined) {
		sets.push('year = @year');
		req.input('year', sql.Int, data.year);
	}
	if (data.round_number !== undefined) {
		sets.push('round_number = @round_number');
		req.input('round_number', sql.TinyInt, data.round_number);
	}
	if (data.round_type !== undefined) {
		sets.push('round_type = @round_type');
		req.input('round_type', sql.NVarChar(100), data.round_type || null);
	}
	if (data.start_date !== undefined) {
		sets.push('start_date = @start_date');
		req.input('start_date', sql.Date, new Date(data.start_date));
	}
	if (data.end_date !== undefined) {
		sets.push('end_date = @end_date');
		req.input('end_date', sql.Date, new Date(data.end_date));
	}
	if (data.status !== undefined) {
		sets.push('status = @status');
		req.input(
			'status',
			sql.VarChar(10),
			STATUS_TO_DB[data.status] ?? data.status,
		);
	}
	await req.query(
		`EXEC sp_set_actor @actor_id; UPDATE research_rounds SET ${sets.join(', ')} WHERE id = @id`,
	);
	const round = await getById(id);
	broadcast('update', { entity: 'round' });
	return round;
};

const remove = async (id, actorId) => {
	const pool = await getPool();

	const linked = await pool
		.request()
		.input('id', sql.VarChar(10), id)
		.query('SELECT COUNT(*) AS cnt FROM topics WHERE round_id = @id');
	const cnt = linked.recordset[0].cnt;
	if (cnt > 0) {
		const err = new Error(
			`Không thể xóa đợt nghiên cứu vì đang có ${cnt} đề tài liên kết. Hãy xóa hoặc chuyển đề tài sang đợt khác trước.`,
		);
		err.statusCode = 409;
		throw err;
	}

	await pool
		.request()
		.input('id', sql.VarChar(10), id)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			`EXEC sp_set_actor @actor_id; DELETE FROM research_rounds WHERE id = @id`,
		);
	broadcast('update', { entity: 'round' });
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	remove,
};
