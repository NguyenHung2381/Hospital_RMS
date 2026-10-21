const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { httpError } = require('../../../utils/httpError');

// ─── Kết quả học tập (grades) ────────────────────────────────────────────
const listGrades = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT g.*, t.full_name AS trainee_name, s.title AS subject_name, tp.name AS program_name
    FROM grades g
    JOIN course_enrollments e ON e.id = g.enrollment_id
    JOIN trainees t ON t.id = e.trainee_id
    LEFT JOIN program_lessons s ON s.id = g.subject_id
    LEFT JOIN training_programs tp ON tp.id = g.program_id
    WHERE e.course_id = @course_id
    ORDER BY t.full_name
  `);
	return r.recordset;
};

// Nhập / sửa điểm: gradebookService (2 phần Lý thuyết + Thực hành, giai đoạn 4).
// Cột regular/midterm/final_score (TX/GK/CK) chỉ còn để đọc dữ liệu cũ.

const removeGrade = async (gradeId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), gradeId)
		.query('DELETE FROM grades WHERE id = @id AND locked_at IS NULL');
	if (!r.rowsAffected[0]) throw httpError(409, 'Không xoá được: điểm đã khóa hoặc không tồn tại.');
	broadcast('update', { entity: 'grade' });
};

module.exports = {
	listGrades,
	removeGrade,
};
