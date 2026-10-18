// @ts-nocheck — còn lỗi kiểu khi bật checkJs; sửa xong thì xoá dòng này (xem README, Kiểm tra chất lượng)
const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { scopeOf } = require('../../../permissions/authz');
const { ASSIGNED_EXISTS_SQL } = require('./coursePolicy');

// ─── Buổi học ────────────────────────────────────────────────────────────
// Lịch học toàn hệ thống (trang /admin/class-schedule): mọi buổi học trong
// khoảng [from, to] kèm tên khoá, cùng các khoá có thời gian học giao khoảng
// đó (để vẽ thanh thời gian khoá học). Giảng viên phạm vi 'assigned' chỉ thấy
// khoá mình được phân công.
const listSessionsInRange = async ({ from, to, course_id } = {}, actor = null) => {
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

const listSessions = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT sess.*, s.title AS subject_name, l.full_name AS lecturer_name
    FROM class_sessions sess
    LEFT JOIN program_lessons s ON s.id = sess.subject_id
    LEFT JOIN lecturers l ON l.id = sess.lecturer_id
    WHERE sess.course_id = @course_id
    ORDER BY sess.session_date, sess.start_time
  `);
	return r.recordset;
};

const createSession = async (courseId, data, actorId) => {
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
		.input('room', sql.NVarChar(255), data.room || null).query(`
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_class_session_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      INSERT INTO class_sessions (id, course_id, subject_id, lecturer_id, session_date, start_time, end_time, room, created_by)
      VALUES (@new_id, @course_id, @subject_id, @lecturer_id, @session_date, @start_time, @end_time, @room, @actor_id);
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'class_session' });
	return { id: result.recordset[0].id };
};

const updateSession = async (sessionId, data, actorId) => {
	const pool = await getPool();
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
	};
	for (const [field, type] of Object.entries(fieldMap)) {
		if (data[field] !== undefined) {
			sets.push(`${field} = @${field}`);
			req.input(field, type, data[field] === '' ? null : data[field]);
		}
	}
	await req.query(`UPDATE class_sessions SET ${sets.join(', ')} WHERE id = @id`);
	broadcast('update', { entity: 'class_session' });
};

const removeSession = async (sessionId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), sessionId)
		.query('DELETE FROM class_sessions WHERE id = @id');
	broadcast('update', { entity: 'class_session' });
};

// Tạo nhiều buổi học cùng lúc theo khoảng ngày + các thứ trong tuần được chọn.
// weekdays: mảng số 0=CN..6=T7 (khớp Date.getUTCDay()). Bỏ qua ngày đã có buổi
// học trùng course_id + session_date + start_time (DB không có UNIQUE constraint
// chống trùng lịch — xem ghi chú trong migration).
const createSessionsBulk = async (courseId, data, actorId) => {
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
          INSERT INTO class_sessions (id, course_id, subject_id, lecturer_id, session_date, start_time, end_time, room, created_by)
          VALUES (@new_id, @course_id, @subject_id, @lecturer_id, @session_date, @start_time, @end_time, @room, @actor_id);
          SELECT @new_id AS id;
        END
      `);
		const id = result.recordset[0]?.id;
		if (id) createdIds.push(id);
		else skipped += 1;
	}
	broadcast('update', { entity: 'class_session' });
	return { created: createdIds.length, skipped };
};

module.exports = {
	listSessionsInRange,
	listSessions,
	createSession,
	updateSession,
	removeSession,
	createSessionsBulk,
};
