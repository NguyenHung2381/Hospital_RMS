const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { ROLE, roleIdOf } = require('../../access/roleCodes');

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

const assignLecturer = async (courseId, data, actorId) => {
	const pool = await getPool();
	// Không phân công học viên làm giảng viên: chặn tài khoản học viên (VT08) và
	// người đang đăng ký học chính khóa này (khớp theo hồ sơ người / tài khoản).
	const check = await pool
		.request()
		.input('course_id', sql.VarChar(20), courseId)
		.input('lecturer_id', sql.VarChar(20), data.lecturer_id).query(`
      SELECT l.is_active, u.role_id,
             (SELECT COUNT(*) FROM course_enrollments e
              JOIN trainees t ON t.id = e.trainee_id
              WHERE e.course_id = @course_id AND e.status <> 'rejected'
                AND ((l.person_id IS NOT NULL AND t.person_id = l.person_id)
                  OR (l.user_id IS NOT NULL AND t.user_id = l.user_id))) AS enrolled
      FROM lecturers l
      LEFT JOIN users u ON u.id = l.user_id
      WHERE l.id = @lecturer_id
    `);
	const lec = check.recordset[0];
	if (!lec || !lec.is_active) {
		const err = new Error('Giảng viên không tồn tại hoặc đã ngừng hoạt động.');
		err.statusCode = 404;
		throw err;
	}
	if (lec.role_id && lec.role_id === (await roleIdOf(ROLE.TRAINEE))) {
		const err = new Error('Không thể phân công tài khoản học viên làm giảng viên.');
		err.statusCode = 400;
		throw err;
	}
	if (lec.enrolled > 0) {
		const err = new Error(
			'Người này đang là học viên của khóa học, không thể phân công làm giảng viên.',
		);
		err.statusCode = 400;
		throw err;
	}

	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('course_id', sql.VarChar(20), courseId)
		.input('lecturer_id', sql.VarChar(20), data.lecturer_id)
		.input('subject_id', sql.VarChar(20), data.subject_id || null)
		.input('note', sql.NVarChar(255), data.note || null).query(`
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_lecturer_assignment_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      INSERT INTO lecturer_assignments (id, course_id, lecturer_id, subject_id, note, created_by)
      VALUES (@new_id, @course_id, @lecturer_id, @subject_id, @note, @actor_id);
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'lecturer_assignment' });
	return { id: result.recordset[0].id };
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
	assignLecturer,
	removeAssignment,
};
