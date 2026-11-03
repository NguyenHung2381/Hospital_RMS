const { getPool, sql, jsonRows, newIdSql, updateReturning } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { randomUUID } = require('crypto');
const { httpError } = require('../../../utils/httpError');
const { seededRandom, shuffle } = require('./examGen');
const { TRAINEE_OF_USER_SQL } = require('../trainees/traineeOfUser');
const {
	parseOptions,
	isRandom,
	bankOf,
	drawSet,
	attemptQuestionIds,
	loadQuestions,
} = require('./examShared');
const { pushExamScore } = require('./examGradingService');

// Lần thi hiện tại của phần (grades.theory_attempt / practice_attempt) — đề cuối khóa
// thi lại = lượt mới đúng số lần này. Đề đầu vào chỉ 1 lần.
const WANT_ATTEMPT_SQL = (p, e) => `CASE WHEN ${p}.purpose = 'final' THEN COALESCE((
    SELECT CASE ${p}.exam_part WHEN 'practice' THEN g.practice_attempt ELSE g.theory_attempt END
    FROM grades g WHERE g.enrollment_id = ${e}.id AND g.subject_id IS NULL), 1) ELSE 1 END`;
// ─── Học viên làm bài ────────────────────────────────────────────────────────
// Đề của lớp mình: đề không gắn lớp, hoặc đúng chương trình đã ghi danh.
const PAPER_FOR_ENROLLMENT_SQL = (p, e) =>
	`(${p}.program_id IS NULL OR ${e}.program_id IS NULL OR ${p}.program_id = ${e}.program_id)`;

// Đề đang mở (status='published') dành cho lớp actor đã được duyệt — kèm lượt làm bài
// mới nhất; đã được thi lại (lần thi của phần > lần của lượt cũ) thì coi như chưa làm.
const listAvailablePapersForUser = async (actor) => {
	const pool = await getPool();
	const r = await pool.request().input('user_id', sql.VarChar(20), actor.id).query(`
    SELECT p.id, p.title, p.duration_minutes, p.purpose, p.exam_part, c.id AS course_id, c.name AS course_name,
           e.id AS enrollment_id, att.id AS attempt_id, att.status AS attempt_status, att.attempt_no,
           ${WANT_ATTEMPT_SQL('p', 'e')} AS want_no
    FROM exam_papers p
    JOIN courses c ON c.id = p.course_id
    JOIN course_enrollments e ON e.course_id = c.id AND e.status = 'approved' AND ${PAPER_FOR_ENROLLMENT_SQL('p', 'e')}
    JOIN trainees t ON t.id = e.trainee_id AND ${TRAINEE_OF_USER_SQL('t', '@user_id')}
    OUTER APPLY (SELECT TOP 1 x.id, x.status, x.attempt_no FROM exam_attempts x
                 WHERE x.paper_id = p.id AND x.enrollment_id = e.id ORDER BY x.attempt_no DESC) att
    WHERE p.status = 'published'
    ORDER BY p.created_at DESC
  `);
	return r.recordset.map(({ want_no, attempt_no, ...p }) =>
		attempt_no != null && attempt_no < want_no
			? { ...p, attempt_id: null, attempt_status: null, retake_no: want_no }
			: p,
	);
};

const assertEnrollment = async (pool, paperId, actor) => {
	const r = await pool
		.request()
		.input('paper_id', sql.VarChar(20), paperId)
		.input('user_id', sql.VarChar(20), actor.id).query(`
      SELECT p.*, e.id AS enrollment_id, ${WANT_ATTEMPT_SQL('p', 'e')} AS want_no
      FROM exam_papers p
      JOIN course_enrollments e ON e.course_id = p.course_id AND e.status = 'approved' AND ${PAPER_FOR_ENROLLMENT_SQL('p', 'e')}
      JOIN trainees t ON t.id = e.trainee_id AND ${TRAINEE_OF_USER_SQL('t', '@user_id')}
      WHERE p.id = @paper_id
    `);
	const row = r.recordset[0];
	if (!row) {
		throw httpError(403, 'Bạn không có quyền làm đề thi này.');
	}
	if (row.status !== 'published') {
		throw httpError(403, 'Đề thi hiện không mở.');
	}
	return row;
};

// Bộ câu cho lượt mới: đề chọn tay = câu của đề; đề chung = câu của đề, trộn thứ tự;
// nhiều mã = chia lần lượt các mã; mỗi HV 1 đề (và mọi đề ngẫu nhiên khi THI LẠI) = bốc
// mới từ ngân hàng, tránh câu học viên đã gặp ở các lượt trước.
const buildAttemptQuestions = async (paper, enrollmentId, attemptNo, seed) => {
	const pool = await getPool();
	const rand = seededRandom(seed);
	if (isRandom(paper) && (paper.code_mode === 'per_trainee' || attemptNo > 1)) {
		const seen = (
			await pool
				.request()
				.input('enrollment_id', sql.VarChar(20), enrollmentId)
				.query(
					'SELECT question_ids FROM exam_attempts WHERE enrollment_id = @enrollment_id AND question_ids IS NOT NULL',
				)
		).recordset.flatMap((x) => JSON.parse(x.question_ids));
		return { ids: drawSet(paper, await bankOf(paper), new Set(seen), rand), codeNo: null };
	}
	let codeNo = null;
	if (paper.code_mode === 'codes') {
		const n = (
			await pool
				.request()
				.input('paper_id', sql.VarChar(20), paper.id)
				.query('SELECT COUNT(*) AS n FROM exam_attempts WHERE paper_id = @paper_id')
		).recordset[0].n;
		codeNo = (n % Math.max(1, paper.code_count || 1)) + 1;
	}
	const ids = (
		await pool
			.request()
			.input('paper_id', sql.VarChar(20), paper.id)
			.input('code_no', sql.Int, codeNo)
			.query(
				'SELECT question_id FROM exam_paper_questions WHERE paper_id = @paper_id AND ((@code_no IS NULL AND code_no IS NULL) OR code_no = @code_no) ORDER BY sort_order',
			)
	).recordset.map((x) => x.question_id);
	// Đề chọn tay giữ thứ tự soạn; đề ngẫu nhiên trộn thứ tự câu cho từng học viên
	return { ids: paper.code_mode ? shuffle(ids, rand) : ids, codeNo };
};

// Bắt đầu làm bài — đang có lượt dở thì trả lại (resume). Lượt mới (lần đầu / thi lại)
// lưu sẵn bộ câu + thứ tự. Đề ngẫu nhiên: trộn cả thứ tự phương án (cố định theo lượt).
const startAttempt = async (paperId, actor) => {
	const pool = await getPool();
	const info = await assertEnrollment(pool, paperId, actor);

	const latest = (
		await pool
			.request()
			.input('paper_id', sql.VarChar(20), paperId)
			.input('enrollment_id', sql.VarChar(20), info.enrollment_id)
			.query(
				'SELECT TOP 1 * FROM exam_attempts WHERE paper_id = @paper_id AND enrollment_id = @enrollment_id ORDER BY attempt_no DESC',
			)
	).recordset[0];

	let attempt = latest;
	if (!latest || latest.attempt_no < info.want_no) {
		const attemptNo = Math.max(1, info.want_no);
		const newId = `EA${randomUUID().replace(/-/g, '').slice(0, 18).toUpperCase()}`;
		const { ids, codeNo } = await buildAttemptQuestions(info, info.enrollment_id, attemptNo, newId);
		if (!ids.length) throw httpError(400, 'Đề thi chưa có câu hỏi.');
		attempt = (
			await pool
				.request()
				.input('id', sql.VarChar(20), newId)
				.input('paper_id', sql.VarChar(20), paperId)
				.input('enrollment_id', sql.VarChar(20), info.enrollment_id)
				.input('attempt_no', sql.Int, attemptNo)
				.input('code_no', sql.Int, codeNo)
				.input('question_ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
				.input('actor_id', sql.VarChar(20), actor.id).query(`
          INSERT INTO exam_attempts (id, paper_id, enrollment_id, attempt_no, code_no, question_ids, created_by)
          VALUES (@id, @paper_id, @enrollment_id, @attempt_no, @code_no, @question_ids, @actor_id);
          SELECT * FROM exam_attempts WHERE id = @id;`)
		).recordset[0];
	} else if (latest.status !== 'in_progress') {
		throw httpError(409, 'Bạn đã nộp đề thi này rồi.');
	}

	const questions = await loadQuestions(
		await attemptQuestionIds(attempt),
		'q.id, q.question_type, q.question_text, q.options, q.points, q.image_url',
	);
	const { question_ids: _ids, ...attemptOut } = attempt;
	return {
		attempt: attemptOut,
		duration_minutes: info.duration_minutes,
		questions: questions.map((q) => {
			const row = parseOptions(q);
			return info.code_mode && row.options?.length
				? { ...row, options: shuffle(row.options, seededRandom(`${attempt.id}:${q.id}`)) }
				: row;
		}),
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
	// Đồng thời tính trễ hạn theo giờ của DB (không tin đồng hồ trình duyệt):
	// quá started_at + thời lượng + SUBMIT_GRACE_SEC thì đáp án không được tính.
	const limitSec = (Number(info.duration_minutes) || 0) * 60 + SUBMIT_GRACE_SEC;
	const claimed = (
		await pool
			.request()
			.input('paper_id', sql.VarChar(20), paperId)
			.input('enrollment_id', sql.VarChar(20), info.enrollment_id)
			.input('actor_id', sql.VarChar(20), actor.id)
			.query(
				updateReturning(
					`UPDATE exam_attempts SET status = 'submitted', submitted_at = GETDATE(),
					updated_at = GETDATE(), updated_by = @actor_id`,
					"paper_id = @paper_id AND enrollment_id = @enrollment_id AND status = 'in_progress'",
					[
						['new.id', 'id', 'VARCHAR(20)'],
						['new.started_at', 'started_at', 'DATETIME'],
						['new.submitted_at', 'submitted_at', 'DATETIME'],
						['new.question_ids', 'question_ids', 'NVARCHAR(MAX)'],
					],
				),
			)
	).recordset[0];
	if (!claimed) {
		throw httpError(409, 'Không tìm thấy lượt làm bài đang mở, hoặc bạn đã nộp rồi.');
	}
	const attempt = { id: claimed.id };
	const late =
		limitSec > SUBMIT_GRACE_SEC &&
		claimed.started_at != null &&
		new Date(claimed.submitted_at).getTime() - new Date(claimed.started_at).getTime() >
			limitSec * 1000;
	// Nộp quá giờ: vẫn đóng lượt làm bài (không làm lại được) nhưng bỏ đáp án
	if (late) answers = [];

	const questions = await loadQuestions(
		await attemptQuestionIds({ ...claimed, paper_id: paperId }),
		'q.id, q.question_type, q.correct_option, q.points',
	);
	const answerMap = new Map((answers || []).map((a) => [a.question_id, a]));

	let autoScore = 0;
	let hasEssay = false;
	const rows = questions.map((q) => {
		const ans = answerMap.get(q.id);
		const isEssay = q.question_type === 'essay';
		hasEssay = hasEssay || isEssay;
		const selected = !isEssay ? ans?.selected_option || null : null;
		const scoreAwarded = isEssay ? null : selected && selected === q.correct_option ? q.points : 0;
		if (!isEssay) autoScore += Number(scoreAwarded);
		return {
			question_id: q.id,
			selected_option: selected,
			essay_text: isEssay ? ans?.essay_text || null : null,
			score_awarded: scoreAwarded,
		};
	});

	// Ghi mọi đáp án + đóng lượt trong 1 round-trip (trước đây 1 INSERT / câu hỏi)
	await pool
		.request()
		.input('id', sql.VarChar(20), attempt.id)
		.input('answers', sql.NVarChar(sql.MAX), JSON.stringify(rows))
		.input('auto_score', sql.Decimal(6, 2), autoScore)
		.input('actor_id', sql.VarChar(20), actor.id)
		.input('status', sql.VarChar(20), hasEssay ? 'submitted' : 'graded').query(`
      INSERT INTO exam_answers (id, attempt_id, question_id, selected_option, essay_text, score_awarded)
      SELECT ${newIdSql('EAN', 17)}, @id, j.question_id, j.selected_option, j.essay_text, j.score_awarded
      FROM ${jsonRows('@answers', 'j', [
				['question_id', 'VARCHAR(20)'],
				['selected_option', 'NVARCHAR(255)'],
				['essay_text', 'NVARCHAR(MAX)'],
				['score_awarded', 'DECIMAL(4, 1)'],
			])};
      UPDATE exam_attempts SET submitted_at = GETDATE(), auto_score = @auto_score, status = @status,
        updated_at = GETDATE(), updated_by = @actor_id WHERE id = @id
    `);

	broadcast('update', { entity: 'exam_attempt' });

	// Không có câu tự luận nào chờ chấm — hoàn tất ngay, đổ điểm luôn.
	if (!hasEssay) await pushExamScore(attempt.id, actor.id);

	return { attempt_id: attempt.id, auto_score: autoScore, has_essay: hasEssay, late };
};

module.exports = {
	listAvailablePapersForUser,
	startAttempt,
	submitAttempt,
};
