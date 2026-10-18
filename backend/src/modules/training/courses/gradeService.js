const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');

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

// Hệ số tính điểm tổng kết từ điểm thành phần: thường xuyên x1, giữa kỳ x2,
// cuối kỳ x3 (quy ước phổ biến trong đào tạo VN — chỉnh 3 số này nếu viện
// dùng công thức khác). Chỉ tính khi có đủ cả 3 điểm thành phần; nếu không,
// vẫn cho phép set score/result thủ công như trước (giữ tương thích ngược).
const GRADE_WEIGHTS = { regular: 1, midterm: 2, final: 3 };

const classifyScore = (score) => {
	if (score == null) return null;
	if (score >= 8) return 'Giỏi';
	if (score >= 6.5) return 'Khá';
	if (score >= 5) return 'Trung bình';
	return 'Yếu';
};

const computeFinalScore = (regular, midterm, final) => {
	if (regular == null || midterm == null || final == null) return null;
	const { regular: wr, midterm: wm, final: wf } = GRADE_WEIGHTS;
	const total = regular * wr + midterm * wm + final * wf;
	return Math.round((total / (wr + wm + wf)) * 100) / 100;
};

// Upsert theo (enrollment_id, subject_id) — 1 dòng / học viên / môn (subject_id
// NULL = điểm tổng kết khóa học).
const upsertGrade = async (enrollmentId, subjectId, data, actorId) => {
	const pool = await getPool();
	const regular = data.regular_score ?? null;
	const midterm = data.midterm_score ?? null;
	const finalScore = data.final_score ?? null;
	const computedScore = computeFinalScore(regular, midterm, finalScore);
	const score = computedScore ?? data.score ?? null;
	const classification = classifyScore(score);
	const result = data.result || (score != null ? (score >= 5 ? 'pass' : 'fail') : null);

	const existing = await pool
		.request()
		.input('enrollment_id', sql.VarChar(20), enrollmentId)
		.input('subject_id', sql.VarChar(20), subjectId || null).query(`
      SELECT id FROM grades
      WHERE enrollment_id = @enrollment_id
        AND (subject_id = @subject_id OR (subject_id IS NULL AND @subject_id IS NULL))
    `);

	if (existing.recordset[0]) {
		await pool
			.request()
			.input('id', sql.VarChar(20), existing.recordset[0].id)
			.input('score', sql.Decimal(5, 2), score)
			.input('result', sql.VarChar(20), result)
			.input('regular_score', sql.Decimal(5, 2), regular)
			.input('midterm_score', sql.Decimal(5, 2), midterm)
			.input('final_score', sql.Decimal(5, 2), finalScore)
			.input('classification', sql.NVarChar(20), classification)
			.input('program_id', sql.VarChar(20), data.program_id || null)
			.input('note', sql.NVarChar(255), data.note || null)
			.input('actor_id', sql.VarChar(20), actorId).query(`
        UPDATE grades SET score = @score, result = @result, note = @note,
               regular_score = @regular_score, midterm_score = @midterm_score,
               final_score = @final_score, classification = @classification,
               program_id = @program_id,
               updated_at = GETDATE(), updated_by = @actor_id
        WHERE id = @id
      `);
		broadcast('update', { entity: 'grade' });
		return { id: existing.recordset[0].id };
	}

	const result_ = await pool
		.request()
		.input('enrollment_id', sql.VarChar(20), enrollmentId)
		.input('subject_id', sql.VarChar(20), subjectId || null)
		.input('score', sql.Decimal(5, 2), score)
		.input('result', sql.VarChar(20), result)
		.input('regular_score', sql.Decimal(5, 2), regular)
		.input('midterm_score', sql.Decimal(5, 2), midterm)
		.input('final_score', sql.Decimal(5, 2), finalScore)
		.input('classification', sql.NVarChar(20), classification)
		.input('program_id', sql.VarChar(20), data.program_id || null)
		.input('note', sql.NVarChar(255), data.note || null)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_grade_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      INSERT INTO grades (id, enrollment_id, subject_id, score, result, regular_score, midterm_score, final_score, classification, program_id, note, created_by)
      VALUES (@new_id, @enrollment_id, @subject_id, @score, @result, @regular_score, @midterm_score, @final_score, @classification, @program_id, @note, @actor_id);
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'grade' });
	return { id: result_.recordset[0].id };
};

const removeGrade = async (gradeId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), gradeId)
		.query('DELETE FROM grades WHERE id = @id');
	broadcast('update', { entity: 'grade' });
};

module.exports = {
	listGrades,
	upsertGrade,
	removeGrade,
};
