// @ts-nocheck — còn lỗi kiểu khi bật checkJs; sửa xong thì xoá dòng này (xem README, Kiểm tra chất lượng)
const { getPool, sql, withTransaction } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const { paging } = require('../../utils/paging');
const deadlineService = require('./deadlineService');
const { fmtDateVN: fmtDate } = require('../../utils/vnDate');
const { httpError } = require('../../utils/httpError');

const STATUS_TO_FRONT = { open: 'active' };
const STATUS_TO_DB = { active: 'open' };

// Cột phái sinh: cửa sổ "Đăng ký đề tài" (round_deadlines.deadline_type =
// 'topic_registration'). Khi đợt CHƯA cấu hình mốc này ⇒ registration_open = 1
// (giữ nguyên hành vi cũ). Khi đã cấu hình ⇒ chỉ mở trong khoảng [start, hạn].
const REG_WINDOW_COLS = `
       (SELECT MIN(rd.start_date) FROM round_deadlines rd
          WHERE rd.round_id = r.id AND rd.deadline_type = 'topic_registration')     AS registration_start,
       (SELECT MAX(rd.deadline_date) FROM round_deadlines rd
          WHERE rd.round_id = r.id AND rd.deadline_type = 'topic_registration')     AS registration_end,
       CAST(CASE
         WHEN NOT EXISTS (SELECT 1 FROM round_deadlines rd
                          WHERE rd.round_id = r.id AND rd.deadline_type = 'topic_registration') THEN 1
         WHEN EXISTS (SELECT 1 FROM round_deadlines rd
                      WHERE rd.round_id = r.id AND rd.deadline_type = 'topic_registration'
                        AND (rd.start_date IS NULL
                             OR rd.start_date <= CAST(DATEADD(HOUR, 7, GETUTCDATE()) AS DATE))
                        AND rd.deadline_date >= CAST(DATEADD(HOUR, 7, GETUTCDATE()) AS DATE)) THEN 1
         ELSE 0
       END AS BIT)                                                                  AS registration_open,
       (SELECT STRING_AGG(rl.level_id, ',') FROM research_round_levels rl
          WHERE rl.round_id = r.id)                                                  AS level_ids`;

const normalize = (r) => {
	const s = typeof r.status === 'string' ? r.status.trim().toLowerCase() : r.status;
	return {
		...r,
		status: STATUS_TO_FRONT[s] ?? s,
		start_date: fmtDate(r.start_date),
		end_date: fmtDate(r.end_date),
		created_at: fmtDate(r.created_at),
		updated_at: r.updated_at ? fmtDate(r.updated_at) : undefined,
		registration_open: r.registration_open === true || r.registration_open === 1,
		registration_start: r.registration_start ? fmtDate(r.registration_start) : null,
		registration_end: r.registration_end ? fmtDate(r.registration_end) : null,
		level_ids: r.level_ids ? String(r.level_ids).split(',') : [],
	};
};

// ─── Cấp độ đề tài theo đợt ──────────────────────────────────────────────────
// Ghi đè danh sách cấp độ của đợt (research_round_levels). `request` là hàm
// trả về sql.Request mới (của pool hoặc transaction). Id không tồn tại bị bỏ qua.
const writeLevels = async (request, roundId, levelIds) => {
	const ids = [...new Set((levelIds || []).filter(Boolean).map(String))];
	await request()
		.input('rid', sql.VarChar(10), roundId)
		.query('DELETE FROM research_round_levels WHERE round_id = @rid');
	for (const lid of ids) {
		await request().input('rid', sql.VarChar(10), roundId).input('lid', sql.VarChar(5), lid).query(`
				IF EXISTS (SELECT 1 FROM levels WHERE id = @lid)
				INSERT INTO research_round_levels (round_id, level_id) VALUES (@rid, @lid)`);
	}
};

// Cấp độ hợp lệ cho đề tài của một đợt: cấu hình riêng của đợt nếu có, không
// thì theo loại đợt (round_type_levels). [] ⇒ chưa giới hạn (cho phép tất cả).
const getAllowedLevelIds = async (roundId) => {
	if (!roundId) return [];
	const pool = await getPool();
	try {
		const r = await pool.request().input('rid', sql.VarChar(10), roundId).query(`
			SELECT level_id FROM research_round_levels WHERE round_id = @rid;
			SELECT rtl.level_id
			FROM research_rounds r
			JOIN round_type_levels rtl ON rtl.round_type_id = r.round_type_id
			WHERE r.id = @rid;`);
		const own = r.recordsets[0].map((x) => x.level_id);
		return own.length ? own : r.recordsets[1].map((x) => x.level_id);
	} catch {
		return []; // bảng chưa tồn tại (migration chưa chạy)
	}
};

const getAll = async ({ page = 1, limit = 20, year, status, public_token } = {}) => {
	const pool = await getPool();
	const pg = paging(page, limit);
	let where = 'WHERE 1=1';
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	if (year) {
		where += ' AND r.year = @year';
		req.input('year', sql.Int, Number(year));
	}
	if (status) {
		where += ' AND r.status = @status';
		// Front dùng 'active', DB lưu 'open' — phải đổi ngược khi lọc
		req.input('status', sql.VarChar(10), STATUS_TO_DB[status] ?? status);
	}
	if (public_token) {
		where += ' AND r.public_token = @public_token';
		req.input('public_token', sql.VarChar(255), public_token);
	}

	const result = await req.query(`
    SELECT r.*, u.full_name AS created_by_name, rt.name AS round_type_name,
           (SELECT COUNT(*) FROM topics WHERE round_id = r.id)                               AS topic_total,
           (SELECT COUNT(*) FROM topics WHERE round_id = r.id AND status = 'approved')       AS topic_active,
           (SELECT COUNT(*) FROM topics WHERE round_id = r.id AND status = 'submitted')      AS topic_pending,
           0                                                                                 AS topic_completed,
${REG_WINDOW_COLS}
    FROM research_rounds r
    LEFT JOIN users u ON u.id = r.created_by
    LEFT JOIN round_types rt ON rt.id = r.round_type_id
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
      SELECT r.*, u.full_name AS created_by_name, rt.name AS round_type_name,
             (SELECT COUNT(*) FROM topics WHERE round_id = r.id)                               AS topic_total,
             (SELECT COUNT(*) FROM topics WHERE round_id = r.id AND status = 'approved')       AS topic_active,
             (SELECT COUNT(*) FROM topics WHERE round_id = r.id AND status = 'submitted')      AS topic_pending,
             0                                                                                 AS topic_completed,
${REG_WINDOW_COLS}
      FROM research_rounds r
      LEFT JOIN users u ON u.id = r.created_by
      LEFT JOIN round_types rt ON rt.id = r.round_type_id
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
		throw httpError(409, `Đợt số ${round_number} năm ${year} đã tồn tại`);
	}

	// Mốc thời gian gửi kèm: kiểm tra hết trước khi ghi (ngày 'yyyy-mm-dd').
	const deadlineRows = deadlineService.prepareBatch(
		data.deadlines,
		String(data.start_date || '').slice(0, 10),
		String(data.end_date || '').slice(0, 10),
	);

	// Đợt + cấp độ + mốc thời gian ghi trong cùng một transaction.
	await withTransaction(async (tx) => {
		const req = new sql.Request(tx)
			.input('actor_id', sql.VarChar(20), actorId)
			.input('id', sql.VarChar(10), id)
			.input('name', sql.NVarChar(200), data.name)
			.input('year', sql.Int, year)
			.input('round_number', sql.TinyInt, round_number)
			.input('round_type_id', sql.VarChar(6), data.round_type_id || null)
			.input('start_date', sql.Date, new Date(data.start_date))
			.input('end_date', sql.Date, new Date(data.end_date))
			.input('status', sql.VarChar(10), STATUS_TO_DB[data.status] ?? data.status ?? 'draft');
		await req.query(`
        EXEC sp_set_actor @actor_id;
        INSERT INTO research_rounds
          (id, name, year, round_number, round_type_id, start_date, end_date, status, public_token, created_by)
        VALUES
          (@id, @name, @year, @round_number, @round_type_id, @start_date, @end_date, @status,
           LOWER(REPLACE(NEWID(),'-','')), @actor_id);
      `);
		if (Array.isArray(data.level_ids) && data.level_ids.length)
			await writeLevels(() => new sql.Request(tx), id, data.level_ids);
		await deadlineService.insertBatch(tx, id, deadlineRows, actorId);
	}, pool);

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
	if (data.round_type_id !== undefined) {
		sets.push('round_type_id = @round_type_id');
		req.input('round_type_id', sql.VarChar(6), data.round_type_id || null);
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
		req.input('status', sql.VarChar(10), STATUS_TO_DB[data.status] ?? data.status);
	}
	await req.query(
		`EXEC sp_set_actor @actor_id; UPDATE research_rounds SET ${sets.join(', ')} WHERE id = @id`,
	);
	if (Array.isArray(data.level_ids)) await writeLevels(() => pool.request(), id, data.level_ids);
	const round = await getById(id);
	broadcast('update', { entity: 'round' });
	return round;
};

const remove = async (id, actorId) => {
	const pool = await getPool();

	const linked = await pool.request().input('id', sql.VarChar(10), id).query(`
			SELECT
				(SELECT COUNT(*) FROM topics WHERE round_id = @id) AS topics,
				(SELECT COUNT(*) FROM councils WHERE round_id = @id) AS councils,
				(SELECT COUNT(*) FROM round_deadlines WHERE round_id = @id) AS deadlines
		`);
	const { topics, councils, deadlines } = linked.recordset[0];
	const parts = [];
	if (topics) parts.push(`${topics} đề tài`);
	if (councils) parts.push(`${councils} hội đồng`);
	if (deadlines) parts.push(`${deadlines} mốc thời hạn`);
	if (parts.length) {
		throw httpError(
			409,
			`Không thể xóa đợt nghiên cứu vì đang có ${parts.join(', ')} liên kết. Hãy xóa hoặc chuyển sang đợt khác trước.`,
		);
	}

	await pool
		.request()
		.input('id', sql.VarChar(10), id)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`EXEC sp_set_actor @actor_id; DELETE FROM research_rounds WHERE id = @id`);
	broadcast('update', { entity: 'round' });
};

module.exports = {
	getAll,
	getById,
	getAllowedLevelIds,
	create,
	update,
	remove,
};
