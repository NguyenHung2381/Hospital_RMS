const { getPool, sql, withTransaction } = require('../config/db');
const { parseJsonArray } = require('../utils/sqlFilters');
const { broadcast } = require('./eventService');
const courseService = require('./courseService');
const { removeUploadedFile, toStoredUploadPath } = require('../utils/uploadPaths');

const QUESTION_TYPES = ['single_choice', 'essay'];
// Loại đề → loại câu hỏi được phép đưa vào. paper_type NULL = đề cũ (hỗn hợp),
// không lọc — giữ nguyên câu tự luận của đề tạo trước khi có cột này.
const PAPER_QUESTION_TYPE = { multiple_choice: 'single_choice', essay: 'essay' };

const parseOptions = (row) => (row.options === undefined ? row : { ...row, options: parseJsonArray(row.options) });

// Ảnh minh hoạ câu hỏi — tải lên qua POST /exams/questions/image (routes/exams.js)
const QUESTION_IMAGE_DIR = '/uploads/questions/';
const imagePath = (url) => toStoredUploadPath(url, QUESTION_IMAGE_DIR);

// ─── Ngân hàng câu hỏi ───────────────────────────────────────────────────────
const listQuestions = async ({ subject_id, search, question_type } = {}) => {
	const pool = await getPool();
	const where = ['1=1'];
	const req = pool.request();
	if (subject_id) {
		where.push('q.subject_id = @subject_id');
		req.input('subject_id', sql.VarChar(20), subject_id);
	}
	if (question_type) {
		where.push('q.question_type = @question_type');
		req.input('question_type', sql.VarChar(20), question_type);
	}
	if (search) {
		where.push('q.question_text LIKE @search');
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	const r = await req.query(`
    SELECT q.*, s.title AS subject_name,
           (SELECT COUNT(*) FROM exam_paper_questions epq WHERE epq.question_id = q.id) AS used_count
    FROM question_bank q
    LEFT JOIN program_lessons s ON s.id = q.subject_id
    WHERE ${where.join(' AND ')}
    ORDER BY q.created_at DESC
  `);
	return r.recordset.map(parseOptions);
};

const getQuestion = async (id) => {
	const pool = await getPool();
	const r = await pool.request().input('id', sql.VarChar(20), id).query('SELECT * FROM question_bank WHERE id = @id');
	return r.recordset[0] ? parseOptions(r.recordset[0]) : null;
};

// request: pool.request() hoặc transaction.request() — dùng chung cho tạo lẻ và nhập hàng loạt
const insertQuestion = async (request, data, actorId) => {
	const type = QUESTION_TYPES.includes(data.question_type) ? data.question_type : 'single_choice';
	const result = await request
		.input('subject_id', sql.VarChar(20), data.subject_id || null)
		.input('question_type', sql.VarChar(20), type)
		.input('question_text', sql.NVarChar(sql.MAX), data.question_text)
		.input('options', sql.NVarChar(sql.MAX), type === 'essay' ? null : JSON.stringify((data.options || []).filter(Boolean)))
		.input('correct_option', sql.NVarChar(255), type === 'essay' ? null : data.correct_option || null)
		.input('points', sql.Decimal(4, 1), data.points || 1)
		.input('image_url', sql.NVarChar(500), imagePath(data.image_url))
		.input('actor_id', sql.VarChar(20), actorId).query(`
      DECLARE @new_id VARCHAR(20) = 'QB' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO question_bank (id, subject_id, question_type, question_text, options, correct_option, points, image_url, created_by)
      VALUES (@new_id, @subject_id, @question_type, @question_text, @options, @correct_option, @points, @image_url, @actor_id);
      SELECT @new_id AS id;
    `);
	return result.recordset[0].id;
};

const createQuestion = async (data, actorId) => {
	const pool = await getPool();
	const id = await insertQuestion(pool.request(), data, actorId);
	broadcast('update', { entity: 'question_bank' });
	return getQuestion(id);
};

// Nhập hàng loạt (từ file Word/PDF đã tách câu ở trình duyệt) — tất cả hoặc không
const createQuestionsBulk = async (items, actorId) => {
	await withTransaction(async (tx) => {
		for (const item of items) await insertQuestion(tx.request(), item, actorId);
	});
	broadcast('update', { entity: 'question_bank' });
	return { created: items.length };
};

const updateQuestion = async (id, data, actorId) => {
	const pool = await getPool();
	const current = await getQuestion(id);
	if (!current) return null;
	const type = data.question_type && QUESTION_TYPES.includes(data.question_type) ? data.question_type : current.question_type;
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id', 'question_type = @question_type'];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId)
		.input('question_type', sql.VarChar(20), type);

	if (data.subject_id !== undefined) {
		sets.push('subject_id = @subject_id');
		req.input('subject_id', sql.VarChar(20), data.subject_id || null);
	}
	if (data.question_text !== undefined) {
		sets.push('question_text = @question_text');
		req.input('question_text', sql.NVarChar(sql.MAX), data.question_text);
	}
	if (data.options !== undefined || data.question_type !== undefined) {
		sets.push('options = @options');
		req.input('options', sql.NVarChar(sql.MAX), type === 'essay' ? null : JSON.stringify((data.options ?? current.options ?? []).filter(Boolean)));
	}
	if (data.correct_option !== undefined || data.question_type !== undefined) {
		sets.push('correct_option = @correct_option');
		req.input('correct_option', sql.NVarChar(255), type === 'essay' ? null : (data.correct_option ?? current.correct_option ?? null));
	}
	if (data.points !== undefined) {
		sets.push('points = @points');
		req.input('points', sql.Decimal(4, 1), data.points);
	}
	const newImage = data.image_url !== undefined ? imagePath(data.image_url) : current.image_url;
	if (data.image_url !== undefined) {
		sets.push('image_url = @image_url');
		req.input('image_url', sql.NVarChar(500), newImage);
	}

	await req.query(`UPDATE question_bank SET ${sets.join(', ')} WHERE id = @id`);
	// Đổi / bỏ ảnh → xoá file ảnh cũ (mỗi ảnh chỉ thuộc 1 câu hỏi)
	if (current.image_url && current.image_url !== newImage) removeUploadedFile(current.image_url);
	broadcast('update', { entity: 'question_bank' });
	return getQuestion(id);
};

const removeQuestion = async (id) => {
	const pool = await getPool();
	// FK exam_paper_questions/exam_answers không cascade — báo rõ thay vì lỗi SQL 547
	const r = await pool.request().input('id', sql.VarChar(20), id).query(`
    IF EXISTS (SELECT 1 FROM exam_paper_questions WHERE question_id = @id)
       OR EXISTS (SELECT 1 FROM exam_answers WHERE question_id = @id)
      SELECT 1 AS in_use
    ELSE
      DELETE FROM question_bank OUTPUT DELETED.image_url WHERE id = @id;
  `);
	if (r.recordset?.[0]?.in_use) {
		const err = new Error('Câu hỏi đang được dùng trong đề thi, không thể xoá. Hãy bỏ câu hỏi khỏi các đề trước.');
		err.statusCode = 409;
		throw err;
	}
	removeUploadedFile(r.recordset?.[0]?.image_url);
	broadcast('update', { entity: 'question_bank' });
};

// ─── Đề thi ──────────────────────────────────────────────────────────────────
const paperSelect = `
  SELECT p.*, c.name AS course_name, s.title AS subject_name,
         (SELECT COUNT(*) FROM exam_paper_questions epq WHERE epq.paper_id = p.id) AS question_count,
         (SELECT COUNT(*) FROM exam_attempts a WHERE a.paper_id = p.id) AS attempt_count
  FROM exam_papers p
  JOIN courses c ON c.id = p.course_id
  LEFT JOIN program_lessons s ON s.id = p.subject_id
`;

const listPapers = async (courseId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('course_id', sql.VarChar(20), courseId)
		.query(`${paperSelect} WHERE p.course_id = @course_id ORDER BY p.created_at DESC`);
	return r.recordset;
};

// Câu hỏi trong đề — bản ĐẦY ĐỦ (có correct_option/points), chỉ dùng cho màn
// quản trị (tạo/sửa đề, xem lại). Bản cho học viên làm bài PHẢI qua
// getPaperForAttempt (ẩn correct_option).
const listPaperQuestionsFull = async (paperId) => {
	const pool = await getPool();
	const r = await pool.request().input('paper_id', sql.VarChar(20), paperId).query(`
    SELECT epq.id AS link_id, epq.sort_order, q.*
    FROM exam_paper_questions epq
    JOIN question_bank q ON q.id = epq.question_id
    WHERE epq.paper_id = @paper_id
    ORDER BY epq.sort_order ASC
  `);
	return r.recordset.map(parseOptions);
};

const getPaper = async (id) => {
	const pool = await getPool();
	const r = await pool.request().input('id', sql.VarChar(20), id).query(`${paperSelect} WHERE p.id = @id`);
	const row = r.recordset[0];
	if (!row) return null;
	row.questions = await listPaperQuestionsFull(id);
	return row;
};

const setPaperQuestions = async (paperId, questionIds, actorId) => {
		const pool = await getPool();
	const paperType = (
		await pool.request().input('id', sql.VarChar(20), paperId).query('SELECT paper_type FROM exam_papers WHERE id = @id')
	).recordset[0]?.paper_type;
	const onlyType = PAPER_QUESTION_TYPE[paperType] || null;
	await pool.request().input('paper_id', sql.VarChar(20), paperId).query('DELETE FROM exam_paper_questions WHERE paper_id = @paper_id');
	const ids = [...new Set((questionIds || []).filter(Boolean))];
	for (let i = 0; i < ids.length; i++) {
		await pool
			.request()
			.input('paper_id', sql.VarChar(20), paperId)
			.input('question_id', sql.VarChar(20), ids[i])
			.input('only_type', sql.VarChar(20), onlyType)
			.input('actor_id', sql.VarChar(20), actorId || null)
			.input('sort_order', sql.Int, i).query(`
        IF EXISTS (SELECT 1 FROM question_bank WHERE id = @question_id AND (@only_type IS NULL OR question_type = @only_type))
        BEGIN
          DECLARE @new_id VARCHAR(20) = 'EPQ' + LEFT(REPLACE(NEWID(),'-',''), 17);
          INSERT INTO exam_paper_questions (id, paper_id, question_id, sort_order, created_by)
          VALUES (@new_id, @paper_id, @question_id, @sort_order, @actor_id);
        END
      `);
	}
	broadcast('update', { entity: 'exam_paper' });
	return listPaperQuestionsFull(paperId);
};

const createPaper = async (data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('course_id', sql.VarChar(20), data.course_id)
		.input('subject_id', sql.VarChar(20), data.subject_id || null)
		.input('title', sql.NVarChar(255), data.title)
		.input('paper_type', sql.VarChar(20), data.paper_type || 'multiple_choice')
		.input('duration_minutes', sql.Int, data.duration_minutes || 45)
		.input('status', sql.VarChar(20), data.status || 'draft')
		.input('actor_id', sql.VarChar(20), actorId).query(`
      DECLARE @new_id VARCHAR(20) = 'EP' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO exam_papers (id, course_id, subject_id, title, paper_type, duration_minutes, status, created_by)
      VALUES (@new_id, @course_id, @subject_id, @title, @paper_type, @duration_minutes, @status, @actor_id);
      SELECT @new_id AS id;
    `);
	const id = result.recordset[0].id;
	if (Array.isArray(data.question_ids) && data.question_ids.length) await setPaperQuestions(id, data.question_ids, actorId);
	broadcast('update', { entity: 'exam_paper' });
	return getPaper(id);
};

const updatePaper = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool.request().input('id', sql.VarChar(20), id).input('actor_id', sql.VarChar(20), actorId);

	if (data.subject_id !== undefined) {
		sets.push('subject_id = @subject_id');
		req.input('subject_id', sql.VarChar(20), data.subject_id || null);
	}
	if (data.title !== undefined) {
		sets.push('title = @title');
		req.input('title', sql.NVarChar(255), data.title);
	}
	if (data.duration_minutes !== undefined) {
		sets.push('duration_minutes = @duration_minutes');
		req.input('duration_minutes', sql.Int, data.duration_minutes);
	}
	if (data.status !== undefined) {
		sets.push('status = @status');
		req.input('status', sql.VarChar(20), data.status);
	}
	if (data.paper_type !== undefined) {
		sets.push('paper_type = @paper_type');
		req.input('paper_type', sql.VarChar(20), data.paper_type);
	}

	// Đổi loại đề mà không gửi danh sách câu → lọc lại câu hiện có theo loại mới
	const questionIds = Array.isArray(data.question_ids)
		? data.question_ids
		: data.paper_type !== undefined
			? (await listPaperQuestionsFull(id)).map((q) => q.id)
			: null;
	if (sets.length > 2) await req.query(`UPDATE exam_papers SET ${sets.join(', ')} WHERE id = @id`);
	if (questionIds) await setPaperQuestions(id, questionIds, actorId);
	broadcast('update', { entity: 'exam_paper' });
	return getPaper(id);
};

const removePaper = async (id) => {
	const pool = await getPool();
	await pool.request().input('id', sql.VarChar(20), id).query('DELETE FROM exam_papers WHERE id = @id');
	broadcast('update', { entity: 'exam_paper' });
};

// ─── Chấm bài (tự luận) ──────────────────────────────────────────────────────
const listAttempts = async (paperId) => {
	const pool = await getPool();
	const r = await pool.request().input('paper_id', sql.VarChar(20), paperId).query(`
    SELECT a.*, t.full_name AS trainee_name,
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
	const answersRes = await pool
		.request()
		.input('attempt_id', sql.VarChar(20), attemptId)
		.input('paper_id', sql.VarChar(20), attempt.paper_id).query(`
    SELECT ans.*, q.question_text, q.question_type, q.options, q.correct_option, q.points, q.image_url, epq.sort_order
    FROM exam_answers ans
    JOIN question_bank q ON q.id = ans.question_id
    JOIN exam_paper_questions epq ON epq.paper_id = @paper_id AND epq.question_id = q.id
    WHERE ans.attempt_id = @attempt_id
    ORDER BY epq.sort_order ASC
  `);
	attempt.answers = answersRes.recordset.map(parseOptions);
	return attempt;
};

// Cấp điểm 1 câu tự luận — nếu đây là câu NULL cuối cùng của lượt làm bài,
// tự tính tổng điểm + đóng lượt (status='graded') + đổ vào grades qua
// courseService.upsertGrade (điểm tổng kết môn/khóa, subject_id = đề thuộc).
const gradeEssayAnswer = async (attemptId, questionId, score, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('attempt_id', sql.VarChar(20), attemptId)
		.input('question_id', sql.VarChar(20), questionId)
		.input('score', sql.Decimal(4, 1), score)
		.query('UPDATE exam_answers SET score_awarded = @score WHERE attempt_id = @attempt_id AND question_id = @question_id');

	await finalizeAttemptIfComplete(attemptId, actorId);
	broadcast('update', { entity: 'exam_attempt' });
	return getAttemptForGrading(attemptId);
};

const finalizeAttemptIfComplete = async (attemptId, actorId) => {
	const pool = await getPool();
	const pending = await pool
		.request()
		.input('attempt_id', sql.VarChar(20), attemptId)
		.query('SELECT COUNT(*) AS c FROM exam_answers WHERE attempt_id = @attempt_id AND score_awarded IS NULL');
	if (pending.recordset[0].c > 0) return;

	const totalRes = await pool.request().input('attempt_id', sql.VarChar(20), attemptId).query(`
    SELECT SUM(score_awarded) AS total FROM exam_answers WHERE attempt_id = @attempt_id
  `);
	const total = totalRes.recordset[0].total ?? 0;

	const attemptRes = await pool.request().input('id', sql.VarChar(20), attemptId).query(`
    SELECT a.enrollment_id, p.subject_id FROM exam_attempts a JOIN exam_papers p ON p.id = a.paper_id WHERE a.id = @id
  `);
	const attempt = attemptRes.recordset[0];

	await pool
		.request()
		.input('id', sql.VarChar(20), attemptId)
		.input('manual_score', sql.Decimal(6, 2), total)
		.input('actor_id', sql.VarChar(20), actorId || null)
		.query("UPDATE exam_attempts SET manual_score = @manual_score, status = 'graded', updated_at = GETDATE(), updated_by = @actor_id WHERE id = @id");

	if (attempt) {
		await courseService.upsertGrade(attempt.enrollment_id, attempt.subject_id, { score: total }, actorId);
	}
};

// ─── Học viên làm bài ────────────────────────────────────────────────────────
// Đề đang mở (status='published') dành cho khóa học actor đã ghi danh
// 'approved' — kèm biết đã làm/chưa (attempt_id, status) để FE hiện đúng nút.
const listAvailablePapersForUser = async (actor) => {
	const pool = await getPool();
	const r = await pool.request().input('user_id', sql.VarChar(20), actor.id).query(`
    SELECT p.id, p.title, p.duration_minutes, c.id AS course_id, c.name AS course_name,
           e.id AS enrollment_id, att.id AS attempt_id, att.status AS attempt_status
    FROM exam_papers p
    JOIN courses c ON c.id = p.course_id
    JOIN course_enrollments e ON e.course_id = c.id AND e.status = 'approved'
    JOIN trainees t ON t.id = e.trainee_id AND t.user_id = @user_id
    LEFT JOIN exam_attempts att ON att.paper_id = p.id AND att.enrollment_id = e.id
    WHERE p.status = 'published'
    ORDER BY p.created_at DESC
  `);
	return r.recordset;
};

const assertEnrollment = async (pool, paperId, actor) => {
	const r = await pool
		.request()
		.input('paper_id', sql.VarChar(20), paperId)
		.input('user_id', sql.VarChar(20), actor.id).query(`
      SELECT p.id AS paper_id, p.status, p.duration_minutes, e.id AS enrollment_id
      FROM exam_papers p
      JOIN course_enrollments e ON e.course_id = p.course_id AND e.status = 'approved'
      JOIN trainees t ON t.id = e.trainee_id AND t.user_id = @user_id
      WHERE p.id = @paper_id
    `);
	const row = r.recordset[0];
	if (!row) {
		const err = new Error('Bạn không có quyền làm đề thi này.');
		err.statusCode = 403;
		throw err;
	}
	if (row.status !== 'published') {
		const err = new Error('Đề thi hiện không mở.');
		err.statusCode = 403;
		throw err;
	}
	return row;
};

// Bắt đầu làm bài — nếu đã có lượt (kể cả đang làm dở) thì trả lại lượt cũ
// (resume), KHÔNG tạo lượt mới — mirror UNIQUE(paper_id, enrollment_id).
const startAttempt = async (paperId, actor) => {
	const pool = await getPool();
	const info = await assertEnrollment(pool, paperId, actor);

	const existing = await pool
		.request()
		.input('paper_id', sql.VarChar(20), paperId)
		.input('enrollment_id', sql.VarChar(20), info.enrollment_id)
		.query('SELECT id, status FROM exam_attempts WHERE paper_id = @paper_id AND enrollment_id = @enrollment_id');

	let attemptId = existing.recordset[0]?.id;
	if (!attemptId) {
		const created = await pool
			.request()
			.input('paper_id', sql.VarChar(20), paperId)
			.input('enrollment_id', sql.VarChar(20), info.enrollment_id)
			.input('actor_id', sql.VarChar(20), actor.id).query(`
        DECLARE @new_id VARCHAR(20) = 'EA' + LEFT(REPLACE(NEWID(),'-',''), 18);
        INSERT INTO exam_attempts (id, paper_id, enrollment_id, created_by) VALUES (@new_id, @paper_id, @enrollment_id, @actor_id);
        SELECT @new_id AS id;
      `);
		attemptId = created.recordset[0].id;
	} else if (existing.recordset[0].status !== 'in_progress') {
		const err = new Error('Bạn đã nộp đề thi này rồi.');
		err.statusCode = 409;
		throw err;
	}

	const attemptRes = await pool.request().input('id', sql.VarChar(20), attemptId).query('SELECT * FROM exam_attempts WHERE id = @id');
	const questionsRes = await pool.request().input('paper_id', sql.VarChar(20), paperId).query(`
    SELECT q.id, q.question_type, q.question_text, q.options, q.points, q.image_url, epq.sort_order
    FROM exam_paper_questions epq
    JOIN question_bank q ON q.id = epq.question_id
    WHERE epq.paper_id = @paper_id
    ORDER BY epq.sort_order ASC
  `);
	return {
		attempt: attemptRes.recordset[0],
		duration_minutes: info.duration_minutes,
		questions: questionsRes.recordset.map(parseOptions),
	};
};

// Nộp bài — chấm ngay câu trắc nghiệm, câu tự luận để score_awarded NULL chờ
// chấm tay. Nếu đề không có câu tự luận nào, hoàn tất luôn (không chờ ai chấm).
// Cho nộp trễ tối đa chừng này sau khi hết giờ (độ trễ mạng / trình duyệt tự nộp)
const SUBMIT_GRACE_SEC = 120;

const submitAttempt = async (paperId, answers, actor) => {
	const pool = await getPool();
	const info = await assertEnrollment(pool, paperId, actor);

	// "Nhận" lượt làm bài NGUYÊN TỬ: chỉ 1 request đổi được in_progress → submitted.
	// Trước đây SELECT rồi mới UPDATE — nộp 2 lần song song thì cả 2 cùng ghi đáp án.
	// Đồng thời tính trễ hạn theo giờ SQL Server (không tin đồng hồ trình duyệt):
	// quá started_at + thời lượng + SUBMIT_GRACE_SEC thì đáp án không được tính.
	const claimed = (
		await pool
			.request()
			.input('paper_id', sql.VarChar(20), paperId)
			.input('enrollment_id', sql.VarChar(20), info.enrollment_id)
			.input('actor_id', sql.VarChar(20), actor.id)
			.input('limit_sec', sql.Int, (Number(info.duration_minutes) || 0) * 60 + SUBMIT_GRACE_SEC).query(`
				DECLARE @r TABLE (id VARCHAR(20), late BIT);
				UPDATE exam_attempts SET status = 'submitted', submitted_at = GETDATE(), updated_at = GETDATE(), updated_by = @actor_id
				OUTPUT INSERTED.id,
				       CASE WHEN @limit_sec > ${SUBMIT_GRACE_SEC}
				             AND INSERTED.submitted_at > DATEADD(SECOND, @limit_sec, INSERTED.started_at)
				            THEN 1 ELSE 0 END
				INTO @r
				WHERE paper_id = @paper_id AND enrollment_id = @enrollment_id AND status = 'in_progress';
				SELECT id, late FROM @r;
			`)
	).recordset[0];
	if (!claimed) {
		const err = new Error('Không tìm thấy lượt làm bài đang mở, hoặc bạn đã nộp rồi.');
		err.statusCode = 409;
		throw err;
	}
	const attempt = { id: claimed.id };
	const late = !!claimed.late;
	// Nộp quá giờ: vẫn đóng lượt làm bài (không làm lại được) nhưng bỏ đáp án
	if (late) answers = [];

	const questionsRes = await pool.request().input('paper_id', sql.VarChar(20), paperId).query(`
    SELECT q.id, q.question_type, q.correct_option, q.points
    FROM exam_paper_questions epq JOIN question_bank q ON q.id = epq.question_id
    WHERE epq.paper_id = @paper_id
  `);
	const questions = questionsRes.recordset;
	const answerMap = new Map((answers || []).map((a) => [a.question_id, a]));

	let autoScore = 0;
	let hasEssay = false;
	for (const q of questions) {
		const ans = answerMap.get(q.id);
		const isEssay = q.question_type === 'essay';
		hasEssay = hasEssay || isEssay;
		const selected = !isEssay ? ans?.selected_option || null : null;
		const essayText = isEssay ? ans?.essay_text || null : null;
		const scoreAwarded = isEssay ? null : selected && selected === q.correct_option ? q.points : 0;
		if (!isEssay) autoScore += scoreAwarded;

		await pool
			.request()
			.input('attempt_id', sql.VarChar(20), attempt.id)
			.input('question_id', sql.VarChar(20), q.id)
			.input('selected_option', sql.NVarChar(255), selected)
			.input('essay_text', sql.NVarChar(sql.MAX), essayText)
			.input('score_awarded', sql.Decimal(4, 1), scoreAwarded).query(`
        DECLARE @new_id VARCHAR(20) = 'EAN' + LEFT(REPLACE(NEWID(),'-',''), 17);
        INSERT INTO exam_answers (id, attempt_id, question_id, selected_option, essay_text, score_awarded)
        VALUES (@new_id, @attempt_id, @question_id, @selected_option, @essay_text, @score_awarded);
      `);
	}

	await pool
		.request()
		.input('id', sql.VarChar(20), attempt.id)
		.input('auto_score', sql.Decimal(6, 2), autoScore)
		.input('actor_id', sql.VarChar(20), actor.id)
		.input('status', sql.VarChar(20), hasEssay ? 'submitted' : 'graded').query(`
      UPDATE exam_attempts SET submitted_at = GETDATE(), auto_score = @auto_score, status = @status,
        updated_at = GETDATE(), updated_by = @actor_id WHERE id = @id
    `);

	broadcast('update', { entity: 'exam_attempt' });

	if (!hasEssay) {
		// Không có câu tự luận nào chờ chấm — hoàn tất ngay, đổ điểm luôn.
		const paperRes = await pool.request().input('id', sql.VarChar(20), paperId).query('SELECT subject_id FROM exam_papers WHERE id = @id');
		await courseService.upsertGrade(info.enrollment_id, paperRes.recordset[0]?.subject_id || null, { score: autoScore }, actor.id);
	}

	return { attempt_id: attempt.id, auto_score: autoScore, has_essay: hasEssay, late };
};

module.exports = {
	listQuestions,
	getQuestion,
	createQuestion,
	createQuestionsBulk,
	updateQuestion,
	removeQuestion,
	listPapers,
	getPaper,
	setPaperQuestions,
	createPaper,
	updatePaper,
	removePaper,
	listAttempts,
	getAttemptForGrading,
	gradeEssayAnswer,
	listAvailablePapersForUser,
	startAttempt,
	submitAttempt,
};
