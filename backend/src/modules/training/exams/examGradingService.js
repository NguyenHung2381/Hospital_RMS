const { getPool, sql, nowSql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const gradebookService = require('../courses/gradebookService');
const { toTen } = require('../courses/gradeRules');
const { httpError } = require('../../../utils/httpError');
const { theoryScore } = require('./examGen');
const { parseOptions, attemptQuestionIds, loadQuestions } = require('./examShared');

// ─── Chấm bài (tự luận) ──────────────────────────────────────────────────────
const listAttempts = async (paperId) => {
	const pool = await getPool();
	const r = await pool.request().input('paper_id', sql.VarChar(20), paperId).query(`
    SELECT a.id, a.paper_id, a.enrollment_id, a.started_at, a.submitted_at, a.auto_score, a.manual_score, a.status,
           a.attempt_no, a.code_no, a.score10, t.full_name AS trainee_name,
           (SELECT COUNT(*) FROM exam_answers ea WHERE ea.attempt_id = a.id AND ea.score_awarded IS NULL) AS pending_count
    FROM exam_attempts a
    JOIN course_enrollments e ON e.id = a.enrollment_id
    JOIN trainees t ON t.id = e.trainee_id
    WHERE a.paper_id = @paper_id
    ORDER BY a.submitted_at DESC
  `);
	return r.recordset;
};

const getAttemptForGrading = async (attemptId) => {
	const pool = await getPool();
	const attemptRes = await pool.request().input('id', sql.VarChar(20), attemptId).query(`
    SELECT a.*, t.full_name AS trainee_name, p.title AS paper_title, p.subject_id, p.course_id
    FROM exam_attempts a
    JOIN course_enrollments e ON e.id = a.enrollment_id
    JOIN trainees t ON t.id = e.trainee_id
    JOIN exam_papers p ON p.id = a.paper_id
    WHERE a.id = @id
  `);
	const attempt = attemptRes.recordset[0];
	if (!attempt) return null;
	const order = new Map((await attemptQuestionIds(attempt)).map((id, i) => [id, i]));
	const answersRes = await pool.request().input('attempt_id', sql.VarChar(20), attemptId).query(`
    SELECT ans.*, q.question_text, q.question_type, q.options, q.correct_option, q.points, q.image_url
    FROM exam_answers ans
    JOIN question_bank q ON q.id = ans.question_id
    WHERE ans.attempt_id = @attempt_id
  `);
	attempt.answers = answersRes.recordset
		.map((a) => parseOptions({ ...a, sort_order: order.get(a.question_id) ?? 999 }))
		.sort((x, y) => x.sort_order - y.sort_order);
	delete attempt.question_ids;
	return attempt;
};

// Cấp điểm 1 câu tự luận — nếu đây là câu NULL cuối cùng của lượt làm bài,
// tự tính tổng điểm + đóng lượt (status='graded') + đổ vào bảng điểm (pushExamScore).
const gradeEssayAnswer = async (attemptId, questionId, score, actorId) => {
	const pool = await getPool();
	// Chỉ câu TỰ LUẬN của lượt đã nộp, điểm trong [0, điểm tối đa của câu] —
	// không ghi đè điểm câu trắc nghiệm (máy chấm) hay cho điểm vượt thang.
	const target = (
		await pool
			.request()
			.input('attempt_id', sql.VarChar(20), attemptId)
			.input('question_id', sql.VarChar(20), questionId).query(`
        SELECT q.question_type, q.points, a.status
        FROM exam_answers ans
        JOIN question_bank q ON q.id = ans.question_id
        JOIN exam_attempts a ON a.id = ans.attempt_id
        WHERE ans.attempt_id = @attempt_id AND ans.question_id = @question_id`)
	).recordset[0];
	if (!target) throw httpError(404, 'Không tìm thấy câu trả lời trong lượt làm bài này.');
	if (target.question_type !== 'essay') throw httpError(400, 'Chỉ chấm tay câu tự luận.');
	if (!['submitted', 'graded'].includes(target.status))
		throw httpError(409, 'Lượt làm bài chưa nộp — chưa chấm được.');
	const max = Number(target.points ?? 0);
	const value = Number(score);
	if (!Number.isFinite(value) || value < 0 || value > max)
		throw httpError(400, `Điểm phải trong khoảng 0 – ${max}.`);
	await pool
		.request()
		.input('attempt_id', sql.VarChar(20), attemptId)
		.input('question_id', sql.VarChar(20), questionId)
		.input('score', sql.Decimal(4, 1), value)
		.query(
			'UPDATE exam_answers SET score_awarded = @score WHERE attempt_id = @attempt_id AND question_id = @question_id',
		);

	await finalizeAttemptIfComplete(attemptId, actorId);
	broadcast('update', { entity: 'exam_attempt' });
	return getAttemptForGrading(attemptId);
};

const finalizeAttemptIfComplete = async (attemptId, actorId) => {
	const pool = await getPool();
	const r = (
		await pool.request().input('attempt_id', sql.VarChar(20), attemptId).query(`
      SELECT SUM(CASE WHEN score_awarded IS NULL THEN 1 ELSE 0 END) AS pending, SUM(score_awarded) AS total
      FROM exam_answers WHERE attempt_id = @attempt_id`)
	).recordset[0];
	if (r.pending > 0) return;
	await pool
		.request()
		.input('id', sql.VarChar(20), attemptId)
		.input('manual_score', sql.Decimal(6, 2), r.total ?? 0)
		.input('actor_id', sql.VarChar(20), actorId || null)
		.query(
			`UPDATE exam_attempts SET manual_score = @manual_score, status = 'graded', updated_at = ${nowSql}, updated_by = @actor_id WHERE id = @id`,
		);
	await pushExamScore(attemptId, actorId);
};
// Điểm bài thi (quy về thang 10 theo tổng điểm các câu của lượt đó) → lưu ở lượt làm bài,
// rồi đổ vào bảng điểm: đề đầu vào chỉ tham khảo (không đổ); thực hành đổ thẳng; lý thuyết
// = trung bình có trọng số các đề lý thuyết cuối khóa của lớp (TN × a% + TL × b%), chờ đủ
// điểm mọi đề của lần thi hiện tại mới đổ.
const pushExamScore = async (attemptId, actorId) => {
	const pool = await getPool();
	const a = (
		await pool.request().input('id', sql.VarChar(20), attemptId).query(`
      SELECT a.*, p.purpose, p.exam_part, p.course_id, e.program_id AS enrollment_program
      FROM exam_attempts a JOIN exam_papers p ON p.id = a.paper_id JOIN course_enrollments e ON e.id = a.enrollment_id
      WHERE a.id = @id`)
	).recordset[0];
	if (!a) return;
	const questions = await loadQuestions(await attemptQuestionIds(a), 'q.id, q.points');
	const maxPoints = questions.reduce((s, q) => s + Number(q.points), 0);
	const score10 = toTen(a.manual_score ?? a.auto_score ?? 0, maxPoints);
	await pool
		.request()
		.input('id', sql.VarChar(20), attemptId)
		.input('score10', sql.Decimal(4, 1), score10)
		.query('UPDATE exam_attempts SET score10 = @score10 WHERE id = @id');
	if (score10 == null || a.purpose === 'entrance') return;
	if (a.exam_part === 'practice') {
		await gradebookService.setPartFromExam(a.enrollment_id, 'practice', score10, actorId);
		return;
	}
	const parts = (
		await pool
			.request()
			.input('course_id', sql.VarChar(20), a.course_id)
			.input('enrollment_id', sql.VarChar(20), a.enrollment_id)
			.input('program_id', sql.VarChar(20), a.enrollment_program)
			.input('attempt_no', sql.Int, a.attempt_no).query(`
        SELECT p.weight,
               (SELECT x.score10 FROM exam_attempts x
                WHERE x.paper_id = p.id AND x.enrollment_id = @enrollment_id AND x.attempt_no = @attempt_no
                  AND x.status = 'graded'
                ORDER BY x.id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY) AS score10
        FROM exam_papers p
        WHERE p.course_id = @course_id AND p.purpose = 'final' AND p.exam_part = 'theory' AND p.status <> 'draft'
          AND (p.program_id IS NULL OR @program_id IS NULL OR p.program_id = @program_id)`)
	).recordset;
	const combined = theoryScore(parts);
	if (combined != null)
		await gradebookService.setPartFromExam(a.enrollment_id, 'theory', combined, actorId);
};

// ─── GV chấm bài được phân (cổng /me, không cần quyền exams:manage) ──────────
// Người chấm không chấm được bài của chính mình (SELF_ENROLLMENT_SQL).
const { PAPER_GRADER_SQL, SELF_ENROLLMENT_SQL } = gradebookService;

// Bài tự luận còn câu chưa chấm, thuộc đề mình là người chấm.
const listPendingForGrader = async (userId) => {
	const pool = await getPool();
	const r = await pool.request().input('uid', sql.VarChar(20), userId).query(`
    SELECT a.id AS attempt_id, a.submitted_at, p.id AS paper_id, p.title AS paper_title, p.exam_part,
           p.blind_grading, c.id AS course_id, c.name AS course_name,
           CASE WHEN p.blind_grading = 'true' THEN NULL ELSE t.full_name END AS trainee_name,
           (SELECT COUNT(*) FROM exam_answers ea WHERE ea.attempt_id = a.id AND ea.score_awarded IS NULL) AS pending_count
    FROM exam_attempts a
    JOIN exam_papers p ON p.id = a.paper_id
    JOIN courses c ON c.id = p.course_id
    JOIN course_enrollments e ON e.id = a.enrollment_id
    JOIN trainees t ON t.id = e.trainee_id
    WHERE a.status = 'submitted' AND ${PAPER_GRADER_SQL('p')}
      AND NOT ${SELF_ENROLLMENT_SQL('a.enrollment_id')}
    ORDER BY a.submitted_at
  `);
	return r.recordset;
};

const assertGrader = async (attemptId, userId) => {
	const pool = await getPool();
	const ok = (
		await pool
			.request()
			.input('id', sql.VarChar(20), attemptId)
			.input('uid', sql.VarChar(20), userId).query(`
      SELECT p.blind_grading FROM exam_attempts a JOIN exam_papers p ON p.id = a.paper_id
      WHERE a.id = @id AND ${PAPER_GRADER_SQL('p')}
        AND NOT ${SELF_ENROLLMENT_SQL('a.enrollment_id')}
    `)
	).recordset[0];
	if (!ok) throw httpError(403, 'Bạn không phải người chấm của bài thi này.');
	return ok;
};

// Đề bật chấm ẩn danh: ẩn tên học viên, chỉ hiện mã bài.
const getAttemptForGrader = async (attemptId, userId) => {
	const { blind_grading } = await assertGrader(attemptId, userId);
	const attempt = await getAttemptForGrading(attemptId);
	if (attempt && blind_grading) {
		attempt.trainee_name = null;
		attempt.enrollment_id = null;
	}
	return attempt;
};

const gradeEssayAsGrader = async (attemptId, questionId, score, userId) => {
	await assertGrader(attemptId, userId);
	await gradeEssayAnswer(attemptId, questionId, score, userId);
	return getAttemptForGrader(attemptId, userId);
};

module.exports = {
	listAttempts,
	getAttemptForGrading,
	gradeEssayAnswer,
	pushExamScore,
	listPendingForGrader,
	getAttemptForGrader,
	gradeEssayAsGrader,
};
