/**
 * cmeUserService.js — CME tích luỹ của 1 tài khoản (users.id). Dùng chung cho
 * cổng "của tôi" (portalService.getMyCme) và hồ sơ học viên (GET /trainees/:id/cme).
 * Caller tự kiểm tra quyền.
 */
const { getPool, sql } = require('../../config/db');
const { httpError } = require('../../utils/httpError');
const { RESULT_FILES_SQL, withResultFiles } = require('./cmeRecordService');

// CME trong 1 năm: 2 nguồn cộng dồn giống
// cmeRequirementService.getComplianceReport (tham dự hội thảo + ghi nhận độc lập),
// ngưỡng ưu tiên theo khoa rồi toàn viện.
// year = null → toàn bộ các năm (không có ngưỡng yêu cầu).
const getUserCme = async (userId, year) => {
	const pool = await getPool();
	const r = await pool.request().input('uid', sql.VarChar(20), userId).input('year', sql.Int, year)
		.query(`
    SELECT p.id, p.seminar_id, s.title AS seminar_title, s.event_type, s.scope, s.location,
           s.start_date, s.end_date, s.date_text, p.participation_type,
           p.cme_year, p.cme_certificate_no, p.cme_credits, p.cme_status, p.cme_issued_date
    FROM seminar_participants p
    JOIN seminars s ON s.id = p.seminar_id
    WHERE p.user_id = @uid
      AND (@year IS NULL OR p.cme_year = @year OR (p.cme_year IS NULL AND ISNULL(s.event_year, YEAR(s.start_date)) = @year))
    ORDER BY s.start_date DESC;

    SELECT r.id, r.title, r.activity_date, r.end_date, r.year, r.role, r.quantity, r.credits, r.note,
           r.category_id, c.name AS category_name, r.approval_status, r.reject_reason, r.source_type,
           f.file_name AS evidence_file_name, f.file_url AS evidence_file_url,
           CAST(CASE WHEN r.evidence_file_id IS NULL THEN 0 ELSE 1 END AS BIT) AS has_evidence,
           ${RESULT_FILES_SQL}
    FROM cme_records r
    LEFT JOIN cme_credit_categories c ON c.id = r.category_id
    LEFT JOIN training_files f ON f.id = r.evidence_file_id AND f.is_deleted = 0
    WHERE r.user_id = @uid AND (@year IS NULL OR r.year = @year)
    ORDER BY r.year DESC, r.activity_date DESC, r.created_at DESC;

    SELECT TOP 1 req.required_credits
    FROM users u
    JOIN cme_requirements req ON req.year = @year
     AND (req.department_id = u.department_id OR req.department_id IS NULL)
    WHERE u.id = @uid
    ORDER BY CASE WHEN req.department_id IS NOT NULL THEN 0 ELSE 1 END;
  `);
	const [seminars, records, req] = r.recordsets;
	const sum = (rows, key) => rows.reduce((t, x) => t + Number(x[key] || 0), 0);
	const earned =
		sum(
			seminars.filter((p) => (year == null ? p.cme_year != null : p.cme_year === year)),
			'cme_credits',
		) +
		sum(
			records.filter((x) => x.approval_status === 'approved'),
			'credits',
		);
	return {
		year,
		required_credits: req[0]?.required_credits ?? null,
		earned_credits: Math.round(earned * 100) / 100,
		seminars,
		records: records.map(withResultFiles),
	};
};

// CME toàn bộ các năm của học viên (theo tài khoản gắn với học viên).
// Học viên chưa có tài khoản → null.
const getTraineeCme = async (traineeId) => {
	const pool = await getPool();
	const t = (
		await pool
			.request()
			.input('id', sql.VarChar(20), traineeId)
			.query('SELECT user_id FROM trainees WHERE id = @id')
	).recordset[0];
	if (!t) throw httpError(404, 'Không tìm thấy học viên.');
	if (!t.user_id) return null;
	return getUserCme(t.user_id, null);
};

module.exports = { getUserCme, getTraineeCme };
