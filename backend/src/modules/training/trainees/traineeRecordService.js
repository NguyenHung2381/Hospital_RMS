const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { httpError } = require('../../../utils/httpError');
const trainingFileService = require('../trainingFileService');
const gradebookService = require('../courses/gradebookService');
const { SESSION_IN_PROGRAM_SQL } = require('../courses/sessionScope');
const { TRAINEE_OF_USER_SQL } = require('./traineeOfUser');

// ─── Hồ sơ học viên đầy đủ (giai đoạn 3, docs/ke-hoach-nang-cap-dao-tao.md) ─────
// Chỉ đọc: điểm danh, kết quả & điểm, checklist giấy tờ theo loại khóa đã ghi danh.
// Ghi: duyệt file học viên tự nộp; học viên tự nộp file ở cổng /me (status 'pending').

const { DOC_REQUIRED_SQL } = require('./traineeDocumentSql');

const assertTrainee = async (pool, traineeId) => {
	const t = (
		await pool
			.request()
			.input('id', sql.VarChar(20), traineeId)
			.query('SELECT id, user_id, full_name FROM trainees WHERE id = @id')
	).recordset[0];
	if (!t) throw httpError(404, 'Không tìm thấy học viên.');
	return t;
};

// ─── Checklist giấy tờ ─────────────────────────────────────────────────────
const documentChecklist = async (traineeId) => {
	const pool = await getPool();
	await assertTrainee(pool, traineeId);
	const r = await pool.request().input('trainee_id', sql.VarChar(20), traineeId).query(`
    SELECT dt.id, dt.name, dt.display_order,
           CASE WHEN ${DOC_REQUIRED_SQL('t', 'dt')} THEN 1 ELSE 0 END AS required
    FROM trainee_document_types dt CROSS JOIN (SELECT @trainee_id AS id) t
    ORDER BY dt.display_order, dt.name;

    SELECT d.id, d.doc_type, d.status, d.review_note, d.created_at, d.reviewed_at,
           ru.full_name AS reviewed_by_name, f.file_name, f.file_url, f.mime_type, f.file_size
    FROM trainee_documents d
    JOIN training_files f ON f.id = d.file_id AND f.is_deleted = 0
    LEFT JOIN users ru ON ru.id = d.reviewed_by
    WHERE d.trainee_id = @trainee_id
    ORDER BY d.created_at DESC;
  `);
	const [types, docs] = r.recordsets;
	const items = types.map((ty) => {
		const own = docs.filter((d) => d.doc_type === ty.id);
		const state = own.some((d) => d.status === 'approved')
			? 'done'
			: own.some((d) => d.status === 'pending')
				? 'pending'
				: 'missing';
		return { id: ty.id, name: ty.name, required: !!ty.required, state, documents: own };
	});
	const required = items.filter((i) => i.required);
	return {
		items,
		required_total: required.length,
		required_done: required.filter((i) => i.state === 'done').length,
	};
};

// Cán bộ duyệt / từ chối file học viên tự nộp
const reviewDocument = async (docId, status, note, actorId) => {
	if (!['approved', 'rejected'].includes(status)) throw httpError(400, 'Trạng thái không hợp lệ.');
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), docId)
		.input('status', sql.VarChar(10), status)
		.input('note', sql.NVarChar(255), note || null)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			`UPDATE trainee_documents SET status = @status, review_note = @note, reviewed_at = GETDATE(), reviewed_by = @actor_id
			 WHERE id = @id`,
		);
	if (!r.rowsAffected[0]) throw httpError(404, 'Không tìm thấy hồ sơ.');
	broadcast('update', { entity: 'trainee_document' });
};

// ─── Học viên tự nộp ở cổng /me ────────────────────────────────────────────
const traineeOfUser = async (pool, userId) => {
	const t = (
		await pool
			.request()
			.input('uid', sql.VarChar(20), userId)
			.query('SELECT TOP 1 id FROM trainees WHERE user_id = @uid ORDER BY created_at DESC')
	).recordset[0];
	if (!t) throw httpError(404, 'Tài khoản của bạn chưa gắn với hồ sơ học viên.');
	return t.id;
};

const traineeIdOfUser = async (userId) => traineeOfUser(await getPool(), userId);

// Điểm danh / kết quả của tôi: nhận cả hồ sơ học viên của nhân viên nội viện
// (staff_user_id — xem traineeOfUser.js); ưu tiên hồ sơ gắn tài khoản học viên.
// Giấy tờ hồ sơ vẫn dùng traineeIdOfUser (chỉ tài khoản học viên).
const myTraineeId = async (userId) => {
	const pool = await getPool();
	const t = (
		await pool.request().input('uid', sql.VarChar(20), userId).query(`
      SELECT TOP 1 t.id FROM trainees t
      WHERE ${TRAINEE_OF_USER_SQL('t')}
      ORDER BY CASE WHEN t.user_id = @uid THEN 0 ELSE 1 END, t.created_at DESC`)
	).recordset[0];
	if (!t) throw httpError(404, 'Bạn chưa có hồ sơ học viên — hãy đăng ký một khóa học.');
	return t.id;
};

const myChecklist = async (userId) =>
	documentChecklist(await traineeOfUser(await getPool(), userId));

const addMyDocument = async (userId, docType, file) => {
	const pool = await getPool();
	const traineeId = await traineeOfUser(pool, userId);
	const type = (
		await pool
			.request()
			.input('id', sql.VarChar(30), docType || '')
			.query('SELECT id FROM trainee_document_types WHERE id = @id')
	).recordset[0];
	if (!type) throw httpError(400, 'Vui lòng chọn loại giấy tờ.');
	const saved = await trainingFileService.saveUploadedFile(
		'trainee_document',
		traineeId,
		file,
		userId,
	);
	await pool
		.request()
		.input('trainee_id', sql.VarChar(20), traineeId)
		.input('doc_type', sql.VarChar(30), type.id)
		.input('file_id', sql.VarChar(20), saved.id)
		.input('actor_id', sql.VarChar(20), userId).query(`
      DECLARE @new_id VARCHAR(20) = 'HS' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO trainee_documents (id, trainee_id, doc_type, file_id, status, created_by)
      VALUES (@new_id, @trainee_id, @doc_type, @file_id, 'pending', @actor_id);
    `);
	broadcast('update', { entity: 'trainee_document' });
	return myChecklist(userId);
};

// Chỉ rút lại được file của mình đang chờ duyệt / bị từ chối
const removeMyDocument = async (userId, docId) => {
	const pool = await getPool();
	const traineeId = await traineeOfUser(pool, userId);
	const doc = (
		await pool
			.request()
			.input('id', sql.VarChar(20), docId)
			.input('trainee_id', sql.VarChar(20), traineeId)
			.query(
				"SELECT file_id FROM trainee_documents WHERE id = @id AND trainee_id = @trainee_id AND status <> 'approved'",
			)
	).recordset[0];
	if (!doc) throw httpError(404, 'Không tìm thấy hồ sơ đang chờ duyệt.');
	await pool
		.request()
		.input('id', sql.VarChar(20), docId)
		.query('DELETE FROM trainee_documents WHERE id = @id');
	await trainingFileService.softDelete(doc.file_id, userId);
	broadcast('update', { entity: 'trainee_document' });
	return myChecklist(userId);
};

// ─── Điểm danh theo từng khóa ──────────────────────────────────────────────
const SESSION_KIND_SQL = `COALESCE(s.session_kind, CASE WHEN pl.lesson_kind = 'rotation' THEN 'practice' ELSE 'theory' END)`;

const attendance = async (traineeId) => {
	const pool = await getPool();
	await assertTrainee(pool, traineeId);
	const r = await pool.request().input('trainee_id', sql.VarChar(20), traineeId).query(`
    SELECT e.id AS enrollment_id, c.id AS course_id, c.name AS course_name, c.training_type_id,
           tt.name AS training_type_name, c.start_date, c.end_date,
           tp.code AS program_code, tp.name AS program_name
    FROM course_enrollments e
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN training_types tt ON tt.id = c.training_type_id
    LEFT JOIN training_programs tp ON tp.id = e.program_id
    WHERE e.trainee_id = @trainee_id AND e.status = 'approved'
    ORDER BY c.start_date DESC;

    -- Buổi đã diễn ra của chương trình đã ghi danh (kể cả buổi chưa điểm danh người này)
    SELECT e.id AS enrollment_id, s.id AS session_id, s.session_date, s.start_time, s.end_time,
           pl.title AS lesson_title, ${SESSION_KIND_SQL} AS kind, a.status, a.method, a.note
    FROM course_enrollments e
    JOIN class_sessions s ON s.course_id = e.course_id
    LEFT JOIN program_lessons pl ON pl.id = s.subject_id
    LEFT JOIN attendance a ON a.session_id = s.id AND a.enrollment_id = e.id
    WHERE e.trainee_id = @trainee_id AND e.status = 'approved'
      AND s.session_date <= CAST(GETDATE() AS DATE) AND ${SESSION_IN_PROGRAM_SQL('s', 'e')}
    ORDER BY s.session_date DESC, s.start_time DESC;

    -- GPHN: theo lượt khoa
    SELECT r.enrollment_id, r.id, r.seq, r.round_title, r.department_name, r.start_date, r.end_date,
           r.mentor_name, r.result, r.attempt_no
    FROM enrollment_rotations r
    JOIN course_enrollments e ON e.id = r.enrollment_id
    WHERE e.trainee_id = @trainee_id
    ORDER BY r.enrollment_id, r.seq, r.attempt_no;
  `);
	const [courses, sessions, rotations] = r.recordsets;
	return courses.map((c) => {
		const own = sessions.filter((s) => s.enrollment_id === c.enrollment_id);
		const sum = (kind) => {
			const list = own.filter((s) => s.kind === kind);
			return {
				total: list.length,
				present: list.filter((s) => s.status === 'present').length,
				late: list.filter((s) => s.status === 'late').length,
				absent: list.filter((s) => s.status === 'absent').length,
				unmarked: list.filter((s) => !s.status).length,
			};
		};
		return {
			...c,
			theory: sum('theory'),
			practice: sum('practice'),
			sessions: own,
			rotations: rotations.filter((x) => x.enrollment_id === c.enrollment_id),
		};
	});
};

// ─── Kết quả & điểm (mọi khóa, kèm lịch sử thi lại) ─────────────────────────
const grades = async (traineeId) => {
	const pool = await getPool();
	await assertTrainee(pool, traineeId);
	const r = await pool.request().input('trainee_id', sql.VarChar(20), traineeId).query(`
    SELECT e.id AS enrollment_id, e.course_id, c.name AS course_name, c.training_type_id,
           tt.name AS training_type_name, c.start_date, c.end_date,
           cert.id AS certificate_id, cert.cert_no, cert.issue_date, cert.expiry_date, cert.status AS certificate_status,
           tp.code AS program_code, tp.name AS program_name
    FROM course_enrollments e
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN training_types tt ON tt.id = c.training_type_id
    LEFT JOIN training_programs tp ON tp.id = e.program_id
    LEFT JOIN certificates cert ON cert.enrollment_id = e.id
    WHERE e.trainee_id = @trainee_id AND e.status = 'approved'
    ORDER BY c.start_date DESC;

    -- Điểm cũ TX/GK/CK hoặc theo bài (subject_id) — để xem lại dữ liệu trước giai đoạn 4
    SELECT g.enrollment_id, g.subject_id, pl.title AS subject_name, g.regular_score, g.midterm_score,
           g.final_score, g.score, g.result, g.classification
    FROM grades g
    JOIN course_enrollments e ON e.id = g.enrollment_id
    LEFT JOIN program_lessons pl ON pl.id = g.subject_id
    WHERE e.trainee_id = @trainee_id AND (g.subject_id IS NOT NULL OR g.regular_score IS NOT NULL
          OR g.midterm_score IS NOT NULL OR g.final_score IS NOT NULL);

    SELECT h.enrollment_id, h.part, h.attempt_no, h.score, h.flag, h.source, h.changed_at
    FROM grade_history h
    JOIN course_enrollments e ON e.id = h.enrollment_id
    WHERE e.trainee_id = @trainee_id AND h.source IN ('manual', 'exam', 'import')
    ORDER BY h.changed_at;

    SELECT r.enrollment_id, r.seq, r.round_title, r.department_name, r.result, r.attempt_no
    FROM enrollment_rotations r JOIN course_enrollments e ON e.id = r.enrollment_id
    WHERE e.trainee_id = @trainee_id
    ORDER BY r.enrollment_id, r.seq, r.attempt_no;
  `);
	const [courses, legacy, history, rotations] = r.recordsets;

	// Kết quả 2 phần tính cùng hàm với bảng điểm của khóa (gradeRules.evaluate)
	const out = [];
	for (const c of courses) {
		const book = await gradebookService.getGradebook(c.course_id);
		const row = book.rows.find((x) => x.enrollment_id === c.enrollment_id) || null;
		// Mỗi lần thi: lấy điểm cuối cùng ghi cho (phần, lần thi)
		const attempts = {};
		for (const h of history.filter((x) => x.enrollment_id === c.enrollment_id)) {
			attempts[`${h.part}:${h.attempt_no}`] = h;
		}
		out.push({
			...c,
			grade: row && {
				theory_score: row.theory_score,
				practice_score: row.practice_score,
				theory_flag: row.theory_flag,
				practice_flag: row.practice_flag,
				theory_attempt: row.theory_attempt,
				practice_attempt: row.practice_attempt,
				attendance: row.attendance,
				locked_at: row.locked_at,
				note: row.note,
				computed: row.computed,
			},
			attempts: Object.values(attempts),
			legacy: legacy.filter((g) => g.enrollment_id === c.enrollment_id),
			rotations: rotations.filter((x) => x.enrollment_id === c.enrollment_id),
		});
	}
	return out;
};

module.exports = {
	documentChecklist,
	reviewDocument,
	traineeIdOfUser,
	myTraineeId,
	myChecklist,
	addMyDocument,
	removeMyDocument,
	attendance,
	grades,
};
