const {
	getPool,
	sql,
	withTransaction,
	queryAll,
	nowSql,
	formatDate,
} = require('../../../config/db');
const { genLecturerAssignmentId } = require('../../../utils/idGenerator');
const { isUniqueViolation } = require('../../../utils/dbErrors');
const { broadcast } = require('../../events/eventService');
const { ROLE, roleIdOf } = require('../../access/roleCodes');
const { httpError } = require('../../../utils/httpError');
const lecturerService = require('../lecturers/lecturerService');
const logger = require('../../../config/logger');

// lecturer_assignments.subject_id trỏ program_lessons (tên cột cũ từ thời "môn học").
// role: 'main' = GV chính (mỗi bài tối đa 1, UQ_lecass_main) | 'assistant' = GV phụ.
// subject_id NULL = phân công cả khóa. Xem 2026-11-20_lecturer_assignment_roles.sql.

// ─── Phân công giảng viên ────────────────────────────────────────────────
const listAssignments = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT a.*, l.full_name AS lecturer_name, l.specialty, s.title AS subject_name
    FROM lecturer_assignments a
    JOIN lecturers l ON l.id = a.lecturer_id
    LEFT JOIN program_lessons s ON s.id = a.subject_id
    WHERE a.course_id = @course_id
    ORDER BY a.created_at DESC
  `);
	return r.recordset;
};

// Bài học (không tính vòng thực hành GPHN) thuộc các chương trình của khóa — các
// dòng của bảng Bài học × Giảng viên. 1 bài nằm ở 2 chương trình của khóa chỉ lấy 1 dòng;
// program_ids (cách nhau dấu phẩy) để lọc lịch học theo chương trình.
const listCourseLessons = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT pl.id, pl.code, pl.title, pl.theory_hours, pl.practice_hours, pl.total_hours,
           MIN(tp.name) AS program_name, STRING_AGG(cp.program_id, ',') AS program_ids
    FROM course_programs cp
    JOIN training_programs tp ON tp.id = cp.program_id
    JOIN lesson_programs lp ON lp.program_id = cp.program_id
    JOIN program_lessons pl ON pl.id = lp.lesson_id AND pl.lesson_kind <> 'rotation' AND pl.is_active = 'true'
    WHERE cp.course_id = @course_id
    GROUP BY pl.id, pl.code, pl.title, pl.theory_hours, pl.practice_hours, pl.total_hours
    ORDER BY MIN(tp.name), MIN(lp.display_order), pl.title
  `);
	return r.recordset;
};

/** Tiền tố id cho nhân viên có CCHN chưa là giảng viên trong ô chọn — phân công thì tự tạo hồ sơ GV. */
const STAFF_PREFIX = 'user:';

/**
 * Ứng viên giảng viên của khóa, `group`:
 * - 'department': GV có tài khoản thuộc khoa của chương trình trong khóa
 * - 'staff': nhân viên khoa đó có CCHN, chưa là GV (id = 'user:<user_id>')
 * - 'other': chuyên gia ngoài viện / GV chưa gắn tài khoản (chưa biết khoa) / GV đã phân công
 * GV đã biết thuộc khoa khác thì ẩn. Chương trình không gắn khoa ⇒ lấy mọi GV.
 */
const listLecturerCandidates = async (courseId) => {
	const pool = await getPool();
	// Khoa của các chương trình trong khóa (rỗng ⇒ không giới hạn theo khoa)
	const depts = `(SELECT tp.department_id FROM course_programs cp JOIN training_programs tp ON tp.id = cp.program_id
          WHERE cp.course_id = @course_id AND tp.department_id IS NOT NULL)`;
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT l.id, l.full_name, l.specialty, l.is_external, l.academic_degree, l.academic_rank,
           d.name AS department_name,
           CASE WHEN u.department_id IN ${depts} THEN 'department' ELSE 'other' END AS [group]
    FROM lecturers l
    LEFT JOIN users u ON u.id = l.user_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE l.is_active = 'true'
      AND (NOT EXISTS ${depts} OR u.department_id IS NULL OR u.department_id IN ${depts}
        OR l.id IN (SELECT lecturer_id FROM lecturer_assignments WHERE course_id = @course_id))
    UNION ALL
    SELECT '${STAFF_PREFIX}' + u.id, u.full_name, sl.primary_specialty, CAST(0 AS BIT), NULL, NULL,
           d.name, 'staff'
    FROM staff_practice_licenses sl
    JOIN users u ON u.id = sl.user_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE sl.license_no IS NOT NULL AND u.is_active = 'true'
      AND u.department_id IN ${depts}
      AND NOT EXISTS (SELECT 1 FROM lecturers l WHERE l.user_id = u.id)
    ORDER BY full_name;
  `);
	return r.recordset;
};

// 'user:<id>' (nhân viên có CCHN) ⇒ hồ sơ GV của người đó, chưa có thì tạo.
const resolveLecturerId = async (id, actorId) => {
	if (!id || !String(id).startsWith(STAFF_PREFIX)) return id;
	const userId = String(id).slice(STAFF_PREFIX.length);
	const pool = await getPool();
	const r = await pool.request().input('uid', sql.VarChar(20), userId).query(`
    SELECT (SELECT id FROM lecturers WHERE user_id = @uid ORDER BY id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY) AS lecturer_id, sl.license_no
    FROM users u LEFT JOIN staff_practice_licenses sl ON sl.user_id = u.id
    WHERE u.id = @uid
  `);
	const row = r.recordset[0];
	if (row?.lecturer_id) return row.lecturer_id;
	if (!row?.license_no) throw httpError(400, 'Nhân viên không có chứng chỉ hành nghề.');
	const { created, skipped } = await lecturerService.createFromStaff([userId], actorId);
	if (!created[0]) throw httpError(400, skipped[0]?.reason || 'Không tạo được hồ sơ giảng viên.');
	return created[0].id;
};

// Không phân công học viên làm giảng viên: chặn tài khoản học viên (VT08) và
// người đang đăng ký học chính khóa này (khớp theo hồ sơ người / tài khoản).
const assertAssignable = async (request, courseId, lecturerId) => {
	const check = await request
		.input('course_id', sql.VarChar(20), courseId)
		.input('lecturer_id', sql.VarChar(20), lecturerId).query(`
      SELECT l.full_name, l.is_active, u.role_id,
             (SELECT COUNT(*) FROM course_enrollments e
              JOIN trainees t ON t.id = e.trainee_id
              WHERE e.course_id = @course_id AND e.status <> 'rejected'
                AND ((l.person_id IS NOT NULL AND t.person_id = l.person_id)
                  OR (l.user_id IS NOT NULL AND t.staff_user_id = l.user_id))) AS enrolled
      FROM lecturers l
      LEFT JOIN users u ON u.id = l.user_id
      WHERE l.id = @lecturer_id
    `);
	const lec = check.recordset[0];
	if (!lec || !lec.is_active) {
		throw httpError(404, 'Giảng viên không tồn tại hoặc đã ngừng hoạt động.');
	}
	if (lec.role_id && lec.role_id === (await roleIdOf(ROLE.TRAINEE))) {
		throw httpError(400, 'Không thể phân công tài khoản học viên làm giảng viên.');
	}
	if (lec.enrolled > 0) {
		throw httpError(
			400,
			`${lec.full_name} đang là học viên của khóa học, không thể phân công làm giảng viên.`,
		);
	}
};

// tx: transaction (khoá sinh mã giữ tới khi commit)
const insertAssignment = async (
	tx,
	{ courseId, lecturerId, subjectId, role, hours, note, actorId },
) =>
	new sql.Request(tx)
		.input('new_id', sql.VarChar(20), await genLecturerAssignmentId(tx))
		.input('actor_id', sql.VarChar(20), actorId)
		.input('course_id', sql.VarChar(20), courseId)
		.input('lecturer_id', sql.VarChar(20), lecturerId)
		.input('subject_id', sql.VarChar(20), subjectId || null)
		.input('role', sql.VarChar(10), role === 'assistant' ? 'assistant' : 'main')
		.input('hours', sql.Int, hours ?? null)
		.input('note', sql.NVarChar(255), note || null).query(`
      INSERT INTO lecturer_assignments (id, course_id, lecturer_id, subject_id, role, hours, note, created_by)
      VALUES (@new_id, @course_id, @lecturer_id, @subject_id, @role, @hours, @note, @actor_id);
      SELECT @new_id AS id;
    `);

const toHours = (v) => {
	if (v === undefined || v === null || v === '') return null;
	const n = Number(v);
	if (!Number.isInteger(n) || n < 0) throw httpError(400, 'Số tiết phải là số nguyên không âm.');
	return n;
};

const assignLecturer = async (courseId, data, actorId) => {
	const lecturerId = await resolveLecturerId(data.lecturer_id, actorId);
	const pool = await getPool();
	await assertAssignable(pool.request(), courseId, lecturerId);
	try {
		const result = await withTransaction((tx) =>
			insertAssignment(tx, {
				courseId,
				lecturerId,
				subjectId: data.subject_id,
				role: data.role,
				hours: toHours(data.hours),
				note: data.note,
				actorId,
			}),
		);
		broadcast('update', { entity: 'lecturer_assignment' });
		return { id: result.recordset[0].id };
	} catch (err) {
		if (isUniqueViolation(err)) {
			throw httpError(409, 'Giảng viên đã được phân công (hoặc bài đã có giảng viên chính).');
		}
		throw err;
	}
};

/**
 * Đặt lại toàn bộ giảng viên của 1 bài trong khóa (1 dòng của bảng Bài học × Giảng viên).
 * data = { main: { lecturer_id, hours } | null, assistants: [{ lecturer_id, hours }] }.
 * GV bị bỏ khỏi bài thì xóa phân công; GV giữ lại thì giữ nguyên mã phân công.
 */
const setLessonLecturers = async (courseId, lessonId, data, actorId) => {
	const wanted = new Map();
	for (const a of data.assistants || []) {
		if (a?.lecturer_id) {
			wanted.set(await resolveLecturerId(a.lecturer_id, actorId), {
				role: 'assistant',
				hours: toHours(a.hours),
			});
		}
	}
	// GV chính ghi đè nếu trùng người với GV phụ
	if (data.main?.lecturer_id) {
		wanted.set(await resolveLecturerId(data.main.lecturer_id, actorId), {
			role: 'main',
			hours: toHours(data.main.hours),
		});
	}

	const pool = await getPool();
	const inCourse = await pool
		.request()
		.input('course_id', sql.VarChar(20), courseId)
		.input('lesson_id', sql.VarChar(20), lessonId).query(`
      SELECT 1 AS ok WHERE EXISTS (SELECT 1 FROM course_programs cp
      JOIN lesson_programs lp ON lp.program_id = cp.program_id
      WHERE cp.course_id = @course_id AND lp.lesson_id = @lesson_id)
    `);
	if (!inCourse.recordset.length) {
		throw httpError(400, 'Bài học không thuộc chương trình của khóa học.');
	}
	for (const lecturerId of wanted.keys()) {
		await assertAssignable(pool.request(), courseId, lecturerId);
	}

	await withTransaction(async (tx) => {
		const keep = [...wanted.keys()];
		const req = new sql.Request(tx)
			.input('course_id', sql.VarChar(20), courseId)
			.input('lesson_id', sql.VarChar(20), lessonId);
		keep.forEach((id, i) => req.input(`l${i}`, sql.VarChar(20), id));
		const notKept = keep.length
			? `AND lecturer_id NOT IN (${keep.map((_, i) => `@l${i}`).join(', ')})`
			: '';
		// Hạ hết về 'assistant' trước để đổi GV chính không vướng UQ_lecass_main.
		const sets = await queryAll(req, [
			`DELETE FROM lecturer_assignments
      WHERE course_id = @course_id AND subject_id = @lesson_id ${notKept}`,
			`UPDATE lecturer_assignments SET role = 'assistant'
      WHERE course_id = @course_id AND subject_id = @lesson_id`,
			`SELECT id, lecturer_id FROM lecturer_assignments
      WHERE course_id = @course_id AND subject_id = @lesson_id`,
		]);
		const existing = sets[sets.length - 1];
		const existingId = new Map(existing.map((r) => [r.lecturer_id, r.id]));
		for (const [lecturerId, { role, hours }] of wanted) {
			const id = existingId.get(lecturerId);
			if (id) {
				await new sql.Request(tx)
					.input('id', sql.VarChar(20), id)
					.input('role', sql.VarChar(10), role)
					.input('hours', sql.Int, hours)
					.input('actor_id', sql.VarChar(20), actorId).query(`
            UPDATE lecturer_assignments
            SET role = @role, hours = @hours, updated_at = ${nowSql}, updated_by = @actor_id
            WHERE id = @id
          `);
			} else {
				await insertAssignment(tx, {
					courseId,
					lecturerId,
					subjectId: lessonId,
					role,
					hours,
					note: null,
					actorId,
				});
			}
		}
	});
	broadcast('update', { entity: 'lecturer_assignment' });
};

/**
 * Phân công của 1 bài suy ra từ các buổi học: GV dạy nhiều buổi nhất (bằng nhau
 * thì GV dạy sớm nhất) là GV chính, còn lại là GV phụ. Giữ số tiết đã nhập của
 * người còn trong bài. rows: [{ lecturer_id, n, first_slot }] đã xếp theo thứ tự đó.
 */
const lessonLecturersFromSessions = (rows, hoursOf = new Map()) => {
	const pick = (r) => ({ lecturer_id: r.lecturer_id, hours: hoursOf.get(r.lecturer_id) ?? null });
	return rows.length ? { main: pick(rows[0]), assistants: rows.slice(1).map(pick) } : null;
};

// Giảng viên chọn ở buổi học: nhân viên CCHN ('user:<id>') ⇒ hồ sơ GV; chặn người
// không được dạy khóa này (học viên của khóa…) trước khi lưu buổi.
const resolveSessionLecturer = async (courseId, id, actorId) => {
	if (!id) return id;
	const lecturerId = await resolveLecturerId(id, actorId);
	const pool = await getPool();
	await assertAssignable(pool.request(), courseId, lecturerId);
	return lecturerId;
};

/**
 * Đồng bộ phân công GV theo bài từ buổi học (bỏ ô "GV chính / GV phụ" nhập tay ở
 * bảng Lịch học). Bài chưa có buổi nào gán GV thì giữ nguyên phân công cũ; bài
 * ngoài chương trình của khóa thì bỏ qua. Lỗi ở đây không chặn việc lưu buổi học.
 */
const syncLessonsFromSessions = async (courseId, lessonIds, actorId) => {
	const pool = await getPool();
	for (const lessonId of new Set(lessonIds.filter(Boolean))) {
		try {
			const sets = await queryAll(
				pool
					.request()
					.input('course_id', sql.VarChar(20), courseId)
					.input('lesson_id', sql.VarChar(20), lessonId),
				[
					`
          SELECT lecturer_id, COUNT(*) AS n,
                 MIN(CONCAT(${formatDate('session_date', 'YYYY-MM-DD')}, COALESCE(start_time, ''))) AS first_slot
          FROM class_sessions
          WHERE course_id = @course_id AND subject_id = @lesson_id AND lecturer_id IS NOT NULL
          GROUP BY lecturer_id
          ORDER BY COUNT(*) DESC, first_slot, lecturer_id
				`,
					`
          SELECT lecturer_id, hours FROM lecturer_assignments
          WHERE course_id = @course_id AND subject_id = @lesson_id
				`,
					`
          SELECT 1 AS ok WHERE EXISTS (SELECT 1 FROM course_programs cp
          JOIN lesson_programs lp ON lp.program_id = cp.program_id
          WHERE cp.course_id = @course_id AND lp.lesson_id = @lesson_id)
				`,
				],
			);
			const [rows, existing, inCourse] = sets;
			const data = lessonLecturersFromSessions(
				rows,
				new Map(existing.map((x) => [x.lecturer_id, x.hours])),
			);
			if (data && inCourse.length) await setLessonLecturers(courseId, lessonId, data, actorId);
		} catch (err) {
			logger.error(`[lecturer-assignment] đồng bộ GV bài ${lessonId}: ${err.message}`);
		}
	}
};

const removeAssignment = async (assignmentId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), assignmentId)
		.query('DELETE FROM lecturer_assignments WHERE id = @id');
	broadcast('update', { entity: 'lecturer_assignment' });
};

module.exports = {
	listAssignments,
	listCourseLessons,
	listLecturerCandidates,
	assignLecturer,
	setLessonLecturers,
	removeAssignment,
	lessonLecturersFromSessions,
	resolveSessionLecturer,
	syncLessonsFromSessions,
};
