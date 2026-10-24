const { getPool, sql, withTransaction } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { httpError } = require('../../../utils/httpError');
const systemSettingService = require('../../settings/systemSettingService');
const certificateService = require('./certificateService');
const { DEFAULT_RULES, RULE_SETTING_KEYS, evaluate, partHours, round1 } = require('./gradeRules');
const { SESSION_IN_PROGRAM_SQL } = require('./sessionScope');

// ─── Bảng điểm 2 phần Lý thuyết + Thực hành (giai đoạn 4) ──────────────────
// 1 dòng grades / lượt ghi danh (subject_id NULL — UQ_grades_enrollment_course).
// theory_score / practice_score thang 10; score / result / classification là kết
// quả tính lại từ 2 phần + chuyên cần (gradeRules.evaluate) để nơi cũ (cổng /me,
// chứng chỉ, báo cáo) đọc tiếp được. Xem 2026-11-22_grading_theory_practice.sql.

const PARTS = ['theory', 'practice'];
const PART_LABEL = { theory: 'lý thuyết', practice: 'thực hành' };

const loadRules = async () => {
	const rules = { ...DEFAULT_RULES };
	for (const [name, key] of Object.entries(RULE_SETTING_KEYS)) {
		const raw = await systemSettingService.getValue(key, '');
		if (raw != null && raw !== '' && Number.isFinite(Number(raw))) rules[name] = Number(raw);
	}
	return rules;
};

// Buổi lý thuyết / thực hành: session_kind, chưa đặt thì vòng thực hành = practice.
const SESSION_KIND_SQL = `COALESCE(s.session_kind, CASE WHEN pl.lesson_kind = 'rotation' THEN 'practice' ELSE 'theory' END)`;

// Đề mà tài khoản @uid được chấm: có trong exam_paper_graders, hoặc đề chưa đặt
// người chấm và @uid là GV được phân công bài học của đề.
const PAPER_GRADER_SQL = (p) => `(
    EXISTS (SELECT 1 FROM exam_paper_graders g JOIN lecturers lec ON lec.id = g.lecturer_id
            WHERE g.paper_id = ${p}.id AND lec.user_id = @uid)
    OR (NOT EXISTS (SELECT 1 FROM exam_paper_graders g WHERE g.paper_id = ${p}.id)
        AND ${p}.subject_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM lecturer_assignments la JOIN lecturers lec ON lec.id = la.lecturer_id
                    WHERE la.course_id = ${p}.course_id AND la.subject_id = ${p}.subject_id AND lec.user_id = @uid))
  )`;

// Phần GV (theo tài khoản) được nhập điểm trong khóa:
//   lý thuyết — là người chấm của 1 đề lý thuyết của khóa;
//   thực hành — được phân công bài có tiết thực hành / vòng thực hành / cả khóa,
//               hoặc là người chấm của 1 đề thực hành.
// Không được phân công gì trong khóa ⇒ 403.
const teachingAccess = async (courseId, userId) => {
	const pool = await getPool();
	const r = (
		await pool
			.request()
			.input('course_id', sql.VarChar(20), courseId)
			.input('uid', sql.VarChar(20), userId).query(`
      SELECT
        CASE WHEN EXISTS (SELECT 1 FROM lecturer_assignments la JOIN lecturers lec ON lec.id = la.lecturer_id
                          WHERE la.course_id = @course_id AND lec.user_id = @uid) THEN 1 ELSE 0 END AS assigned,
        CASE WHEN EXISTS (SELECT 1 FROM exam_papers p WHERE p.course_id = @course_id AND p.exam_part = 'theory'
                          AND ${PAPER_GRADER_SQL('p')}) THEN 1 ELSE 0 END AS theory,
        CASE WHEN EXISTS (SELECT 1 FROM lecturer_assignments la JOIN lecturers lec ON lec.id = la.lecturer_id
                          LEFT JOIN program_lessons pl ON pl.id = la.subject_id
                          WHERE la.course_id = @course_id AND lec.user_id = @uid
                            AND (la.subject_id IS NULL OR pl.lesson_kind = 'rotation' OR ISNULL(pl.practice_hours, 0) > 0))
               OR EXISTS (SELECT 1 FROM exam_papers p WHERE p.course_id = @course_id AND p.exam_part = 'practice'
                          AND ${PAPER_GRADER_SQL('p')}) THEN 1 ELSE 0 END AS practice
    `)
	).recordset[0];
	if (!r?.assigned) throw httpError(403, 'Bạn không được phân công giảng dạy khóa học này.');
	return { theory: !!r.theory, practice: !!r.practice };
};

const FULL_ACCESS = { theory: true, practice: true };

// ─── Đọc bảng điểm ─────────────────────────────────────────────────────────
const loadRows = async (courseId, enrollmentIds) => {
	const pool = await getPool();
	const req = pool.request().input('course_id', sql.VarChar(20), courseId);
	const only = enrollmentIds?.length
		? `AND e.id IN (${enrollmentIds.map((id, i) => (req.input(`e${i}`, sql.VarChar(20), id), `@e${i}`)).join(',')})`
		: '';
	const r = await req.query(`
    -- Khóa chỉ 1 chương trình ⇒ lượt ghi danh chưa chọn chương trình lấy chương trình đó
    DECLARE @only_program VARCHAR(20) = (
      SELECT CASE WHEN COUNT(*) = 1 THEN MIN(program_id) END FROM course_programs WHERE course_id = @course_id);

    SELECT e.id AS enrollment_id, e.trainee_id, t.full_name AS trainee_name,
           tp.id AS program_id, tp.name AS program_name, tp.theory_hours, tp.practice_hours, tp.exam_parts,
           g.id AS grade_id, g.theory_score, g.practice_score, g.theory_flag, g.practice_flag,
           g.theory_attempt, g.practice_attempt, g.score, g.result, g.classification, g.note,
           g.locked_at, g.locked_by, lu.full_name AS locked_by_name,
           cert.id AS certificate_id, cert.cert_no, cert.status AS certificate_status,
           -- Kiểm tra đầu vào: chỉ tham khảo (so với điểm cuối khóa), không tính vào kết quả
           (SELECT AVG(CAST(x.score10 AS FLOAT)) FROM exam_attempts x JOIN exam_papers ep ON ep.id = x.paper_id
            WHERE x.enrollment_id = e.id AND ep.purpose = 'entrance' AND x.status = 'graded') AS entrance_score
    FROM course_enrollments e
    JOIN trainees t ON t.id = e.trainee_id
    LEFT JOIN training_programs tp ON tp.id = COALESCE(e.program_id, @only_program)
    LEFT JOIN grades g ON g.enrollment_id = e.id AND g.subject_id IS NULL
    LEFT JOIN users lu ON lu.id = g.locked_by
    LEFT JOIN certificates cert ON cert.enrollment_id = e.id
    WHERE e.course_id = @course_id AND e.status = 'approved' ${only}
    ORDER BY t.full_name, e.id;

    -- Chuyên cần: chỉ tính buổi đã điểm danh người đó, thuộc chương trình người đó
    -- theo học (bỏ bản ghi cũ ở buổi của lớp khác); 'late' tính là có mặt.
    SELECT a.enrollment_id, ${SESSION_KIND_SQL} AS kind,
           COUNT(*) AS held, SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent
    FROM class_sessions s
    LEFT JOIN program_lessons pl ON pl.id = s.subject_id
    JOIN attendance a ON a.session_id = s.id
    JOIN course_enrollments e ON e.id = a.enrollment_id
    WHERE s.course_id = @course_id AND ${SESSION_IN_PROGRAM_SQL('s', 'e')}
    GROUP BY a.enrollment_id, ${SESSION_KIND_SQL};
  `);
	const [rows, att] = r.recordsets;
	const attOf = (enrollmentId, kind) => {
		const x = att.find((a) => a.enrollment_id === enrollmentId && a.kind === kind);
		return x ? { held: x.held, absent: x.absent } : { held: 0, absent: 0 };
	};
	return rows.map((row) => ({
		...row,
		theory_score: row.theory_score == null ? null : Number(row.theory_score),
		practice_score: row.practice_score == null ? null : Number(row.practice_score),
		entrance_score: row.entrance_score == null ? null : round1(row.entrance_score),
		theory_attempt: row.theory_attempt ?? 1,
		practice_attempt: row.practice_attempt ?? 1,
		attendance: {
			theory: attOf(row.enrollment_id, 'theory'),
			practice: attOf(row.enrollment_id, 'practice'),
		},
	}));
};

// Phần thi theo cấu hình chương trình (exam_parts), chưa đặt thì suy theo số tiết.
const hoursOf = (row) =>
	partHours({
		theoryHours: row.theory_hours,
		practiceHours: row.practice_hours,
		examParts: row.exam_parts,
	});

const evaluateRow = (row, rules) =>
	evaluate({
		theory: row.theory_score,
		practice: row.practice_score,
		theoryFlag: row.theory_flag,
		practiceFlag: row.practice_flag,
		theoryAttendance: row.attendance.theory,
		practiceAttendance: row.attendance.practice,
		...hoursOf(row),
		rules,
	});

const getGradebook = async (courseId, access = FULL_ACCESS) => {
	const [rules, rows] = await Promise.all([loadRules(), loadRows(courseId)]);
	return {
		rules,
		access,
		locked: rows.length > 0 && rows.every((r) => r.locked_at),
		rows: rows.map((row) => ({ ...row, computed: evaluateRow(row, rules) })),
	};
};

// Ghi lại score / result / classification theo 2 phần (sau mỗi lần sửa điểm).
const recompute = async (courseId, enrollmentIds) => {
	const [rules, rows] = await Promise.all([loadRules(), loadRows(courseId, enrollmentIds)]);
	const pool = await getPool();
	for (const row of rows) {
		if (!row.grade_id) continue;
		const c = evaluateRow(row, rules);
		await pool
			.request()
			.input('id', sql.VarChar(20), row.grade_id)
			.input('score', sql.Decimal(5, 2), c.total)
			.input('result', sql.VarChar(20), c.result)
			.input('classification', sql.NVarChar(20), c.classification)
			.query(
				'UPDATE grades SET score = @score, result = @result, classification = @classification WHERE id = @id',
			);
	}
};

// ─── Ghi điểm ──────────────────────────────────────────────────────────────
const ensureGradeRow = async (request, enrollmentId, programId, actorId) =>
	(
		await request
			.input('enrollment_id', sql.VarChar(20), enrollmentId)
			.input('program_id', sql.VarChar(20), programId || null)
			.input('actor_id', sql.VarChar(20), actorId).query(`
      DECLARE @id VARCHAR(20) = (SELECT id FROM grades WITH (UPDLOCK, HOLDLOCK)
                                 WHERE enrollment_id = @enrollment_id AND subject_id IS NULL);
      IF @id IS NULL
      BEGIN
        EXEC sp_gen_grade_id @actor_id = @actor_id, @new_id = @id OUTPUT;
        INSERT INTO grades (id, enrollment_id, subject_id, program_id, created_by)
        VALUES (@id, @enrollment_id, NULL, @program_id, @actor_id);
      END
      SELECT g.id, g.locked_at, g.theory_score, g.practice_score, g.theory_flag, g.practice_flag,
             g.theory_attempt, g.practice_attempt
      FROM grades g WHERE g.id = @id;
    `)
	).recordset[0];

// Thi lại: bảng điểm giữ điểm CAO NHẤT các lần (GRADE_MAX_RETAKES), lịch sử ghi điểm thật từng lần.
const writePart = async (tx, grade, enrollmentId, part, score, flag, source, actorId, note) => {
	const attempt = grade[`${part}_attempt`] ?? 1;
	let kept = score;
	if (score != null && attempt > 1) {
		const best = (
			await new sql.Request(tx)
				.input('enrollment_id', sql.VarChar(20), enrollmentId)
				.input('part', sql.VarChar(10), part)
				.input('attempt_no', sql.Int, attempt)
				.query(
					'SELECT MAX(score) AS best FROM grade_history WHERE enrollment_id = @enrollment_id AND part = @part AND attempt_no < @attempt_no',
				)
		).recordset[0]?.best;
		if (best != null && Number(best) > Number(score)) kept = Number(best);
	}
	await new sql.Request(tx)
		.input('id', sql.VarChar(20), grade.id)
		.input('score', sql.Decimal(4, 1), kept)
		.input('flag', sql.VarChar(10), flag)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			`UPDATE grades SET ${part}_score = @score, ${part}_flag = @flag, updated_at = GETDATE(), updated_by = @actor_id WHERE id = @id`,
		);
	await new sql.Request(tx)
		.input('enrollment_id', sql.VarChar(20), enrollmentId)
		.input('part', sql.VarChar(10), part)
		.input('attempt_no', sql.Int, attempt)
		.input('score', sql.Decimal(4, 1), score)
		.input('flag', sql.VarChar(10), flag)
		.input('source', sql.VarChar(20), source)
		.input('note', sql.NVarChar(255), note || null)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      INSERT INTO grade_history (enrollment_id, part, attempt_no, score, flag, source, note, changed_by)
      VALUES (@enrollment_id, @part, @attempt_no, @score, @flag, @source, @note, @actor_id)
    `);
};

const normScore = (v) => {
	if (v === null || v === '' || v === undefined) return null;
	const n = Number(v);
	if (!Number.isFinite(n) || n < 0 || n > 10)
		throw httpError(400, `Điểm "${v}" không hợp lệ (0–10).`);
	return round1(n);
};
const normFlag = (v) => {
	if (!v) return null;
	if (!['absent', 'exempt'].includes(v)) throw httpError(400, 'Đánh dấu không hợp lệ.');
	return v;
};

/**
 * Lưu cả bảng 1 lần (1 transaction). rows: [{ enrollment_id, theory_score?, practice_score?,
 * theory_flag?, practice_flag?, note? }] — trường không gửi thì giữ nguyên.
 * access: phần được sửa (GV chỉ phần mình được phân).
 */
const saveBulk = async (
	courseId,
	rows,
	actorId,
	{ access = FULL_ACCESS, source = 'manual' } = {},
) => {
	if (!Array.isArray(rows) || !rows.length) return { saved: 0 };
	const current = new Map((await loadRows(courseId)).map((r) => [r.enrollment_id, r]));
	const changed = [];

	await withTransaction(async (tx) => {
		for (const input of rows) {
			const row = current.get(input.enrollment_id);
			if (!row) throw httpError(400, 'Có học viên không thuộc khóa học hoặc chưa được duyệt.');

			const edits = [];
			for (const part of PARTS) {
				const hasScore = input[`${part}_score`] !== undefined;
				const hasFlag = input[`${part}_flag`] !== undefined;
				if (!hasScore && !hasFlag) continue;
				const flag = hasFlag ? normFlag(input[`${part}_flag`]) : row[`${part}_flag`];
				const score = flag
					? null
					: hasScore
						? normScore(input[`${part}_score`])
						: row[`${part}_score`];
				if (score === row[`${part}_score`] && flag === (row[`${part}_flag`] ?? null)) continue;
				if (!(hoursOf(row)[`${part}Hours`] > 0))
					throw httpError(
						400,
						`Chương trình của ${row.trainee_name} không thi phần ${PART_LABEL[part]}.`,
					);
				if (!access[part])
					throw httpError(
						403,
						`Bạn không được phân công nhập điểm ${PART_LABEL[part]} của khóa này.`,
					);
				edits.push({ part, score, flag });
			}
			const noteChanged = input.note !== undefined && (input.note || null) !== (row.note || null);
			if (!edits.length && !noteChanged) continue;
			if (row.locked_at)
				throw httpError(409, `Điểm của ${row.trainee_name} đã khóa, cần mở khóa trước khi sửa.`);

			const grade = await ensureGradeRow(
				new sql.Request(tx),
				row.enrollment_id,
				row.program_id,
				actorId,
			);
			for (const e of edits)
				await writePart(tx, grade, row.enrollment_id, e.part, e.score, e.flag, source, actorId);
			if (noteChanged)
				await new sql.Request(tx)
					.input('id', sql.VarChar(20), grade.id)
					.input('note', sql.NVarChar(255), input.note || null)
					.query('UPDATE grades SET note = @note WHERE id = @id');
			changed.push(row.enrollment_id);
		}
	});

	if (changed.length) {
		await recompute(courseId, changed);
		broadcast('update', { entity: 'grade' });
	}
	return { saved: changed.length };
};

// Điểm từ bài thi trên hệ thống (đã quy về thang 10) — bỏ qua nếu điểm đã khóa.
const setPartFromExam = async (enrollmentId, part, score10, actorId) => {
	const pool = await getPool();
	const info = (
		await pool
			.request()
			.input('id', sql.VarChar(20), enrollmentId)
			.query('SELECT course_id, program_id FROM course_enrollments WHERE id = @id')
	).recordset[0];
	if (!info) return;
	let skipped = false;
	await withTransaction(async (tx) => {
		const grade = await ensureGradeRow(new sql.Request(tx), enrollmentId, info.program_id, actorId);
		if (grade.locked_at) {
			skipped = true;
			return;
		}
		await writePart(tx, grade, enrollmentId, part, score10, null, 'exam', actorId);
	});
	if (skipped) return;
	await recompute(info.course_id, [enrollmentId]);
	broadcast('update', { entity: 'grade' });
};

// ─── Khóa điểm / mở khóa ───────────────────────────────────────────────────
const lock = async (courseId, actorId) => {
	const rows = await loadRows(courseId);
	if (!rows.length) throw httpError(400, 'Khóa học chưa có học viên được duyệt.');
	await withTransaction(async (tx) => {
		for (const row of rows) {
			const grade = await ensureGradeRow(
				new sql.Request(tx),
				row.enrollment_id,
				row.program_id,
				actorId,
			);
			if (grade.locked_at) continue;
			await new sql.Request(tx)
				.input('id', sql.VarChar(20), grade.id)
				.input('actor_id', sql.VarChar(20), actorId)
				.query('UPDATE grades SET locked_at = GETDATE(), locked_by = @actor_id WHERE id = @id');
		}
	});
	await recompute(courseId);
	broadcast('update', { entity: 'grade' });
	return getGradebook(courseId);
};

const unlock = async (courseId, actorId, reason) => {
	const pool = await getPool();
	await pool
		.request()
		.input('course_id', sql.VarChar(20), courseId)
		.input('actor_id', sql.VarChar(20), actorId)
		.input('note', sql.NVarChar(255), reason ? `Mở khóa điểm: ${reason}` : 'Mở khóa điểm').query(`
      UPDATE g SET locked_at = NULL, locked_by = NULL, updated_at = GETDATE(), updated_by = @actor_id
      FROM grades g JOIN course_enrollments e ON e.id = g.enrollment_id
      WHERE e.course_id = @course_id AND g.subject_id IS NULL AND g.locked_at IS NOT NULL;
      -- Ghi nhật ký vào lịch sử điểm (phần lý thuyết, giữ nguyên điểm hiện có)
      INSERT INTO grade_history (enrollment_id, part, attempt_no, score, flag, source, note, changed_by)
      SELECT g.enrollment_id, 'theory', g.theory_attempt, g.theory_score, g.theory_flag, 'unlock', @note, @actor_id
      FROM grades g JOIN course_enrollments e ON e.id = g.enrollment_id
      WHERE e.course_id = @course_id AND g.subject_id IS NULL;
    `);
	broadcast('update', { entity: 'grade' });
	return getGradebook(courseId);
};

// ─── Thi lại ───────────────────────────────────────────────────────────────
// Chỉ khi phần đó chưa đạt (vắng thi / dưới ngưỡng) và còn lượt (1 + GRADE_MAX_RETAKES).
// Tăng lần thi, xóa điểm phần đó để nhập lần mới; điểm cũ còn trong grade_history.
const retake = async (enrollmentId, part, actorId) => {
	if (!PARTS.includes(part)) throw httpError(400, 'Phần thi không hợp lệ.');
	const pool = await getPool();
	const courseId = (
		await pool
			.request()
			.input('id', sql.VarChar(20), enrollmentId)
			.query('SELECT course_id FROM course_enrollments WHERE id = @id')
	).recordset[0]?.course_id;
	if (!courseId) throw httpError(404, 'Không tìm thấy lượt ghi danh.');
	const [rules, [row]] = await Promise.all([loadRules(), loadRows(courseId, [enrollmentId])]);
	if (!row?.grade_id) throw httpError(400, 'Học viên chưa có điểm phần này.');
	if (row.locked_at) throw httpError(409, 'Điểm đã khóa, cần mở khóa trước.');
	const c = evaluateRow(row, rules)[part];
	if (c.passed == null && c.applies)
		throw httpError(400, `Chưa có điểm phần ${PART_LABEL[part]} của lần thi hiện tại.`);
	if (c.passed !== false)
		throw httpError(400, `Học viên chưa trượt phần ${PART_LABEL[part]}, không cần thi lại.`);
	const attempt = row[`${part}_attempt`];
	if (attempt >= 1 + rules.maxRetakes)
		throw httpError(
			409,
			`Đã hết lượt thi lại phần ${PART_LABEL[part]} (tối đa ${rules.maxRetakes} lần).`,
		);

	await withTransaction(async (tx) => {
		await new sql.Request(tx)
			.input('id', sql.VarChar(20), row.grade_id)
			.input('actor_id', sql.VarChar(20), actorId)
			.query(
				`UPDATE grades SET ${part}_attempt = ${part}_attempt + 1, ${part}_score = NULL, ${part}_flag = NULL,
				 updated_at = GETDATE(), updated_by = @actor_id WHERE id = @id`,
			);
		await writePart(
			tx,
			{ id: row.grade_id, [`${part}_attempt`]: attempt + 1 },
			enrollmentId,
			part,
			null,
			null,
			'retake',
			actorId,
			`Thi lại lần ${attempt}`,
		);
	});
	await recompute(courseId, [enrollmentId]);
	broadcast('update', { entity: 'grade' });
};

const history = async (enrollmentId) => {
	const pool = await getPool();
	const r = await pool.request().input('id', sql.VarChar(20), enrollmentId).query(`
    SELECT h.*, u.full_name AS changed_by_name
    FROM grade_history h LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.enrollment_id = @id ORDER BY h.changed_at DESC, h.id DESC
  `);
	return r.recordset;
};

// ─── Cấp giấy chứng nhận hàng loạt cho người Đạt (bảng điểm đã khóa) ─────────
const issueCertificatesForPassed = async (courseId, actorId, expiryDate) => {
	const book = await getGradebook(courseId);
	if (!book.locked) throw httpError(409, 'Cần khóa điểm trước khi cấp giấy chứng nhận hàng loạt.');
	const targets = book.rows.filter((r) => r.computed.result === 'pass' && !r.certificate_id);
	const issued = [];
	for (const r of targets)
		issued.push(await certificateService.issueCertificate(r.enrollment_id, actorId, expiryDate));
	return { issued: issued.length };
};

module.exports = {
	PAPER_GRADER_SQL,
	teachingAccess,
	getGradebook,
	saveBulk,
	setPartFromExam,
	lock,
	unlock,
	retake,
	history,
	issueCertificatesForPassed,
	recompute,
};
