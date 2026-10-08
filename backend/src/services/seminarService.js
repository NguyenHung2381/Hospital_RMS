/**
 * seminarService.js — Quản lý Hội thảo / Hội nghị (bảng seminars).
 *
 * Độc lập với nghiệp vụ NCKH. Danh sách người tham dự nằm ở
 * seminarParticipantService; ở đây chỉ CRUD sự kiện + số liệu tổng hợp.
 */
const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const { paging } = require('../utils/paging');
const { splitList, inClause, buildWhere } = require('../utils/sqlFilters');

const EVENT_TYPES = [
	'conference',
	'sci_seminar',
	'intl_seminar',
	'sci_conference',
	'training',
	'other',
];
const SCOPES = ['external', 'hosted'];

const genIdExpr = `'SEM' + LEFT(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''), 17)`;

// Cột đếm dùng chung cho list + detail
const countSelect = `
  (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id) AS participant_count,
  (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id AND p.cme_seq IS NOT NULL) AS cme_issued_count,
  (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id AND p.source = 'internal') AS internal_count,
  (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id AND p.source = 'external' AND p.is_foreign = 0) AS external_count,
  (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id AND p.is_foreign = 1) AS foreign_count
`;

const getAll = async ({
	page = 1,
	limit = 20,
	search,
	scope,
	event_type,
	year,
	grants_cme,
} = {}) => {
	const pool = await getPool();
	const pg = paging(page, limit, 20);
	const req = pool
		.request()
		.input('offset', sql.Int, pg.offset)
		.input('limit', sql.Int, pg.limit);

	const clauses = [];
	if (search) {
		req.input('search', sql.NVarChar, `%${search}%`);
		clauses.push(
			'(s.title LIKE @search OR s.location LIKE @search OR s.speakers LIKE @search OR s.host_chair LIKE @search)',
		);
	}
	clauses.push(inClause(req, 's.scope', 'sc', splitList(scope), sql.VarChar));
	clauses.push(
		inClause(req, 's.event_type', 'et', splitList(event_type), sql.VarChar),
	);
	if (year !== undefined && year !== '' && year !== null) {
		req.input('year', sql.Int, parseInt(year, 10));
		clauses.push('s.event_year = @year');
	}
	if (grants_cme === '1' || grants_cme === 'true' || grants_cme === true) {
		clauses.push('s.grants_cme = 1');
	}
	const where = buildWhere(clauses);

	const result = await req.query(`
    SELECT s.*, ${countSelect}
    FROM seminars s
    ${where}
    ORDER BY COALESCE(s.start_date, s.created_at) DESC, s.created_at DESC
    ${pg.fetchClause};

    SELECT COUNT(*) AS total FROM seminars s ${where};
  `);
	return {
		data: result.recordsets[0],
		pagination: {
			page: pg.page,
			limit: pg.limit,
			total: result.recordsets[1][0].total,
		},
	};
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query(`
      SELECT s.*, ${countSelect} FROM seminars s WHERE s.id = @id;

      SELECT p.*,
             u.full_name  AS user_full_name,
             u.staff_number AS user_staff_number,
             d.name       AS user_department_name
      FROM seminar_participants p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE p.seminar_id = @id
      ORDER BY
        CASE p.participation_type WHEN 'chair' THEN 0 WHEN 'speaker' THEN 1
             WHEN 'organizer' THEN 2 WHEN 'attendee' THEN 3 ELSE 4 END,
        p.cme_seq, p.full_name;
    `);
	const seminar = result.recordsets[0][0];
	if (!seminar) return null;
	seminar.participants = result.recordsets[1];
	return seminar;
};

// ─── Chuẩn hoá payload ───────────────────────────────────────────────────────
const normalizeType = (t) => (EVENT_TYPES.includes(t) ? t : 'other');
const normalizeScope = (s) => (SCOPES.includes(s) ? s : 'external');
const yearOf = (data) => {
	if (data.event_year) return parseInt(data.event_year, 10) || null;
	const d = data.start_date || data.date_text;
	const m = d && String(d).match(/(20\d{2})/);
	return m ? parseInt(m[1], 10) : null;
};

// Bài test cuối buổi: [{ q, options: [..≥2], answer: index }] — trắc nghiệm 1
// đáp án, chấm tự động khi nộp (seminarParticipantService.submitTest).
const badQuestions = (msg) => Object.assign(new Error(msg), { statusCode: 400 });
const normalizeTestQuestions = (raw) => {
	if (raw === null || raw === '') return null;
	if (!Array.isArray(raw)) throw badQuestions('Danh sách câu hỏi không hợp lệ.');
	if (!raw.length) return null;
	const out = raw.map((x, i) => {
		const q = String(x?.q ?? '').trim();
		const options = (Array.isArray(x?.options) ? x.options : []).map((o) => String(o ?? '').trim());
		const answer = Number(x?.answer);
		if (!q) throw badQuestions(`Câu ${i + 1}: chưa nhập nội dung câu hỏi.`);
		if (options.length < 2) throw badQuestions(`Câu ${i + 1}: cần ít nhất 2 phương án.`);
		// Không tự lọc phương án trống — lọc sẽ làm lệch chỉ số đáp án đúng
		if (options.some((o) => !o)) throw badQuestions(`Câu ${i + 1}: có phương án để trống.`);
		if (!Number.isInteger(answer) || answer < 0 || answer >= options.length)
			throw badQuestions(`Câu ${i + 1}: chưa chọn đáp án đúng.`);
		return { q, options, answer };
	});
	return JSON.stringify(out);
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('title', sql.NVarChar(500), data.title)
		.input('event_type', sql.VarChar(30), normalizeType(data.event_type))
		.input('event_type_raw', sql.NVarChar(100), data.event_type_raw || null)
		.input('scope', sql.VarChar(20), normalizeScope(data.scope))
		.input('location', sql.NVarChar(255), data.location || null)
		.input('start_date', sql.Date, data.start_date || null)
		.input('end_date', sql.Date, data.end_date || null)
		.input('date_text', sql.NVarChar(100), data.date_text || null)
		.input('event_year', sql.Int, yearOf(data))
		.input('host_chair', sql.NVarChar(255), data.host_chair || null)
		.input('speakers', sql.NVarChar(sql.MAX), data.speakers || null)
		.input('permit_doc_no', sql.NVarChar(255), data.permit_doc_no || null)
		.input('co_organizers', sql.NVarChar(500), data.co_organizers || null)
		.input('grants_cme', sql.Bit, data.grants_cme ? 1 : 0)
		.input('cme_default_credits', sql.Decimal(4, 1), data.cme_default_credits ?? null)
		.input('coordinator', sql.NVarChar(100), data.coordinator || null)
		.input('notes', sql.NVarChar(sql.MAX), data.notes || null)
		.input('manual_participant_count', sql.Int, data.manual_participant_count ?? null)
		.input('manual_internal_count', sql.Int, data.manual_internal_count ?? null)
		.input('manual_external_count', sql.Int, data.manual_external_count ?? null)
		.input('manual_foreign_count', sql.Int, data.manual_foreign_count ?? null)
		.input('manual_cme_count', sql.Int, data.manual_cme_count ?? null)
		.query(`
      DECLARE @new_id VARCHAR(20) = ${genIdExpr};
      EXEC sp_set_actor @actor_id;
      INSERT INTO seminars
        (id, title, event_type, event_type_raw, scope, location, start_date, end_date,
         date_text, event_year, host_chair, speakers, permit_doc_no, co_organizers,
         grants_cme, cme_default_credits, coordinator, notes,
         manual_participant_count, manual_internal_count, manual_external_count,
         manual_foreign_count, manual_cme_count, public_token, created_by)
      VALUES
        (@new_id, @title, @event_type, @event_type_raw, @scope, @location, @start_date, @end_date,
         @date_text, @event_year, @host_chair, @speakers, @permit_doc_no, @co_organizers,
         @grants_cme, @cme_default_credits, @coordinator, @notes,
         @manual_participant_count, @manual_internal_count, @manual_external_count,
         @manual_foreign_count, @manual_cme_count,
         LOWER(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', '')), @actor_id);
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'seminar' });
	return getById(result.recordset[0].id);
};

const FIELD_TYPES = {
	title: sql.NVarChar(500),
	event_type_raw: sql.NVarChar(100),
	location: sql.NVarChar(255),
	start_date: sql.Date,
	end_date: sql.Date,
	date_text: sql.NVarChar(100),
	host_chair: sql.NVarChar(255),
	speakers: sql.NVarChar(sql.MAX),
	permit_doc_no: sql.NVarChar(255),
	co_organizers: sql.NVarChar(500),
	cme_default_credits: sql.Decimal(4, 1),
	coordinator: sql.NVarChar(100),
	notes: sql.NVarChar(sql.MAX),
	manual_participant_count: sql.Int,
	manual_internal_count: sql.Int,
	manual_external_count: sql.Int,
	manual_foreign_count: sql.Int,
	manual_cme_count: sql.Int,
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId);

	for (const [key, type] of Object.entries(FIELD_TYPES)) {
		if (data[key] !== undefined) {
			sets.push(`${key} = @${key}`);
			req.input(key, type, data[key] === '' ? null : data[key]);
		}
	}
	if (data.event_type !== undefined) {
		sets.push('event_type = @event_type');
		req.input('event_type', sql.VarChar(30), normalizeType(data.event_type));
	}
	if (data.scope !== undefined) {
		sets.push('scope = @scope');
		req.input('scope', sql.VarChar(20), normalizeScope(data.scope));
	}
	if (data.grants_cme !== undefined) {
		sets.push('grants_cme = @grants_cme');
		req.input('grants_cme', sql.Bit, data.grants_cme ? 1 : 0);
	}
	if (data.test_open !== undefined) {
		sets.push('test_open = @test_open');
		req.input('test_open', sql.Bit, data.test_open ? 1 : 0);
	}
	if (data.test_questions !== undefined) {
		sets.push('test_questions = @test_questions');
		req.input('test_questions', sql.NVarChar(sql.MAX), normalizeTestQuestions(data.test_questions));
	}
	if (data.event_year !== undefined || data.start_date !== undefined) {
		sets.push('event_year = @event_year');
		req.input('event_year', sql.Int, yearOf(data));
	}

	await req.query(
		`EXEC sp_set_actor @actor_id; UPDATE seminars SET ${sets.join(', ')} WHERE id = @id`,
	);
	broadcast('update', { entity: 'seminar' });
	return getById(id);
};

// Chặn xoá khi còn người đã được cấp số CME (tránh mất số trong sổ năm).
const remove = async (id, actorId) => {
	const pool = await getPool();
	const check = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query(
			`SELECT COUNT(*) AS n FROM seminar_participants WHERE seminar_id = @id AND cme_seq IS NOT NULL`,
		);
	if (check.recordset[0].n > 0) {
		const err = new Error(
			`Không thể xoá: đã có ${check.recordset[0].n} người được cấp số CME trong sự kiện này. Hãy thu hồi số CME trước.`,
		);
		err.statusCode = 409;
		throw err;
	}
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			`EXEC sp_set_actor @actor_id; DELETE FROM seminars WHERE id = @id`,
		);
	broadcast('update', { entity: 'seminar' });
};

// ─── Thống kê ────────────────────────────────────────────────────────────────

// File 1.4 — bảng tổng hợp hội thảo BV tổ chức
const statsHosted = async ({ year, from, to } = {}) => {
	const pool = await getPool();
	const req = pool.request();
	const clauses = ["s.scope = 'hosted'"];
	if (year) {
		req.input('year', sql.Int, parseInt(year, 10));
		clauses.push('s.event_year = @year');
	}
	if (from) {
		req.input('from', sql.Date, from);
		clauses.push('s.start_date >= @from');
	}
	if (to) {
		req.input('to', sql.Date, to);
		clauses.push('s.start_date <= @to');
	}
	const r = await req.query(`
    SELECT s.id, s.title, s.start_date, s.end_date, s.date_text, s.location,
           s.host_chair, s.speakers, s.permit_doc_no, s.co_organizers, s.notes,
           ${countSelect},
           -- số hiển thị: ưu tiên số nhập tay, fallback về đếm từ danh sách chi tiết
           COALESCE(s.manual_internal_count,
                    (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id AND p.source = 'internal' AND p.is_foreign = 0)) AS eff_internal_count,
           COALESCE(s.manual_external_count,
                    (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id AND p.source = 'external' AND p.is_foreign = 0)) AS eff_external_count,
           COALESCE(s.manual_foreign_count,
                    (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id AND p.is_foreign = 1)) AS eff_foreign_count,
           COALESCE(s.manual_participant_count,
                    (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id)) AS eff_participant_count,
           COALESCE(s.manual_cme_count,
                    (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id AND p.cme_seq IS NOT NULL)) AS eff_cme_count
    FROM seminars s
    WHERE ${clauses.join(' AND ')}
    ORDER BY COALESCE(s.start_date, s.created_at);
  `);
	return r.recordset;
};

// Thống kê CME theo năm
const statsCme = async ({ year } = {}) => {
	const pool = await getPool();
	const req = pool.request();
	const y = year ? parseInt(year, 10) : new Date().getFullYear();
	req.input('year', sql.Int, y);
	const r = await req.query(`
    SELECT
      (SELECT ISNULL(last_seq, 0) FROM cme_year_register WHERE [year] = @year) AS last_seq,
      COUNT(*) AS total,
      SUM(CASE WHEN participation_type = 'speaker' THEN 1 ELSE 0 END) AS speakers,
      SUM(CASE WHEN participation_type = 'attendee' THEN 1 ELSE 0 END) AS attendees,
      SUM(CASE WHEN source = 'internal' THEN 1 ELSE 0 END) AS internal_count,
      SUM(CASE WHEN source = 'external' THEN 1 ELSE 0 END) AS external_count,
      SUM(CASE WHEN cme_status = 'signed' THEN 1 ELSE 0 END) AS signed_count,
      ISNULL(SUM(cme_credits), 0) AS total_credits
    FROM seminar_participants
    WHERE cme_year = @year AND cme_seq IS NOT NULL;
  `);
	return { year: y, ...r.recordset[0] };
};

// Sổ cấp CME của một năm — mọi lượt cấp, sắp theo SQĐ
// limit=0 (mặc định) → lấy hết sổ của năm đó — cần cho luồng "thu hồi tất cả"
// (thu hồi mọi dòng khớp bộ lọc, kể cả trang chưa hiển thị trên UI).
const cmeRegister = async ({ year, search, page = 1, limit = 0 } = {}) => {
	const pool = await getPool();
	const y = year ? parseInt(year, 10) : new Date().getFullYear();
	const pg = paging(page, limit, 25);
	const req = pool
		.request()
		.input('year', sql.Int, y)
		.input('offset', sql.Int, pg.offset)
		.input('limit', sql.Int, pg.limit);

	const clauses = ['p.cme_year = @year', 'p.cme_seq IS NOT NULL'];
	if (search) {
		req.input('search', sql.NVarChar, `%${search}%`);
		clauses.push(
			'(p.cme_certificate_no LIKE @search OR p.full_name LIKE @search OR p.organization LIKE @search OR s.title LIKE @search)',
		);
	}
	const where = `WHERE ${clauses.join(' AND ')}`;

	const r = await req.query(`
      SELECT p.id, p.cme_year, p.cme_seq, p.cme_certificate_no, p.title_prefix,
             p.full_name, p.dob, p.dob_text, p.gender, p.organization, p.source,
             p.participation_type, p.cme_credits, p.cme_status, p.cme_issued_date, p.notes,
             s.id AS seminar_id, s.title AS seminar_title
      FROM seminar_participants p
      INNER JOIN seminars s ON s.id = p.seminar_id
      ${where}
      ORDER BY p.cme_seq
      ${pg.fetchClause};

      SELECT COUNT(*) AS total
      FROM seminar_participants p
      INNER JOIN seminars s ON s.id = p.seminar_id
      ${where};

      SELECT ISNULL(last_seq, 0) AS last_seq FROM cme_year_register WHERE [year] = @year;
    `);
	return {
		year: y,
		last_seq: r.recordsets[2][0]?.last_seq ?? 0,
		entries: r.recordsets[0],
		pagination: { page: pg.page, limit: pg.limit, total: r.recordsets[1][0].total },
	};
};

const updateRegisterSeq = async (year, lastSeq, actorId) => {
	const pool = await getPool();
	const y = parseInt(year, 10);
	const seq = parseInt(lastSeq, 10);
	if (!y || Number.isNaN(seq) || seq < 0) {
		const err = new Error('Năm hoặc số thứ tự không hợp lệ.');
		err.statusCode = 400;
		throw err;
	}
	const maxRes = await pool
		.request()
		.input('year', sql.Int, y)
		.query(
			`SELECT ISNULL(MAX(cme_seq), 0) AS max_seq FROM seminar_participants WHERE cme_year = @year`,
		);
	if (seq < maxRes.recordset[0].max_seq) {
		const err = new Error(
			`Số cuối phải ≥ ${maxRes.recordset[0].max_seq} (số CME lớn nhất đã cấp trong năm ${y}).`,
		);
		err.statusCode = 409;
		throw err;
	}
	await pool
		.request()
		.input('year', sql.Int, y)
		.input('seq', sql.Int, seq)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`
      MERGE cme_year_register AS t
      USING (SELECT @year AS y) AS s ON t.[year] = s.y
      WHEN MATCHED THEN UPDATE SET last_seq = @seq, updated_at = GETDATE(), updated_by = @actor_id
      WHEN NOT MATCHED THEN INSERT ([year], last_seq, created_by, updated_by) VALUES (@year, @seq, @actor_id, @actor_id);
    `);
	broadcast('update', { entity: 'seminar' });
	return { year: y, last_seq: seq };
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	remove,
	statsHosted,
	statsCme,
	cmeRegister,
	updateRegisterSeq,
	EVENT_TYPES,
	SCOPES,
};
