/**
 * trainingReportService.js — báo cáo Đào tạo theo năm cho trang Báo cáo:
 *   1. courses()  — tổng hợp từng khóa học (trạng thái, chương trình, sĩ số, kết quả, chứng chỉ)
 *   2. trainees() — danh sách học viên đã duyệt + điểm, xếp loại, chuyên cần
 * Năm của khóa = năm ngày bắt đầu (chưa có ngày bắt đầu thì lấy ngày tạo).
 */
const { getPool, sql } = require('../../../config/db');
const { COURSE_DISPLAY_STATUS } = require('../../dashboard/dashboardService');

const COURSE_IN_YEAR = '(@year IS NULL OR YEAR(COALESCE(c.start_date, c.created_at)) = @year)';

/** @param {number|null} year */
const courses = async (year) => {
	const pool = await getPool();
	const r = await pool.request().input('year', sql.Int, year).query(`
    SELECT c.id, c.name, c.start_date, c.end_date, c.capacity,
           ${COURSE_DISPLAY_STATUS} AS status,
           (SELECT STRING_AGG(tp.name, ', ') FROM course_programs cp
              JOIN training_programs tp ON tp.id = cp.program_id
             WHERE cp.course_id = c.id) AS program_names,
           (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id) AS enrollments,
           (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id AND e.status = 'approved') AS approved,
           (SELECT COUNT(*) FROM grades g JOIN course_enrollments e ON e.id = g.enrollment_id
             WHERE e.course_id = c.id AND g.subject_id IS NULL AND g.result = 'pass') AS passed,
           (SELECT AVG(CAST(g.score AS FLOAT)) FROM grades g JOIN course_enrollments e ON e.id = g.enrollment_id
             WHERE e.course_id = c.id AND g.subject_id IS NULL) AS avg_score,
           (SELECT COUNT(*) FROM certificates ce JOIN course_enrollments e ON e.id = ce.enrollment_id
             WHERE e.course_id = c.id AND ce.status = 'active') AS certificates
    FROM courses c
    WHERE ${COURSE_IN_YEAR}
    ORDER BY COALESCE(c.start_date, c.created_at), c.name
  `);
	return r.recordset;
};

/** @param {number|null} year */
const trainees = async (year) => {
	const pool = await getPool();
	const r = await pool.request().input('year', sql.Int, year).query(`
    SELECT t.full_name AS trainee_name, d.name AS department_name,
           c.id AS course_id, c.name AS course_name,
           g.score, g.classification, g.result,
           att.attended, att.total_sessions
    FROM course_enrollments e
    JOIN trainees t ON t.id = e.trainee_id
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN grades g ON g.enrollment_id = e.id AND g.subject_id IS NULL
    OUTER APPLY (
      SELECT COUNT(*) AS total_sessions,
             SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS attended
      FROM class_sessions cs
      LEFT JOIN attendance a ON a.session_id = cs.id AND a.enrollment_id = e.id
      WHERE cs.course_id = e.course_id
    ) att
    WHERE e.status = 'approved' AND ${COURSE_IN_YEAR}
    ORDER BY COALESCE(c.start_date, c.created_at), c.name, t.full_name
  `);
	return r.recordset;
};

module.exports = { courses, trainees };
