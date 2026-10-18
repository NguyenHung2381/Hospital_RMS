// @ts-nocheck — còn lỗi kiểu khi bật checkJs; sửa xong thì xoá dòng này (xem README, Kiểm tra chất lượng)
/**
 * trainingReportService.js — 3 báo cáo Đào tạo (đối chiếu QLNCKHDTCDT-main
 * BAO_CAO_BUS::theoKhoaCtdt / dsHocVienKetQua / thongKeTong), RMS trước đây
 * chưa có báo cáo chuyên biệt cho mảng Đào tạo (chỉ có báo cáo NCKH).
 */
const { getPool, sql } = require('../../../config/db');

// 1. Theo khóa + chương trình áp dụng: sĩ số, tỷ lệ duyệt, điểm TB, số chứng chỉ.
const byCourseProgram = async () => {
	const pool = await getPool();
	const r = await pool.request().query(`
    SELECT c.id AS course_id, c.name AS course_name,
           tp.name AS program_name,
           (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id) AS total_enrollments,
           (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id AND status = 'approved') AS approved_count,
           (SELECT AVG(score) FROM grades g JOIN course_enrollments e ON e.id = g.enrollment_id WHERE e.course_id = c.id AND g.subject_id IS NULL) AS avg_score,
           (SELECT COUNT(*) FROM certificates ce JOIN course_enrollments e ON e.id = ce.enrollment_id WHERE e.course_id = c.id AND ce.status = 'active') AS certificate_count
    FROM courses c
    LEFT JOIN course_programs cp ON cp.course_id = c.id
    LEFT JOIN training_programs tp ON tp.id = cp.program_id
    ORDER BY c.created_at DESC
  `);
	return r.recordset;
};

// 2. DS học viên + kết quả (điểm tổng kết, xếp loại) toàn hệ thống.
const traineeResults = async ({ course_id } = {}) => {
	const pool = await getPool();
	const req = pool.request();
	let where = '1=1';
	if (course_id) {
		where += ' AND e.course_id = @course_id';
		req.input('course_id', sql.VarChar(20), course_id);
	}
	const r = await req.query(`
    SELECT t.full_name AS trainee_name, c.name AS course_name,
           g.score, g.classification, g.result,
           att.attended, att.total_sessions
    FROM course_enrollments e
    JOIN trainees t ON t.id = e.trainee_id
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN grades g ON g.enrollment_id = e.id AND g.subject_id IS NULL
    OUTER APPLY (
      SELECT COUNT(*) AS total_sessions,
             SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS attended
      FROM class_sessions cs
      LEFT JOIN attendance a ON a.session_id = cs.id AND a.enrollment_id = e.id
      WHERE cs.course_id = e.course_id
    ) att
    WHERE ${where} AND e.status = 'approved'
    ORDER BY c.name, t.full_name
  `);
	return r.recordset;
};

// 3. Thống kê tổng theo khoảng thời gian (dựa trên registered_at).
const summary = async ({ from, to } = {}) => {
	const pool = await getPool();
	const req = pool.request();
	const where = ['1=1'];
	if (from) {
		where.push('e.registered_at >= @from');
		req.input('from', sql.Date, from);
	}
	if (to) {
		where.push('e.registered_at <= @to');
		req.input('to', sql.Date, to);
	}
	const r = await req.query(`
    SELECT
      (SELECT COUNT(DISTINCT course_id) FROM course_enrollments e WHERE ${where.join(' AND ')}) AS course_count,
      (SELECT COUNT(*) FROM course_enrollments e WHERE ${where.join(' AND ')}) AS enrollment_count,
      (SELECT COUNT(*) FROM course_enrollments e WHERE ${where.join(' AND ')} AND e.status = 'approved') AS approved_count,
      (SELECT COUNT(*) FROM certificates c JOIN course_enrollments e ON e.id = c.enrollment_id WHERE ${where.join(' AND ')} AND c.status = 'active') AS certificate_count
  `);
	return r.recordset[0];
};

module.exports = { byCourseProgram, traineeResults, summary };
