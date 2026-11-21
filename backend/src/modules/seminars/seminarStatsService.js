// Thống kê / sổ đăng ký CME của Hội thảo — tách khỏi seminarService.js cho gọn
// (seminarService vẫn re-export các hàm này).
const { getPool, sql, queryAll, nowSql, upsert, ilike } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const { paging } = require('../../utils/paging');
const { httpError } = require('../../utils/httpError');

// Số người tham dự theo nhóm (dùng chung cho danh sách / chi tiết hội thảo ở seminarService).
const countSelect = `
  (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id) AS participant_count,
  (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id AND p.cme_seq IS NOT NULL) AS cme_issued_count,
  (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id AND p.source = 'internal') AS internal_count,
  (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id AND p.source = 'external' AND p.is_foreign = 'false') AS external_count,
  (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id AND p.is_foreign = 'true') AS foreign_count
`;

// File 1.4 — bảng tổng hợp hội thảo BV tổ chức
const statsHosted = async ({ year = undefined, from = undefined, to = undefined } = {}) => {
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
                    (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id AND p.source = 'internal' AND p.is_foreign = 'false')) AS eff_internal_count,
           COALESCE(s.manual_external_count,
                    (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id AND p.source = 'external' AND p.is_foreign = 'false')) AS eff_external_count,
           COALESCE(s.manual_foreign_count,
                    (SELECT COUNT(*) FROM seminar_participants p WHERE p.seminar_id = s.id AND p.is_foreign = 'true')) AS eff_foreign_count,
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
const statsCme = async ({ year = undefined } = {}) => {
	const pool = await getPool();
	const req = pool.request();
	const y = year ? parseInt(year, 10) : new Date().getFullYear();
	req.input('year', sql.Int, y);
	const r = await req.query(`
    SELECT
      (SELECT COALESCE(last_seq, 0) FROM cme_year_register WHERE year = @year) AS last_seq,
      COUNT(*) AS total,
      SUM(CASE WHEN participation_type = 'speaker' THEN 1 ELSE 0 END) AS speakers,
      SUM(CASE WHEN participation_type = 'attendee' THEN 1 ELSE 0 END) AS attendees,
      SUM(CASE WHEN source = 'internal' THEN 1 ELSE 0 END) AS internal_count,
      SUM(CASE WHEN source = 'external' THEN 1 ELSE 0 END) AS external_count,
      SUM(CASE WHEN cme_status = 'signed' THEN 1 ELSE 0 END) AS signed_count,
      COALESCE(SUM(cme_credits), 0) AS total_credits
    FROM seminar_participants
    WHERE cme_year = @year AND cme_seq IS NOT NULL;
  `);
	return { year: y, ...r.recordset[0] };
};

// Sổ cấp CME của một năm — mọi lượt cấp, sắp theo SQĐ
// limit=0 (mặc định) → lấy hết sổ của năm đó — cần cho luồng "thu hồi tất cả"
// (thu hồi mọi dòng khớp bộ lọc, kể cả trang chưa hiển thị trên UI).
const cmeRegister = async ({ year = undefined, search = undefined, page = 1, limit = 0 } = {}) => {
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
			`(${ilike('p.cme_certificate_no', '@search')} OR ${ilike('p.full_name', '@search')} OR ${ilike('p.organization', '@search')} OR ${ilike('s.title', '@search')})`,
		);
	}
	const where = `WHERE ${clauses.join(' AND ')}`;

	const sets = await queryAll(req, [
		`
      SELECT p.id, p.cme_year, p.cme_seq, p.cme_certificate_no, p.title_prefix,
             p.full_name, p.dob, p.dob_text, p.gender, p.organization, p.source,
             p.participation_type, p.cme_credits, p.cme_status, p.cme_issued_date, p.notes,
             s.id AS seminar_id, s.title AS seminar_title
      FROM seminar_participants p
      INNER JOIN seminars s ON s.id = p.seminar_id
      ${where}
      ORDER BY p.cme_seq
      ${pg.fetchClause}
		`,
		`
      SELECT COUNT(*) AS total
      FROM seminar_participants p
      INNER JOIN seminars s ON s.id = p.seminar_id
      ${where}
		`,
		`
      SELECT COALESCE(last_seq, 0) AS last_seq FROM cme_year_register WHERE year = @year
		`,
	]);
	return {
		year: y,
		last_seq: sets[2][0]?.last_seq ?? 0,
		entries: sets[0],
		pagination: { page: pg.page, limit: pg.limit, total: sets[1][0].total },
	};
};

const updateRegisterSeq = async (year, lastSeq, actorId) => {
	const pool = await getPool();
	const y = parseInt(year, 10);
	const seq = parseInt(lastSeq, 10);
	if (!y || Number.isNaN(seq) || seq < 0) {
		throw httpError(400, 'Năm hoặc số thứ tự không hợp lệ.');
	}
	const maxRes = await pool
		.request()
		.input('year', sql.Int, y)
		.query(
			`SELECT COALESCE(MAX(cme_seq), 0) AS max_seq FROM seminar_participants WHERE cme_year = @year`,
		);
	if (seq < maxRes.recordset[0].max_seq) {
		throw httpError(
			409,
			`Số cuối phải ≥ ${maxRes.recordset[0].max_seq} (số CME lớn nhất đã cấp trong năm ${y}).`,
		);
	}
	await pool
		.request()
		.input('year', sql.Int, y)
		.input('seq', sql.Int, seq)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			upsert({
				table: 'cme_year_register',
				key: ['year'],
				values: {
					year: '@year',
					last_seq: '@seq',
					created_by: '@actor_id',
					updated_by: '@actor_id',
				},
				update: { last_seq: '@seq', updated_at: nowSql, updated_by: '@actor_id' },
			}),
		);
	broadcast('update', { entity: 'seminar' });
	return { year: y, last_seq: seq };
};

module.exports = { countSelect, statsHosted, statsCme, cmeRegister, updateRegisterSeq };
