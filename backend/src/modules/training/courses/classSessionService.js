const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { scopeOf } = require('../../../permissions/authz');
const { ASSIGNED_EXISTS_SQL } = require('./coursePolicy');
const { fmtDateVN } = require('../../../utils/vnDate');
const { assertClassOpen } = require('./programClassService');
const { SESSION_IN_PROGRAM_SQL } = require('./sessionScope');
const lessonProgressService = require('./lessonProgressService');
const { TRAINEE_OF_USER_SQL } = require('../trainees/traineeOfUser');

// Buổi o trùng lịch giảng viên với buổi s: cùng GV, cùng ngày, chồng giờ (thiếu
// giờ = cả ngày), khóa chưa huỷ. Chỉ cảnh báo, không chặn — GV có thể dạy ghép.
const LECTURER_CLASH_SQL = (s, o) => `
  ${o}.lecturer_id = ${s}.lecturer_id AND ${o}.session_date = ${s}.session_date AND ${o}.id <> ${s}.id
  AND ISNULL(${o}.start_time, '00:00') < ISNULL(${s}.end_time, '23:59')
  AND ISNULL(${s}.start_time, '00:00') < ISNULL(${o}.end_time, '23:59')
  AND EXISTS (SELECT 1 FROM courses oc WHERE oc.id = ${o}.course_id AND oc.status <> 'cancelled')`;

const timeRange = (r) => (r.start_time ? ` ${r.start_time}–${r.end_time ?? ''}` : ' (cả ngày)');

// Cảnh báo trùng lịch cho các buổi vừa tạo / sửa (mỗi cặp trùng 1 dòng).
const findLecturerClashes = async (sessionIds) => {
	if (!sessionIds.length) return [];
	const pool = await getPool();
	const r = await pool.request().input('ids', sql.VarChar(sql.MAX), sessionIds.join(',')).query(`
    SELECT l.full_name AS lecturer_name, o.session_date, o.start_time, o.end_time, c.name AS course_name
    FROM class_sessions s
    JOIN class_sessions o ON ${LECTURER_CLASH_SQL('s', 'o')}
    JOIN courses c ON c.id = o.course_id
    JOIN lecturers l ON l.id = s.lecturer_id
    WHERE s.id IN (SELECT value FROM STRING_SPLIT(@ids, ','))
    ORDER BY o.session_date, o.start_time
  `);
	return r.recordset.map(
		(x) =>
			`${x.lecturer_name} đã có buổi dạy ngày ${fmtDateVN(x.session_date)}${timeRange(x)} — ${x.course_name}`,
	);
};

// ─── Buổi học ────────────────────────────────────────────────────────────
// Lịch học toàn hệ thống (trang /admin/class-schedule): mọi buổi học trong
// khoảng [from, to] kèm tên khoá, cùng các khoá có thời gian học giao khoảng
// đó (để vẽ thanh thời gian khoá học). Giảng viên phạm vi 'assigned' chỉ thấy
// khoá mình được phân công.
const listSessionsInRange = async (
	{ from = undefined, to = undefined, course_id = undefined } = {},
	actor = null,
) => {
	const pool = await getPool();
	const req = pool.request().input('from', sql.Date, from).input('to', sql.Date, to);
	const where = [];
	if (course_id) {
		where.push('c.id = @course_id');
		req.input('course_id', sql.VarChar(20), course_id);
	}
	if (actor && scopeOf(actor, 'courses') === 'assigned') {
		where.push(ASSIGNED_EXISTS_SQL);
		req.input('actor_id', sql.VarChar(20), actor.id);
	}
	const extra = where.length ? ` AND ${where.join(' AND ')}` : '';
	const result = await req.query(`
    SELECT sess.id, sess.course_id, c.name AS course_name, sess.subject_id, s.title AS subject_name,
           sess.lecturer_id, l.full_name AS lecturer_name,
           sess.session_date, sess.start_time, sess.end_time, sess.room
    FROM class_sessions sess
    INNER JOIN courses c ON c.id = sess.course_id
    LEFT JOIN program_lessons s ON s.id = sess.subject_id
    LEFT JOIN lecturers l ON l.id = sess.lecturer_id
    WHERE sess.session_date BETWEEN @from AND @to${extra}
    ORDER BY sess.session_date, sess.start_time;
    SELECT c.id, c.name, c.start_date, c.end_date, c.status
    FROM courses c
    WHERE c.start_date IS NOT NULL AND c.end_date IS NOT NULL
      AND c.start_date <= @to AND c.end_date >= @from${extra}
    ORDER BY c.start_date;
  `);
	return { sessions: result.recordsets[0], courses: result.recordsets[1] };
};

/**
 * Lịch học của 1 học viên trong [from, to] — cùng dạng với listSessionsInRange để dùng
 * chung giao diện lịch. Chỉ lớp đã duyệt; khóa nhiều chương trình thì chỉ buổi thuộc
 * chương trình đã ghi danh (xem sessionScope). Kèm điểm danh.
 * Chọn học viên theo traineeId (admin) hoặc userId (cổng cá nhân — xem traineeOfUser).
 */
const listTraineeSessions = async ({ from, to, traineeId = null, userId = null }) => {
	const pool = await getPool();
	const who = traineeId ? 't.id = @tid' : TRAINEE_OF_USER_SQL('t');
	const result = await pool
		.request()
		.input('from', sql.Date, from)
		.input('to', sql.Date, to)
		.input('tid', sql.VarChar(20), traineeId)
		.input('uid', sql.VarChar(20), userId).query(`
    DECLARE @mine TABLE (id VARCHAR(20), course_id VARCHAR(20), program_id VARCHAR(20));
    INSERT INTO @mine
    SELECT e.id, e.course_id, e.program_id
    FROM course_enrollments e JOIN trainees t ON t.id = e.trainee_id
    WHERE ${who} AND e.status = 'approved';
    SELECT sess.id, sess.course_id, c.name AS course_name, sess.subject_id, s.title AS subject_name,
           sess.lecturer_id, l.full_name AS lecturer_name,
           sess.session_date, sess.start_time, sess.end_time, sess.room, a.status AS attendance_status
    FROM class_sessions sess
    JOIN @mine m ON m.course_id = sess.course_id
    JOIN courses c ON c.id = sess.course_id AND c.status <> 'cancelled'
    LEFT JOIN program_lessons s ON s.id = sess.subject_id
    LEFT JOIN lecturers l ON l.id = sess.lecturer_id
    LEFT JOIN attendance a ON a.session_id = sess.id AND a.enrollment_id = m.id
    WHERE sess.session_date BETWEEN @from AND @to AND ${SESSION_IN_PROGRAM_SQL('sess', 'm')}
    ORDER BY sess.session_date, sess.start_time;
    -- Thanh thời gian: ngày của lớp (chương trình đã ghi danh), không có thì ngày khóa
    SELECT c.id, CONCAT(c.name, CASE WHEN tp.code IS NULL THEN '' ELSE CONCAT(N' · ', tp.code) END) AS name,
           COALESCE(cp.start_date, c.start_date) AS start_date, COALESCE(cp.end_date, c.end_date) AS end_date, c.status
    FROM @mine m
    JOIN courses c ON c.id = m.course_id AND c.status <> 'cancelled'
    LEFT JOIN course_programs cp ON cp.course_id = m.course_id AND cp.program_id = m.program_id
    LEFT JOIN training_programs tp ON tp.id = m.program_id
    WHERE COALESCE(cp.start_date, c.start_date) <= @to AND COALESCE(cp.end_date, c.end_date) >= @from
    ORDER BY start_date;
  `);
	return { sessions: result.recordsets[0], courses: result.recordsets[1] };
};

const listSessions = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT sess.*, s.title AS subject_name, l.full_name AS lecturer_name, clash.lecturer_clashes
    FROM class_sessions sess
    LEFT JOIN program_lessons s ON s.id = sess.subject_id
    LEFT JOIN lecturers l ON l.id = sess.lecturer_id
    OUTER APPLY (
      SELECT STRING_AGG(CONCAT(oc.name, ' ', ISNULL(o.start_time, ''), '–', ISNULL(o.end_time, '')), '; ')
             AS lecturer_clashes
      FROM class_sessions o
      JOIN courses oc ON oc.id = o.course_id
      WHERE ${LECTURER_CLASH_SQL('sess', 'o')}
    ) clash
    WHERE sess.course_id = @course_id
    ORDER BY sess.session_date, sess.start_time
  `);
	return r.recordset;
};

// Buổi lý thuyết / thực hành (tính chuyên cần LT/TH ở bảng điểm). NULL = suy ra từ
// loại bài học — xem gradebookService.SESSION_KIND_SQL.
const kindOf = (v) => (['theory', 'practice'].includes(v) ? v : null);

const createSession = async (courseId, data, actorId) => {
	await assertClassOpen(courseId, data.subject_id);
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('course_id', sql.VarChar(20), courseId)
		.input('subject_id', sql.VarChar(20), data.subject_id || null)
		.input('lecturer_id', sql.VarChar(20), data.lecturer_id || null)
		.input('session_date', sql.Date, data.session_date)
		.input('start_time', sql.VarChar(5), data.start_time || null)
		.input('end_time', sql.VarChar(5), data.end_time || null)
		.input('session_kind', sql.VarChar(10), kindOf(data.session_kind))
		.input('room', sql.NVarChar(255), data.room || null).query(`
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_class_session_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      INSERT INTO class_sessions (id, course_id, subject_id, lecturer_id, session_date, start_time, end_time, room, session_kind, created_by)
      VALUES (@new_id, @course_id, @subject_id, @lecturer_id, @session_date, @start_time, @end_time, @room, @session_kind, @actor_id);
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'class_session' });
	const id = result.recordset[0].id;
	// Bài có thêm buổi ⇒ học viên đã "xong" bài phải có mặt cả buổi mới (quyết định 13)
	await lessonProgressService.recompute({ sessionId: id });
	return { id, warnings: await findLecturerClashes([id]) };
};

const updateSession = async (sessionId, data, actorId) => {
	const pool = await getPool();
	let movedFromCourse = null; // buổi đổi bài ⇒ tính lại trạng thái bài cả khóa
	if (data.subject_id !== undefined) {
		const cur = await pool
			.request()
			.input('id', sql.VarChar(20), sessionId)
			.query('SELECT course_id, subject_id FROM class_sessions WHERE id = @id');
		const row = cur.recordset[0];
		if (row && (row.subject_id ?? '') !== (data.subject_id ?? '')) {
			await assertClassOpen(row.course_id, data.subject_id);
			movedFromCourse = row.course_id;
		}
	}
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), sessionId)
		.input('actor_id', sql.VarChar(20), actorId);

	const fieldMap = {
		subject_id: sql.VarChar(20),
		lecturer_id: sql.VarChar(20),
		session_date: sql.Date,
		start_time: sql.VarChar(5),
		end_time: sql.VarChar(5),
		room: sql.NVarChar(255),
		session_kind: sql.VarChar(10),
	};
	for (const [field, type] of Object.entries(fieldMap)) {
		if (data[field] !== undefined) {
			sets.push(`${field} = @${field}`);
			req.input(
				field,
				type,
				field === 'session_kind' ? kindOf(data[field]) : data[field] === '' ? null : data[field],
			);
		}
	}
	await req.query(`UPDATE class_sessions SET ${sets.join(', ')} WHERE id = @id`);
	broadcast('update', { entity: 'class_session' });
	if (movedFromCourse) await lessonProgressService.recompute({ courseId: movedFromCourse });
	return { warnings: await findLecturerClashes([sessionId]) };
};

const removeSession = async (sessionId) => {
	const pool = await getPool();
	const r = await pool.request().input('id', sql.VarChar(20), sessionId).query(`
      SELECT course_id FROM class_sessions WHERE id = @id;
      DELETE FROM class_sessions WHERE id = @id;`);
	broadcast('update', { entity: 'class_session' });
	// Bớt 1 buổi ⇒ bài có thể vừa đủ điều kiện "đã học"
	const courseId = r.recordsets[0][0]?.course_id;
	if (courseId) await lessonProgressService.recompute({ courseId });
};

// Tạo nhiều buổi học cùng lúc theo khoảng ngày + các thứ trong tuần được chọn.
// weekdays: mảng số 0=CN..6=T7 (khớp Date.getUTCDay()). Bỏ qua ngày đã có buổi
// học trùng course_id + session_date + start_time (DB không có UNIQUE constraint
// chống trùng lịch — xem ghi chú trong migration).
const createSessionsBulk = async (courseId, data, actorId) => {
	await assertClassOpen(courseId, data.subject_id);
	const pool = await getPool();
	const { start_date, end_date, weekdays, start_time, end_time, room, lecturer_id, subject_id } =
		data;
	const weekdaySet = new Set((weekdays || []).map(Number));
	const dates = [];
	const cursor = new Date(`${start_date}T00:00:00Z`);
	const last = new Date(`${end_date}T00:00:00Z`);
	while (cursor.getTime() <= last.getTime()) {
		if (weekdaySet.has(cursor.getUTCDay())) {
			dates.push(cursor.toISOString().slice(0, 10));
		}
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}

	const createdIds = [];
	let skipped = 0;
	for (const sessionDate of dates) {
		const result = await pool
			.request()
			.input('actor_id', sql.VarChar(20), actorId)
			.input('course_id', sql.VarChar(20), courseId)
			.input('subject_id', sql.VarChar(20), subject_id || null)
			.input('lecturer_id', sql.VarChar(20), lecturer_id || null)
			.input('session_date', sql.Date, sessionDate)
			.input('start_time', sql.VarChar(5), start_time || null)
			.input('end_time', sql.VarChar(5), end_time || null)
			.input('session_kind', sql.VarChar(10), kindOf(data.session_kind))
			.input('room', sql.NVarChar(255), room || null).query(`
        IF EXISTS (
          SELECT 1 FROM class_sessions
          WHERE course_id = @course_id AND session_date = @session_date
            AND ISNULL(start_time, '') = ISNULL(@start_time, '')
        )
          SELECT CAST(NULL AS VARCHAR(20)) AS id;
        ELSE
        BEGIN
          DECLARE @new_id VARCHAR(20);
          EXEC sp_gen_class_session_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
          INSERT INTO class_sessions (id, course_id, subject_id, lecturer_id, session_date, start_time, end_time, room, session_kind, created_by)
          VALUES (@new_id, @course_id, @subject_id, @lecturer_id, @session_date, @start_time, @end_time, @room, @session_kind, @actor_id);
          SELECT @new_id AS id;
        END
      `);
		const id = result.recordset[0]?.id;
		if (id) createdIds.push(id);
		else skipped += 1;
	}
	broadcast('update', { entity: 'class_session' });
	if (createdIds.length) await lessonProgressService.recompute({ courseId });
	return { created: createdIds.length, skipped, warnings: await findLecturerClashes(createdIds) };
};

module.exports = {
	listSessionsInRange,
	listTraineeSessions,
	listSessions,
	createSession,
	updateSession,
	removeSession,
	createSessionsBulk,
};
