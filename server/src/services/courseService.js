const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const { paging } = require('../utils/paging');
const trainingRoundService = require('./trainingRoundService');
const mailService = require('./mailService');
const trainingFileService = require('./trainingFileService');

const courseSelect = `
  SELECT c.*, p.name AS program_name, r.name AS training_round_name,
         tf.name AS training_form_name,
         (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id) AS enrollment_count,
         (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id AND status = 'approved') AS approved_count,
         (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id AND status = 'pending') AS pending_count
  FROM courses c
  LEFT JOIN training_programs p ON p.id = c.program_id
  LEFT JOIN training_rounds r ON r.id = c.training_round_id
  LEFT JOIN training_forms tf ON tf.id = c.training_form_id
`;

// ─── Courses ──────────────────────────────────────────────────────────────
const getAll = async ({ page = 1, limit = 20, search, training_round_id, program_id, status } = {}) => {
	const pool = await getPool();
	const pg = paging(page, limit, 100);
	const where = ['1=1'];
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	if (search) {
		where.push('c.name LIKE @search');
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	if (training_round_id) {
		where.push('c.training_round_id = @training_round_id');
		req.input('training_round_id', sql.VarChar(20), training_round_id);
	}
	if (program_id) {
		where.push('c.program_id = @program_id');
		req.input('program_id', sql.VarChar(20), program_id);
	}
	if (status) {
		where.push('c.status = @status');
		req.input('status', sql.VarChar(15), status);
	}
	const whereSql = `WHERE ${where.join(' AND ')}`;

	const result = await req.query(`
    ${courseSelect} ${whereSql} ORDER BY c.created_at DESC
    ${pg.fetchClause};
    SELECT COUNT(*) AS total FROM courses c ${whereSql};
  `);
	return {
		data: result.recordsets[0],
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
	};
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(20), id).query(`${courseSelect} WHERE c.id = @id`);
	return result.recordset[0] || null;
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('name', sql.NVarChar(255), data.name)
		.input('program_id', sql.VarChar(20), data.program_id || null)
		.input('training_round_id', sql.VarChar(20), data.training_round_id || null)
		.input('training_form_id', sql.VarChar(20), data.training_form_id || null)
		.input('start_date', sql.Date, data.start_date || null)
		.input('end_date', sql.Date, data.end_date || null)
		.input('capacity', sql.Int, data.capacity || null)
		.input('status', sql.VarChar(15), data.status || 'draft')
		.input('description', sql.NVarChar(sql.MAX), data.description || null)
		.query(`
      DECLARE @new_id VARCHAR(20) = 'KH' + LEFT(REPLACE(NEWID(),'-',''), 18);
      EXEC sp_set_actor @actor_id;
      INSERT INTO courses (id, name, program_id, training_round_id, training_form_id, start_date, end_date, capacity, status, description, created_by)
      VALUES (@new_id, @name, @program_id, @training_round_id, @training_form_id, @start_date, @end_date, @capacity, @status, @description, @actor_id);
      SELECT @new_id AS id;
    `);
	const id = result.recordset[0].id;
	broadcast('update', { entity: 'course' });
	return getById(id);
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool.request().input('id', sql.VarChar(20), id).input('actor_id', sql.VarChar(20), actorId);

	const fieldMap = {
		name: sql.NVarChar(255),
		program_id: sql.VarChar(20),
		training_round_id: sql.VarChar(20),
		training_form_id: sql.VarChar(20),
		start_date: sql.Date,
		end_date: sql.Date,
		capacity: sql.Int,
		status: sql.VarChar(15),
		description: sql.NVarChar(sql.MAX),
	};
	for (const [field, type] of Object.entries(fieldMap)) {
		if (data[field] !== undefined) {
			sets.push(`${field} = @${field}`);
			req.input(field, type, data[field] === '' ? null : data[field]);
		}
	}

	await req.query(`EXEC sp_set_actor @actor_id; UPDATE courses SET ${sets.join(', ')} WHERE id = @id`);
	broadcast('update', { entity: 'course' });
	return getById(id);
};

const remove = async (id, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId)
		.query('EXEC sp_set_actor @actor_id; DELETE FROM courses WHERE id = @id');
	broadcast('update', { entity: 'course' });
};

// ─── Đăng ký khóa học ────────────────────────────────────────────────────
const listEnrollments = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT e.*, t.full_name AS trainee_name, t.phone AS trainee_phone, t.email AS trainee_email,
           u.full_name AS decided_by_name
    FROM course_enrollments e
    JOIN trainees t ON t.id = e.trainee_id
    LEFT JOIN users u ON u.id = e.decided_by
    WHERE e.course_id = @course_id
    ORDER BY e.registered_at DESC
  `);
	return r.recordset;
};

// Thêm học viên vào khóa học (đăng ký hộ — chưa có cổng tự đăng ký ở giai
// đoạn này). Chặn ngay nếu đợt đào tạo đang đóng cửa sổ đăng ký.
const registerTrainee = async (courseId, traineeId, actorId) => {
	const pool = await getPool();
	const course = await getById(courseId);
	if (!course) {
		const err = new Error('Khóa học không tồn tại.');
		err.statusCode = 404;
		throw err;
	}
	if (course.training_round_id) {
		const open = await trainingRoundService.isEnrollmentOpen(course.training_round_id);
		if (!open) {
			const err = new Error('Đợt đào tạo hiện không trong thời gian đăng ký khóa học.');
			err.statusCode = 403;
			throw err;
		}
	}

	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('course_id', sql.VarChar(20), courseId)
		.input('trainee_id', sql.VarChar(20), traineeId)
		.query(`
      IF EXISTS (SELECT 1 FROM course_enrollments WHERE course_id = @course_id AND trainee_id = @trainee_id)
      BEGIN
        THROW 51000, N'Học viên này đã đăng ký khóa học rồi.', 1;
      END
      DECLARE @new_id VARCHAR(20) = 'DK' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO course_enrollments (id, course_id, trainee_id, status)
      VALUES (@new_id, @course_id, @trainee_id, 'pending');
      SELECT @new_id AS id;
    `)
		.catch((err) => {
			if (err.number === 51000) {
				const e = new Error('Học viên này đã đăng ký khóa học rồi.');
				e.statusCode = 409;
				throw e;
			}
			throw err;
		});
	broadcast('update', { entity: 'course_enrollment' });
	return { id: result.recordset[0].id };
};

// Duyệt/từ chối đăng ký. Duyệt mà khóa đã đủ số lượng (capacity) ⇒ tự động
// chuyển sang "waitlisted" thay vì chặn cứng — đúng như kế hoạch tối ưu hoá
// (bản PHP nguồn để admin tự đếm tay).
const decideEnrollment = async (enrollmentId, decision, actorId, note) => {
	const pool = await getPool();
	const current = await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.query('SELECT * FROM course_enrollments WHERE id = @id');
	const row = current.recordset[0];
	if (!row) {
		const err = new Error('Không tìm thấy đăng ký.');
		err.statusCode = 404;
		throw err;
	}

	let finalStatus = decision;
	if (decision === 'approved') {
		const course = await getById(row.course_id);
		if (course?.capacity != null && course.approved_count >= course.capacity) {
			finalStatus = 'waitlisted';
		}
	}

	await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.input('status', sql.VarChar(15), finalStatus)
		.input('decided_by', sql.VarChar(20), actorId)
		.input('note', sql.NVarChar(500), note || null)
		.query(`
      UPDATE course_enrollments
      SET status = @status, decided_by = @decided_by, decided_at = GETDATE(), note = @note
      WHERE id = @id
    `);

	// Học viên là thực thể độc lập, KHÔNG bắt buộc có tài khoản đăng nhập ⇒
	// không thể dùng notificationService (yêu cầu user_id). Báo trực tiếp qua
	// email tới trainees.email nếu có.
	const trainee = await pool
		.request()
		.input('trainee_id', sql.VarChar(20), row.trainee_id)
		.query('SELECT full_name, email FROM trainees WHERE id = @trainee_id');
	const traineeEmail = trainee.recordset[0]?.email;
	if (traineeEmail) {
		const title =
			finalStatus === 'approved'
				? 'Đăng ký khóa học đã được duyệt'
				: finalStatus === 'waitlisted'
					? 'Đăng ký khóa học đang chờ (danh sách chờ)'
					: 'Đăng ký khóa học bị từ chối';
		await mailService.send({
			to: traineeEmail,
			subject: title,
			html: mailService.renderNotificationEmail({
				fullName: trainee.recordset[0].full_name,
				title,
				message: note || null,
			}),
		});
	}

	broadcast('update', { entity: 'course_enrollment' });
	return { id: enrollmentId, status: finalStatus };
};

const bulkDecideEnrollments = async (ids, decision, actorId, note) => {
	const results = [];
	for (const id of ids) {
		try {
			results.push(await decideEnrollment(id, decision, actorId, note));
		} catch (err) {
			results.push({ id, error: err.message });
		}
	}
	return results;
};

// attendance.enrollment_id KHÔNG cascade (2 đường CASCADE cùng hội tụ về
// attendance qua session_id lẫn enrollment_id bị SQL Server chặn — xem ghi
// chú trong migration) — phải tự xoá điểm danh liên quan trước.
const removeEnrollment = async (enrollmentId) => {
	const pool = await getPool();
	await pool.request().input('id', sql.VarChar(20), enrollmentId).query(`
    DELETE FROM attendance WHERE enrollment_id = @id;
    DELETE FROM course_enrollments WHERE id = @id;
  `);
	broadcast('update', { entity: 'course_enrollment' });
};

// ─── Phân công giảng viên ────────────────────────────────────────────────
const listAssignments = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT a.*, l.full_name AS lecturer_name, l.specialty, s.name AS subject_name
    FROM lecturer_assignments a
    JOIN lecturers l ON l.id = a.lecturer_id
    LEFT JOIN subjects s ON s.id = a.subject_id
    WHERE a.course_id = @course_id
    ORDER BY a.created_at DESC
  `);
	return r.recordset;
};

const assignLecturer = async (courseId, data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('course_id', sql.VarChar(20), courseId)
		.input('lecturer_id', sql.VarChar(20), data.lecturer_id)
		.input('subject_id', sql.VarChar(20), data.subject_id || null)
		.input('note', sql.NVarChar(255), data.note || null)
		.query(`
      DECLARE @new_id VARCHAR(20) = 'PC' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO lecturer_assignments (id, course_id, lecturer_id, subject_id, note, created_by)
      VALUES (@new_id, @course_id, @lecturer_id, @subject_id, @note, @actor_id);
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'lecturer_assignment' });
	return { id: result.recordset[0].id };
};

const removeAssignment = async (assignmentId) => {
	const pool = await getPool();
	await pool.request().input('id', sql.VarChar(20), assignmentId).query('DELETE FROM lecturer_assignments WHERE id = @id');
	broadcast('update', { entity: 'lecturer_assignment' });
};

// ─── Buổi học ────────────────────────────────────────────────────────────
const listSessions = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT sess.*, s.name AS subject_name, l.full_name AS lecturer_name
    FROM class_sessions sess
    LEFT JOIN subjects s ON s.id = sess.subject_id
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
		.input('room', sql.NVarChar(100), data.room || null)
		.query(`
      DECLARE @new_id VARCHAR(20) = 'BH' + LEFT(REPLACE(NEWID(),'-',''), 18);
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
	const req = pool.request().input('id', sql.VarChar(20), sessionId).input('actor_id', sql.VarChar(20), actorId);

	const fieldMap = {
		subject_id: sql.VarChar(20),
		lecturer_id: sql.VarChar(20),
		session_date: sql.Date,
		start_time: sql.VarChar(5),
		end_time: sql.VarChar(5),
		room: sql.NVarChar(100),
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
	await pool.request().input('id', sql.VarChar(20), sessionId).query('DELETE FROM class_sessions WHERE id = @id');
	broadcast('update', { entity: 'class_session' });
};

// ─── Điểm danh ───────────────────────────────────────────────────────────
// Danh sách học viên đã duyệt của khóa + trạng thái điểm danh (nếu chưa điểm
// danh, trả status = null để FE tự phân biệt "chưa điểm danh" và "vắng").
const listAttendance = async (sessionId) => {
	const pool = await getPool();
	const r = await pool.request().input('session_id', sql.VarChar(20), sessionId).query(`
    SELECT e.id AS enrollment_id, t.full_name AS trainee_name, a.id AS attendance_id, a.status, a.note
    FROM class_sessions sess
    JOIN course_enrollments e ON e.course_id = sess.course_id AND e.status = 'approved'
    JOIN trainees t ON t.id = e.trainee_id
    LEFT JOIN attendance a ON a.session_id = sess.id AND a.enrollment_id = e.id
    WHERE sess.id = @session_id
    ORDER BY t.full_name
  `);
	return r.recordset;
};

const setAttendance = async (sessionId, enrollmentId, status, note, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('session_id', sql.VarChar(20), sessionId)
		.input('enrollment_id', sql.VarChar(20), enrollmentId)
		.input('status', sql.VarChar(10), status)
		.input('note', sql.NVarChar(255), note || null)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      IF EXISTS (SELECT 1 FROM attendance WHERE session_id = @session_id AND enrollment_id = @enrollment_id)
        UPDATE attendance SET status = @status, note = @note, updated_at = GETDATE(), updated_by = @actor_id
        WHERE session_id = @session_id AND enrollment_id = @enrollment_id;
      ELSE
        INSERT INTO attendance (id, session_id, enrollment_id, status, note, updated_by, updated_at)
        VALUES ('DD' + LEFT(REPLACE(NEWID(),'-',''), 18), @session_id, @enrollment_id, @status, @note, @actor_id, GETDATE());
    `);
	broadcast('update', { entity: 'attendance' });
};

const bulkSetAttendance = async (sessionId, records, actorId) => {
	for (const rec of records) {
		await setAttendance(sessionId, rec.enrollment_id, rec.status, rec.note, actorId);
	}
};

// ─── Tài liệu / bài kiểm tra khóa học (course_documents) ────────────────────
const listDocuments = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT d.id, d.doc_type, d.title, d.is_public, d.created_at,
           f.file_name, f.file_url, f.mime_type, f.file_size
    FROM course_documents d
    JOIN training_files f ON f.id = d.file_id AND f.is_deleted = 0
    WHERE d.course_id = @course_id
    ORDER BY d.created_at DESC
  `);
	return r.recordset;
};

const addDocument = async (courseId, data, file, actorId) => {
	const pool = await getPool();
	const savedFile = await trainingFileService.saveUploadedFile('course_document', courseId, file, actorId);
	const result = await pool
		.request()
		.input('course_id', sql.VarChar(20), courseId)
		.input('doc_type', sql.VarChar(20), data.doc_type || 'material')
		.input('title', sql.NVarChar(255), data.title || file.originalname)
		.input('file_id', sql.VarChar(20), savedFile.id)
		.input('is_public', sql.Bit, data.is_public === 'false' || data.is_public === false ? 0 : 1)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`
      DECLARE @new_id VARCHAR(20) = 'TL' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO course_documents (id, course_id, doc_type, title, file_id, is_public, created_by)
      VALUES (@new_id, @course_id, @doc_type, @title, @file_id, @is_public, @actor_id);
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'course_document' });
	return { id: result.recordset[0].id };
};

const removeDocument = async (docId, actorId) => {
	const pool = await getPool();
	const doc = await pool
		.request()
		.input('id', sql.VarChar(20), docId)
		.query('SELECT file_id FROM course_documents WHERE id = @id');
	if (!doc.recordset[0]) return;
	await pool.request().input('id', sql.VarChar(20), docId).query('DELETE FROM course_documents WHERE id = @id');
	await trainingFileService.softDelete(doc.recordset[0].file_id, actorId);
	broadcast('update', { entity: 'course_document' });
};

// ─── Kết quả học tập (grades) ────────────────────────────────────────────
const listGrades = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT g.*, t.full_name AS trainee_name, s.name AS subject_name
    FROM grades g
    JOIN course_enrollments e ON e.id = g.enrollment_id
    JOIN trainees t ON t.id = e.trainee_id
    LEFT JOIN subjects s ON s.id = g.subject_id
    WHERE e.course_id = @course_id
    ORDER BY t.full_name
  `);
	return r.recordset;
};

// Upsert theo (enrollment_id, subject_id) — 1 dòng / học viên / môn (subject_id
// NULL = điểm tổng kết khóa học).
const upsertGrade = async (enrollmentId, subjectId, data, actorId) => {
	const pool = await getPool();
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
			.input('score', sql.Decimal(5, 2), data.score ?? null)
			.input('result', sql.VarChar(20), data.result || null)
			.input('note', sql.NVarChar(255), data.note || null)
			.input('actor_id', sql.VarChar(20), actorId).query(`
        UPDATE grades SET score = @score, result = @result, note = @note,
               updated_at = GETDATE(), updated_by = @actor_id
        WHERE id = @id
      `);
		return { id: existing.recordset[0].id };
	}

	const result = await pool
		.request()
		.input('enrollment_id', sql.VarChar(20), enrollmentId)
		.input('subject_id', sql.VarChar(20), subjectId || null)
		.input('score', sql.Decimal(5, 2), data.score ?? null)
		.input('result', sql.VarChar(20), data.result || null)
		.input('note', sql.NVarChar(255), data.note || null)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`
      DECLARE @new_id VARCHAR(20) = 'KQ' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO grades (id, enrollment_id, subject_id, score, result, note, created_by)
      VALUES (@new_id, @enrollment_id, @subject_id, @score, @result, @note, @actor_id);
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'grade' });
	return { id: result.recordset[0].id };
};

const removeGrade = async (gradeId) => {
	const pool = await getPool();
	await pool.request().input('id', sql.VarChar(20), gradeId).query('DELETE FROM grades WHERE id = @id');
	broadcast('update', { entity: 'grade' });
};

// ─── Chứng chỉ ────────────────────────────────────────────────────────────
const listCertificates = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT c.*, t.full_name AS trainee_name, f.file_name, f.file_url
    FROM certificates c
    JOIN course_enrollments e ON e.id = c.enrollment_id
    JOIN trainees t ON t.id = e.trainee_id
    LEFT JOIN training_files f ON f.id = c.file_id AND f.is_deleted = 0
    WHERE e.course_id = @course_id
    ORDER BY c.issue_date DESC
  `);
	return r.recordset;
};

// Chỉ cấp chứng chỉ cho đăng ký đã duyệt ('approved'). Số chứng chỉ dạng
// CC<năm><số thứ tự 4 chữ số>, sinh tuần tự theo năm hiện tại (mirror cách
// categories/levels tự sinh mã bằng MAX+1 — không cần stored proc riêng).
const issueCertificate = async (enrollmentId, actorId) => {
	const pool = await getPool();
	const enrollment = await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.query('SELECT status FROM course_enrollments WHERE id = @id');
	if (!enrollment.recordset[0]) {
		const err = new Error('Không tìm thấy đăng ký.');
		err.statusCode = 404;
		throw err;
	}
	if (enrollment.recordset[0].status !== 'approved') {
		const err = new Error('Chỉ có thể cấp chứng chỉ cho học viên đã được duyệt tham gia khóa học.');
		err.statusCode = 409;
		throw err;
	}

	const year = new Date().getFullYear();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('enrollment_id', sql.VarChar(20), enrollmentId)
		.input('year', sql.VarChar(4), String(year))
		.query(`
      IF EXISTS (SELECT 1 FROM certificates WHERE enrollment_id = @enrollment_id)
      BEGIN
        THROW 51001, N'Học viên này đã được cấp chứng chỉ cho khóa học này rồi.', 1;
      END
      DECLARE @seq INT;
      SELECT @seq = ISNULL(MAX(CAST(RIGHT(cert_no, 4) AS INT)), 0) + 1
      FROM certificates WHERE cert_no LIKE 'CC' + @year + '%';
      DECLARE @cert_no VARCHAR(30) = 'CC' + @year + RIGHT('0000' + CAST(@seq AS VARCHAR(4)), 4);
      DECLARE @new_id VARCHAR(20) = 'CH' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO certificates (id, enrollment_id, cert_no, created_by)
      VALUES (@new_id, @enrollment_id, @cert_no, @actor_id);
      SELECT @new_id AS id, @cert_no AS cert_no;
    `)
		.catch((err) => {
			if (err.number === 51001) {
				const e = new Error('Học viên này đã được cấp chứng chỉ cho khóa học này rồi.');
				e.statusCode = 409;
				throw e;
			}
			throw err;
		});
	broadcast('update', { entity: 'certificate' });
	return result.recordset[0];
};

const removeCertificate = async (certId) => {
	const pool = await getPool();
	await pool.request().input('id', sql.VarChar(20), certId).query('DELETE FROM certificates WHERE id = @id');
	broadcast('update', { entity: 'certificate' });
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	remove,
	listEnrollments,
	registerTrainee,
	decideEnrollment,
	bulkDecideEnrollments,
	removeEnrollment,
	listAssignments,
	assignLecturer,
	removeAssignment,
	listSessions,
	createSession,
	updateSession,
	removeSession,
	listAttendance,
	setAttendance,
	bulkSetAttendance,
	listDocuments,
	addDocument,
	removeDocument,
	listGrades,
	upsertGrade,
	removeGrade,
	listCertificates,
	issueCertificate,
	removeCertificate,
};
