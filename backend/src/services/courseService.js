const { signToken, verifyToken } = require('../utils/keys');
const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const { paging } = require('../utils/paging');
const mailService = require('./mailService');
const trainingFileService = require('./trainingFileService');
const { scopeOf } = require('../middlewares/auth');
const { ROLE, roleIdOf, inputRoleId } = require('./roleCodes');
const { assertHttpUrl } = require('../utils/safeUrl');
const { todayVN } = require('../utils/vnDate');

// Mã QR điểm danh: JWT ngắn hạn ký chính session_id (mirror utils/captcha.js)
// — không trạng thái, không cần lưu DB, hết hạn nhanh. FE làm mới QR mỗi 28s;
// TTL 75s để mã vừa biến khỏi màn hình vẫn còn ≥45s — đủ cho đường "chụp ảnh
// mã QR" (mở camera → chụp → xác nhận → tải lên) khi không có HTTPS để quét trực tiếp.
const ATTENDANCE_QR_TTL = '75s';
const ATTENDANCE_QR_PURPOSE = 'course_attendance_qr';
const DEVICE_TAKEN_MSG =
	'Thiết bị này đã dùng để điểm danh cho người khác trong buổi này. Vui lòng dùng thiết bị của chính bạn hoặc liên hệ giảng viên.';

// Mỗi khóa học tự có cửa sổ đăng ký riêng (enrollment_start/end_date) và tự
// quyết định có công khai trên cổng đăng ký không cần đăng nhập hay không
// (is_public_registration) — xem 2026-09-15_course_enrollment_window và
// 2026-09-20_drop_training_rounds.
const isEnrollmentOpenRow = (c) => {
	if (!c.enrollment_start_date && !c.enrollment_end_date) return true; // chưa cấu hình = mở
	const today = todayVN();
	const afterStart = !c.enrollment_start_date || today >= new Date(c.enrollment_start_date);
	const beforeEnd = !c.enrollment_end_date || today <= new Date(c.enrollment_end_date);
	return afterStart && beforeEnd;
};

// prerequisites/objectives lưu dạng chuỗi JSON (mảng string) — parse lại cho FE.
const parseJsonList = (v) => {
	if (!v) return [];
	try {
		const parsed = JSON.parse(v);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

// Trạng thái hiển thị được suy ra hoàn toàn từ ngày tháng thay vì để người
// dùng tự chọn tay (dễ quên cập nhật) — cột courses.status giờ chỉ còn dùng
// để lưu cờ 'cancelled' (huỷ khóa học), đây là lựa chọn duy nhất không thể
// suy ra từ ngày tháng nên vẫn cần override thủ công.
const computeDisplayStatus = (c, enrollmentOpen) => {
	if (c.status === 'cancelled') return 'cancelled';
	const today = todayVN();
	const startDate = c.start_date ? new Date(c.start_date) : null;
	const endDate = c.end_date ? new Date(c.end_date) : null;
	if (endDate && today > endDate) return 'completed';
	if (startDate && today >= startDate && (!endDate || today <= endDate)) return 'in_progress';
	if (enrollmentOpen) return 'enrolling';
	return 'upcoming';
};

const normalize = (c) => {
	const enrollmentOpen = isEnrollmentOpenRow(c);
	return {
		...c,
		enrollment_open: enrollmentOpen,
		display_status: computeDisplayStatus(c, enrollmentOpen),
		prerequisites: parseJsonList(c.prerequisites),
		objectives: parseJsonList(c.objectives),
	};
};

// Quan hệ course<->training_program giờ là N:N qua bảng bridge course_programs
// (xem 2026-09-16_course_programs_bridge.sql) — courses không còn cột
// program_id, program_names chỉ để hiển thị nhanh trên bảng danh sách.
const courseSelect = `
  SELECT c.*,
         tf.name AS training_form_name,
         (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id) AS enrollment_count,
         (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id AND status = 'approved') AS approved_count,
         (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id AND status = 'pending') AS pending_count,
         (SELECT STRING_AGG(tp.name, ', ') FROM course_programs cp JOIN training_programs tp ON tp.id = cp.program_id WHERE cp.course_id = c.id) AS program_names
  FROM courses c
  LEFT JOIN training_forms tf ON tf.id = c.training_form_id
`;

// EXISTS: khóa có giảng viên = actor được phân công dạy hay không (điều kiện
// dùng chung cho cả getAll và getById khi scope === 'assigned').
const ASSIGNED_EXISTS_SQL = `EXISTS (
    SELECT 1 FROM lecturer_assignments la
    INNER JOIN lecturers lec ON lec.id = la.lecturer_id
    WHERE la.course_id = c.id AND lec.user_id = @actor_id
  )`;

// ─── Kiểm tra theo bản ghi (chống IDOR) ─────────────────────────────────────
// Phạm vi 'assigned' (giảng viên) chỉ thao tác được khoá học mình được phân
// công. authorizePermission ở route không biết khoá học cụ thể — trước đây chỉ
// danh sách + chi tiết khoá học lọc theo phân công, còn học viên / buổi học /
// điểm danh / tài liệu / điểm / chứng chỉ của khoá khác vẫn đọc-sửa được theo
// mã. routes/courses.js gắn các hàm dưới qua router.param.
const assertCourseInScope = async (courseId, actor) => {
	if (scopeOf(actor, 'courses') !== 'assigned') return;
	const pool = await getPool();
	const ok = (
		await pool
			.request()
			.input('id', sql.VarChar(20), String(courseId))
			.input('actor_id', sql.VarChar(20), actor.id)
			.query(`SELECT 1 AS ok FROM courses c WHERE c.id = @id AND ${ASSIGNED_EXISTS_SQL}`)
	).recordset[0];
	if (!ok) {
		throw Object.assign(new Error('Không có quyền thao tác trên khóa học này'), { statusCode: 403 });
	}
};

// Mã bản ghi con → khoá học chứa nó (tên tham số route → câu truy vấn)
const CHILD_COURSE_SQL = {
	enrollmentId: 'SELECT course_id FROM course_enrollments WHERE id = @id',
	sessionId: 'SELECT course_id FROM class_sessions WHERE id = @id',
	docId: 'SELECT course_id FROM course_documents WHERE id = @id',
	linkId: 'SELECT course_id FROM course_programs WHERE id = @id',
	assignmentId: 'SELECT course_id FROM lecturer_assignments WHERE id = @id',
	gradeId: `SELECT e.course_id FROM grades g
	          JOIN course_enrollments e ON e.id = g.enrollment_id WHERE g.id = @id`,
	certId: `SELECT e.course_id FROM certificates c
	         JOIN course_enrollments e ON e.id = c.enrollment_id WHERE c.id = @id`,
};

const assertCourseChildInScope = async (paramName, childId, actor) => {
	if (scopeOf(actor, 'courses') !== 'assigned') return;
	const pool = await getPool();
	const row = (
		await pool.request().input('id', sql.VarChar(20), String(childId)).query(CHILD_COURSE_SQL[paramName])
	).recordset[0];
	if (!row) throw Object.assign(new Error('Không tìm thấy dữ liệu'), { statusCode: 404 });
	await assertCourseInScope(row.course_id, actor);
};

// ─── Courses ──────────────────────────────────────────────────────────────
const getAll = async (
	{ page = 1, limit = 20, search, program_id, status } = {},
	actor = null,
) => {
	const pool = await getPool();
	const pg = paging(page, limit, 100);
	const where = ['1=1'];
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	if (search) {
		where.push('c.name LIKE @search');
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	if (program_id) {
		where.push('EXISTS (SELECT 1 FROM course_programs cp WHERE cp.course_id = c.id AND cp.program_id = @program_id)');
		req.input('program_id', sql.VarChar(20), program_id);
	}
	if (status) {
		where.push('c.status = @status');
		req.input('status', sql.VarChar(15), status);
	}
	if (actor && scopeOf(actor, 'courses') === 'assigned') {
		where.push(ASSIGNED_EXISTS_SQL);
		req.input('actor_id', sql.VarChar(20), actor.id);
	}
	const whereSql = `WHERE ${where.join(' AND ')}`;

	const result = await req.query(`
    ${courseSelect} ${whereSql} ORDER BY c.created_at DESC
    ${pg.fetchClause};
    SELECT COUNT(*) AS total FROM courses c ${whereSql};
  `);
	return {
		data: result.recordsets[0].map(normalize),
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
	};
};

const getById = async (id, actor = null) => {
	const pool = await getPool();
	if (actor && scopeOf(actor, 'courses') === 'assigned') {
		const access = await pool
			.request()
			.input('id', sql.VarChar(20), id)
			.input('actor_id', sql.VarChar(20), actor.id)
			.query(`SELECT 1 AS ok FROM courses c WHERE c.id = @id AND ${ASSIGNED_EXISTS_SQL}`);
		if (!access.recordset[0]) {
			throw Object.assign(new Error('Không có quyền xem khóa học này'), {
				status: 403,
				statusCode: 403,
			});
		}
	}
	const result = await pool.request().input('id', sql.VarChar(20), id).query(`${courseSelect} WHERE c.id = @id`);
	return result.recordset[0] ? normalize(result.recordset[0]) : null;
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('name', sql.NVarChar(255), data.name)
		.input('training_form_id', sql.VarChar(20), data.training_form_id || null)
		.input('start_date', sql.Date, data.start_date || null)
		.input('end_date', sql.Date, data.end_date || null)
		.input('enrollment_start_date', sql.Date, data.enrollment_start_date || null)
		.input('enrollment_end_date', sql.Date, data.enrollment_end_date || null)
		.input('capacity', sql.Int, data.capacity || null)
		.input('status', sql.VarChar(15), data.status || 'draft')
		.input('is_public_registration', sql.Bit, data.is_public_registration ? 1 : 0)
		.input('description', sql.NVarChar(sql.MAX), data.description || null)
		.input('prerequisites', sql.NVarChar(sql.MAX), JSON.stringify(data.prerequisites || []))
		.input('objectives', sql.NVarChar(sql.MAX), JSON.stringify(data.objectives || []))
		.query(`
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_course_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      EXEC sp_set_actor @actor_id;
      INSERT INTO courses (id, name, training_form_id, start_date, end_date, enrollment_start_date, enrollment_end_date, capacity, status, is_public_registration, description, prerequisites, objectives, created_by)
      VALUES (@new_id, @name, @training_form_id, @start_date, @end_date, @enrollment_start_date, @enrollment_end_date, @capacity, @status, @is_public_registration, @description, @prerequisites, @objectives, @actor_id);
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
		training_form_id: sql.VarChar(20),
		start_date: sql.Date,
		end_date: sql.Date,
		enrollment_start_date: sql.Date,
		enrollment_end_date: sql.Date,
		capacity: sql.Int,
		status: sql.VarChar(15),
		is_public_registration: sql.Bit,
		description: sql.NVarChar(sql.MAX),
	};
	for (const [field, type] of Object.entries(fieldMap)) {
		if (data[field] !== undefined) {
			sets.push(`${field} = @${field}`);
			req.input(field, type, data[field] === '' ? null : data[field]);
		}
	}
	if (data.prerequisites !== undefined) {
		sets.push('prerequisites = @prerequisites');
		req.input('prerequisites', sql.NVarChar(sql.MAX), JSON.stringify(data.prerequisites || []));
	}
	if (data.objectives !== undefined) {
		sets.push('objectives = @objectives');
		req.input('objectives', sql.NVarChar(sql.MAX), JSON.stringify(data.objectives || []));
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

// ─── Chương trình đào tạo áp dụng (course_programs, N:N) ────────────────
// 1 khóa học có thể áp dụng nhiều chương trình đào tạo, mỗi cặp có lịch/địa
// điểm/giảng viên/trạng thái riêng — xem 2026-09-16_course_programs_bridge.
const listProgramLinks = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT cp.*, tp.name AS program_name, l.full_name AS lecturer_name
    FROM course_programs cp
    JOIN training_programs tp ON tp.id = cp.program_id
    LEFT JOIN lecturers l ON l.id = cp.lecturer_id
    WHERE cp.course_id = @course_id
    ORDER BY cp.created_at DESC
  `);
	return r.recordset;
};

const addProgramLink = async (courseId, data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('course_id', sql.VarChar(20), courseId)
		.input('program_id', sql.VarChar(20), data.program_id)
		.input('start_date', sql.Date, data.start_date || null)
		.input('end_date', sql.Date, data.end_date || null)
		.input('location', sql.NVarChar(255), data.location || null)
		.input('lecturer_id', sql.VarChar(20), data.lecturer_id || null)
		.input('external_lecturer_name', sql.NVarChar(150), data.external_lecturer_name || null)
		.input('status', sql.VarChar(15), data.status || 'active')
		.query(`
      IF EXISTS (SELECT 1 FROM course_programs WHERE course_id = @course_id AND program_id = @program_id)
      BEGIN
        THROW 51002, N'Chương trình này đã được gán cho khóa học rồi.', 1;
      END
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_course_program_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      INSERT INTO course_programs (id, course_id, program_id, start_date, end_date, location, lecturer_id, external_lecturer_name, status, created_by)
      VALUES (@new_id, @course_id, @program_id, @start_date, @end_date, @location, @lecturer_id, @external_lecturer_name, @status, @actor_id);
      SELECT @new_id AS id;
    `)
		.catch((err) => {
			if (err.number === 51002) {
				const e = new Error('Chương trình này đã được gán cho khóa học rồi.');
				e.statusCode = 409;
				throw e;
			}
			throw err;
		});
	broadcast('update', { entity: 'course' });
	return { id: result.recordset[0].id };
};

const updateProgramLink = async (linkId, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool.request().input('id', sql.VarChar(20), linkId).input('actor_id', sql.VarChar(20), actorId);

	const fieldMap = {
		start_date: sql.Date,
		end_date: sql.Date,
		location: sql.NVarChar(255),
		lecturer_id: sql.VarChar(20),
		external_lecturer_name: sql.NVarChar(150),
		status: sql.VarChar(15),
	};
	for (const [field, type] of Object.entries(fieldMap)) {
		if (data[field] !== undefined) {
			sets.push(`${field} = @${field}`);
			req.input(field, type, data[field] === '' ? null : data[field]);
		}
	}
	await req.query(`UPDATE course_programs SET ${sets.join(', ')} WHERE id = @id`);
	broadcast('update', { entity: 'course' });
};

const removeProgramLink = async (linkId) => {
	const pool = await getPool();
	await pool.request().input('id', sql.VarChar(20), linkId).query('DELETE FROM course_programs WHERE id = @id');
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

// Thêm học viên vào khóa học. Chặn nếu khóa học đang đóng cửa sổ đăng ký, trừ
// khi options.bypassWindow (admin / quản lý đào tạo ghi danh hộ — xem
// courseController.registerTrainee).
const registerTrainee = async (courseId, traineeId, actorId, { bypassWindow = false } = {}) => {
	const pool = await getPool();
	const course = await getById(courseId);
	if (!course) {
		const err = new Error('Khóa học không tồn tại.');
		err.statusCode = 404;
		throw err;
	}
	if (!course.enrollment_open && !bypassWindow) {
		const err = new Error('Khóa học hiện không trong thời gian đăng ký.');
		err.statusCode = 403;
		throw err;
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
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_course_enrollment_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      INSERT INTO course_enrollments (id, course_id, trainee_id, status, created_by)
      VALUES (@new_id, @course_id, @trainee_id, 'pending', @actor_id);
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

// Nhân viên nội viện (users) CHƯA có hồ sơ học viên — hiện chung với danh sách
// học viên ở ô "thêm học viên" của khóa học. Người đã có hồ sơ (trainees.user_id)
// thì đã nằm trong GET /trainees nên loại ra, tránh trùng 2 dòng. Bỏ VT08 (tài
// khoản do "Cấp tài khoản học viên" sinh ra — luôn đã gắn với 1 trainee).
const listStaffCandidates = async () => {
	const pool = await getPool();
	const result = await (await inputRoleId(pool.request(), 'trainee_role', ROLE.TRAINEE)).query(`
    SELECT u.id, u.full_name, u.staff_number, d.name AS department_name
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.is_active = 1
      AND ISNULL(u.role_id, '') <> @trainee_role
      AND NOT EXISTS (SELECT 1 FROM trainees t WHERE t.user_id = u.id)
    ORDER BY u.full_name
  `);
	return result.recordset;
};

// Ghi danh 1 nhân viên nội viện: dùng lại hồ sơ học viên đã gắn tài khoản nếu có,
// chưa có thì tự tạo từ thông tin users (is_employee = 1, gắn sẵn user_id) — nhờ đó
// nhân viên đăng nhập bằng chính tài khoản đang dùng là điểm danh QR / thi online
// được ngay, không cần "Cấp tài khoản học viên" riêng.
const registerStaff = async (courseId, userId, actorId, { bypassWindow = false } = {}) => {
	const course = await getById(courseId);
	if (!course) {
		const err = new Error('Khóa học không tồn tại.');
		err.statusCode = 404;
		throw err;
	}
	if (!course.enrollment_open && !bypassWindow) {
		const err = new Error('Khóa học hiện không trong thời gian đăng ký.');
		err.statusCode = 403;
		throw err;
	}

	const pool = await getPool();
	const linked = await pool
		.request()
		.input('uid', sql.VarChar(20), userId)
		.query('SELECT TOP 1 id FROM trainees WHERE user_id = @uid');
	let traineeId = linked.recordset[0]?.id;

	if (!traineeId) {
		const userRes = await pool
			.request()
			.input('uid', sql.VarChar(20), userId)
			.query('SELECT id, full_name, email, department_id FROM users WHERE id = @uid AND is_active = 1');
		const user = userRes.recordset[0];
		if (!user) {
			const err = new Error('Nhân viên không tồn tại hoặc đã bị khoá.');
			err.statusCode = 404;
			throw err;
		}
		// require muộn — traineeService kéo theo topicMemberService/personService, tránh vòng require.
		const traineeService = require('./traineeService');
		const trainee = await traineeService.create(
			{
				full_name: user.full_name,
				email: user.email,
				department_id: user.department_id,
				is_employee: true,
			},
			actorId,
		);
		traineeId = trainee.id;
		await pool
			.request()
			.input('tid', sql.VarChar(20), traineeId)
			.input('uid', sql.VarChar(20), userId)
			.query(`
        UPDATE trainees
        SET user_id = @uid, account_granted = 1, account_granted_at = GETDATE()
        WHERE id = @tid
      `);
	}

	return registerTrainee(courseId, traineeId, actorId, { bypassWindow });
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
      SET status = @status, decided_by = @decided_by, decided_at = GETDATE(), note = @note,
          updated_at = GETDATE(), updated_by = @decided_by
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
			event: 'COURSE_ENROLLMENT',
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
		const err = new Error('Người này đang là học viên của khóa học, không thể phân công làm giảng viên.');
		err.statusCode = 400;
		throw err;
	}

	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('course_id', sql.VarChar(20), courseId)
		.input('lecturer_id', sql.VarChar(20), data.lecturer_id)
		.input('subject_id', sql.VarChar(20), data.subject_id || null)
		.input('note', sql.NVarChar(255), data.note || null)
		.query(`
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
	await pool.request().input('id', sql.VarChar(20), assignmentId).query('DELETE FROM lecturer_assignments WHERE id = @id');
	broadcast('update', { entity: 'lecturer_assignment' });
};

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
    SELECT sess.id, sess.course_id, c.name AS course_name, sess.subject_id, s.name AS subject_name,
           sess.lecturer_id, l.full_name AS lecturer_name,
           sess.session_date, sess.start_time, sess.end_time, sess.room
    FROM class_sessions sess
    INNER JOIN courses c ON c.id = sess.course_id
    LEFT JOIN subjects s ON s.id = sess.subject_id
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
		.input('room', sql.NVarChar(255), data.room || null)
		.query(`
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
	const req = pool.request().input('id', sql.VarChar(20), sessionId).input('actor_id', sql.VarChar(20), actorId);

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
	await pool.request().input('id', sql.VarChar(20), sessionId).query('DELETE FROM class_sessions WHERE id = @id');
	broadcast('update', { entity: 'class_session' });
};

// Tạo nhiều buổi học cùng lúc theo khoảng ngày + các thứ trong tuần được chọn.
// weekdays: mảng số 0=CN..6=T7 (khớp Date.getUTCDay()). Bỏ qua ngày đã có buổi
// học trùng course_id + session_date + start_time (DB không có UNIQUE constraint
// chống trùng lịch — xem ghi chú trong migration).
const createSessionsBulk = async (courseId, data, actorId) => {
	const pool = await getPool();
	const { start_date, end_date, weekdays, start_time, end_time, room, lecturer_id, subject_id } = data;
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
			.input('room', sql.NVarChar(255), room || null)
			.query(`
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
      BEGIN
        DECLARE @new_id VARCHAR(20);
        EXEC sp_gen_attendance_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
        INSERT INTO attendance (id, session_id, enrollment_id, status, note, created_by, updated_by, updated_at)
        VALUES (@new_id, @session_id, @enrollment_id, @status, @note, @actor_id, @actor_id, GETDATE());
      END
    `);
	broadcast('update', { entity: 'attendance' });
};

const bulkSetAttendance = async (sessionId, records, actorId) => {
	for (const rec of records) {
		await setAttendance(sessionId, rec.enrollment_id, rec.status, rec.note, actorId);
	}
};

// Sinh mã QR điểm danh cho 1 buổi học — giảng viên/quản lý (đã qua
// authorizePermission courses:update ở route) hiển thị lên màn hình lớp,
// học viên tự quét bằng tài khoản đã đăng nhập (checkInSelf).
const generateAttendanceQrToken = (sessionId) =>
	signToken('attendance-qr', { session_id: sessionId, purpose: ATTENDANCE_QR_PURPOSE }, ATTENDANCE_QR_TTL);

// Học viên tự điểm danh bằng mã QR vừa quét — actor phải là tài khoản đã được
// cấp cho 1 trainee (trainees.user_id, xem D0) có ghi danh 'approved' vào
// khóa của buổi học này.
const checkInSelf = async (token, deviceId, actor) => {
	let decoded;
	try {
		decoded = verifyToken('attendance-qr', token);
	} catch {
		const err = new Error('Mã QR đã hết hạn, vui lòng thử lại.');
		err.statusCode = 401;
		throw err;
	}
	if (decoded.purpose !== ATTENDANCE_QR_PURPOSE) {
		const err = new Error('Mã QR không hợp lệ.');
		err.statusCode = 401;
		throw err;
	}

	const pool = await getPool();
	const enrollRes = await pool
		.request()
		.input('session_id', sql.VarChar(20), decoded.session_id)
		.input('user_id', sql.VarChar(20), actor.id).query(`
      SELECT e.id AS enrollment_id
      FROM class_sessions sess
      JOIN course_enrollments e ON e.course_id = sess.course_id AND e.status = 'approved'
      JOIN trainees t ON t.id = e.trainee_id
      WHERE sess.id = @session_id AND t.user_id = @user_id
    `);
	const enrollment = enrollRes.recordset[0];
	if (!enrollment) {
		const err = new Error('Bạn không có trong danh sách học viên của buổi học này.');
		err.statusCode = 403;
		throw err;
	}

	// 1 thiết bị chỉ điểm danh cho 1 học viên mỗi buổi — chặn cầm máy đăng nhập
	// lần lượt tài khoản người khác để điểm danh hộ. Chính học viên quét lại
	// (kể cả từ máy khác) vẫn được, ghi đè mã thiết bị.
	const res = await pool
		.request()
		.input('session_id', sql.VarChar(20), decoded.session_id)
		.input('enrollment_id', sql.VarChar(20), enrollment.enrollment_id)
		.input('device_id', sql.VarChar(64), deviceId)
		.input('actor_id', sql.VarChar(20), actor.id).query(`
      IF EXISTS (SELECT 1 FROM attendance WHERE session_id = @session_id
                 AND checkin_device_id = @device_id AND enrollment_id <> @enrollment_id)
        SELECT CAST(1 AS BIT) AS device_taken;
      ELSE
      BEGIN
        IF EXISTS (SELECT 1 FROM attendance WHERE session_id = @session_id AND enrollment_id = @enrollment_id)
          UPDATE attendance SET status = 'present', method = 'qr', checked_in_at = GETDATE(),
                 checkin_device_id = @device_id, updated_at = GETDATE(), updated_by = @actor_id
          WHERE session_id = @session_id AND enrollment_id = @enrollment_id;
        ELSE
        BEGIN
          DECLARE @new_id VARCHAR(20);
          EXEC sp_gen_attendance_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
          INSERT INTO attendance (id, session_id, enrollment_id, status, method, checked_in_at, checkin_device_id, created_by, updated_by, updated_at)
          VALUES (@new_id, @session_id, @enrollment_id, 'present', 'qr', GETDATE(), @device_id, @actor_id, @actor_id, GETDATE());
        END
        SELECT CAST(0 AS BIT) AS device_taken;
      END
    `);
	if (res.recordset[0].device_taken) {
		const err = new Error(DEVICE_TAKEN_MSG);
		err.statusCode = 403;
		throw err;
	}
	broadcast('update', { entity: 'attendance' });
	return { session_id: decoded.session_id };
};

// ─── Tài liệu / bài kiểm tra khóa học (course_documents) ────────────────────
// source_type 'file' (upload, kể cả video — giới hạn dung lượng xem
// routes/courses.js) hoặc 'link' (dán URL ngoài, không có file) — xem
// 2026-09-17_course_documents_link_support.
const listDocuments = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT d.id, d.doc_type, d.title, d.is_public, d.exam_type, d.download_count, d.created_at,
           d.source_type, d.external_url,
           f.file_name, f.file_url, f.mime_type, f.file_size
    FROM course_documents d
    LEFT JOIN training_files f ON f.id = d.file_id AND f.is_deleted = 0
    WHERE d.course_id = @course_id
    ORDER BY d.created_at DESC
  `);
	return r.recordset;
};

const addDocument = async (courseId, data, file, actorId) => {
	const pool = await getPool();
	const sourceType = data.source_type === 'link' ? 'link' : 'file';
	let fileId = null;
	if (sourceType === 'file') {
		const savedFile = await trainingFileService.saveUploadedFile('course_document', courseId, file, actorId);
		fileId = savedFile.id;
	}
	const result = await pool
		.request()
		.input('course_id', sql.VarChar(20), courseId)
		.input('doc_type', sql.VarChar(20), data.doc_type || 'material')
		.input('title', sql.NVarChar(255), data.title || (file ? trainingFileService.decodeOriginalName(file.originalname) : 'Liên kết'))
		.input('source_type', sql.VarChar(10), sourceType)
		.input('file_id', sql.VarChar(20), fileId)
		.input('external_url', sql.NVarChar(500), sourceType === 'link' ? assertHttpUrl(data.external_url, 'Liên kết') : null)
		.input('is_public', sql.Bit, data.is_public === 'false' || data.is_public === false ? 0 : 1)
		.input('exam_type', sql.VarChar(20), data.exam_type || null)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_course_document_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      INSERT INTO course_documents (id, course_id, doc_type, title, source_type, file_id, external_url, is_public, exam_type, created_by)
      VALUES (@new_id, @course_id, @doc_type, @title, @source_type, @file_id, @external_url, @is_public, @exam_type, @actor_id);
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'course_document' });
	return { id: result.recordset[0].id };
};

// Tăng lượt tải khi học viên/quản trị mở file — không kiểm tra quyền chi
// tiết hơn ở đây (route đã gate courses:read, ai xem được là tải được).
const incrementDocumentDownload = async (docId) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(20), docId).query(`
    UPDATE course_documents SET download_count = download_count + 1 WHERE id = @id;
    SELECT download_count FROM course_documents WHERE id = @id;
  `);
	if (!result.recordset[0]) {
		const err = new Error('Không tìm thấy tài liệu.');
		err.statusCode = 404;
		throw err;
	}
	return { download_count: result.recordset[0].download_count };
};

const removeDocument = async (docId, actorId) => {
	const pool = await getPool();
	const doc = await pool
		.request()
		.input('id', sql.VarChar(20), docId)
		.query('SELECT file_id FROM course_documents WHERE id = @id');
	if (!doc.recordset[0]) return;
	await pool.request().input('id', sql.VarChar(20), docId).query('DELETE FROM course_documents WHERE id = @id');
	if (doc.recordset[0].file_id) await trainingFileService.softDelete(doc.recordset[0].file_id, actorId);
	broadcast('update', { entity: 'course_document' });
};

// ─── Kết quả học tập (grades) ────────────────────────────────────────────
const listGrades = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT g.*, t.full_name AS trainee_name, s.name AS subject_name, tp.name AS program_name
    FROM grades g
    JOIN course_enrollments e ON e.id = g.enrollment_id
    JOIN trainees t ON t.id = e.trainee_id
    LEFT JOIN subjects s ON s.id = g.subject_id
    LEFT JOIN training_programs tp ON tp.id = g.program_id
    WHERE e.course_id = @course_id
    ORDER BY t.full_name
  `);
	return r.recordset;
};

// Hệ số tính điểm tổng kết từ điểm thành phần: thường xuyên x1, giữa kỳ x2,
// cuối kỳ x3 (quy ước phổ biến trong đào tạo VN — chỉnh 3 số này nếu viện
// dùng công thức khác). Chỉ tính khi có đủ cả 3 điểm thành phần; nếu không,
// vẫn cho phép set score/result thủ công như trước (giữ tương thích ngược).
const GRADE_WEIGHTS = { regular: 1, midterm: 2, final: 3 };

const classifyScore = (score) => {
	if (score == null) return null;
	if (score >= 8) return 'Giỏi';
	if (score >= 6.5) return 'Khá';
	if (score >= 5) return 'Trung bình';
	return 'Yếu';
};

const computeFinalScore = (regular, midterm, final) => {
	if (regular == null || midterm == null || final == null) return null;
	const { regular: wr, midterm: wm, final: wf } = GRADE_WEIGHTS;
	const total = regular * wr + midterm * wm + final * wf;
	return Math.round((total / (wr + wm + wf)) * 100) / 100;
};

// Upsert theo (enrollment_id, subject_id) — 1 dòng / học viên / môn (subject_id
// NULL = điểm tổng kết khóa học).
const upsertGrade = async (enrollmentId, subjectId, data, actorId) => {
	const pool = await getPool();
	const regular = data.regular_score ?? null;
	const midterm = data.midterm_score ?? null;
	const finalScore = data.final_score ?? null;
	const computedScore = computeFinalScore(regular, midterm, finalScore);
	const score = computedScore ?? (data.score ?? null);
	const classification = classifyScore(score);
	const result = data.result || (score != null ? (score >= 5 ? 'pass' : 'fail') : null);

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
			.input('score', sql.Decimal(5, 2), score)
			.input('result', sql.VarChar(20), result)
			.input('regular_score', sql.Decimal(5, 2), regular)
			.input('midterm_score', sql.Decimal(5, 2), midterm)
			.input('final_score', sql.Decimal(5, 2), finalScore)
			.input('classification', sql.NVarChar(20), classification)
			.input('program_id', sql.VarChar(20), data.program_id || null)
			.input('note', sql.NVarChar(255), data.note || null)
			.input('actor_id', sql.VarChar(20), actorId).query(`
        UPDATE grades SET score = @score, result = @result, note = @note,
               regular_score = @regular_score, midterm_score = @midterm_score,
               final_score = @final_score, classification = @classification,
               program_id = @program_id,
               updated_at = GETDATE(), updated_by = @actor_id
        WHERE id = @id
      `);
		broadcast('update', { entity: 'grade' });
		return { id: existing.recordset[0].id };
	}

	const result_ = await pool
		.request()
		.input('enrollment_id', sql.VarChar(20), enrollmentId)
		.input('subject_id', sql.VarChar(20), subjectId || null)
		.input('score', sql.Decimal(5, 2), score)
		.input('result', sql.VarChar(20), result)
		.input('regular_score', sql.Decimal(5, 2), regular)
		.input('midterm_score', sql.Decimal(5, 2), midterm)
		.input('final_score', sql.Decimal(5, 2), finalScore)
		.input('classification', sql.NVarChar(20), classification)
		.input('program_id', sql.VarChar(20), data.program_id || null)
		.input('note', sql.NVarChar(255), data.note || null)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_grade_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      INSERT INTO grades (id, enrollment_id, subject_id, score, result, regular_score, midterm_score, final_score, classification, program_id, note, created_by)
      VALUES (@new_id, @enrollment_id, @subject_id, @score, @result, @regular_score, @midterm_score, @final_score, @classification, @program_id, @note, @actor_id);
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'grade' });
	return { id: result_.recordset[0].id };
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
const issueCertificate = async (enrollmentId, actorId, expiryDate) => {
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
		.input('expiry_date', sql.Date, expiryDate || null)
		.query(`
      IF EXISTS (SELECT 1 FROM certificates WHERE enrollment_id = @enrollment_id)
      BEGIN
        THROW 51001, N'Học viên này đã được cấp chứng chỉ cho khóa học này rồi.', 1;
      END
      DECLARE @cert_no VARCHAR(30);
      EXEC sp_gen_certificate_no @year = @year, @actor_id = @actor_id, @new_no = @cert_no OUTPUT;
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_certificate_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      INSERT INTO certificates (id, enrollment_id, cert_no, expiry_date, created_by)
      VALUES (@new_id, @enrollment_id, @cert_no, @expiry_date, @actor_id);
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

// Xoá cứng — chỉ dùng khi cấp nhầm (không giữ lịch sử). Muốn hủy giá trị
// pháp lý của chứng chỉ đã cấp đúng, dùng revokeCertificate (thu hồi mềm).
const removeCertificate = async (certId) => {
	const pool = await getPool();
	await pool.request().input('id', sql.VarChar(20), certId).query('DELETE FROM certificates WHERE id = @id');
	broadcast('update', { entity: 'certificate' });
};

// Thu hồi mềm — giữ lại dòng dữ liệu (khác removeCertificate xoá cứng).
const revokeCertificate = async (certId, reason, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), certId)
		.input('reason', sql.NVarChar(255), reason || null)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`
      UPDATE certificates
      SET status = 'revoked', revoked_at = GETDATE(), revoked_by = @actor_id, revoke_reason = @reason,
          updated_at = GETDATE(), updated_by = @actor_id
      WHERE id = @id AND status <> 'revoked';
      SELECT @@ROWCOUNT AS affected;
    `);
	if (!result.recordset[0]?.affected) {
		const err = new Error('Không tìm thấy chứng chỉ hoặc chứng chỉ đã bị thu hồi trước đó.');
		err.statusCode = 404;
		throw err;
	}
	broadcast('update', { entity: 'certificate' });
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	remove,
	isEnrollmentOpenRow,
	computeDisplayStatus,
	listProgramLinks,
	addProgramLink,
	assertCourseInScope,
	assertCourseChildInScope,
	CHILD_COURSE_SQL,
	updateProgramLink,
	removeProgramLink,
	listEnrollments,
	registerTrainee,
	listStaffCandidates,
	registerStaff,
	decideEnrollment,
	bulkDecideEnrollments,
	removeEnrollment,
	listAssignments,
	assignLecturer,
	removeAssignment,
	listSessions,
	listSessionsInRange,
	createSession,
	createSessionsBulk,
	updateSession,
	removeSession,
	listAttendance,
	setAttendance,
	bulkSetAttendance,
	generateAttendanceQrToken,
	checkInSelf,
	listDocuments,
	addDocument,
	incrementDocumentDownload,
	removeDocument,
	listGrades,
	upsertGrade,
	removeGrade,
	listCertificates,
	issueCertificate,
	removeCertificate,
	revokeCertificate,
};
