const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const mailService = require('../../notifications/mailService');
const mailQueue = require('../../notifications/mailQueue');
const { ROLE, inputRoleId } = require('../../access/roleCodes');
const { getById } = require('./courseService');
const { httpError } = require('../../../utils/httpError');

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
		throw httpError(404, 'Khóa học không tồn tại.');
	}
	if (!course.enrollment_open && !bypassWindow) {
		throw httpError(403, 'Khóa học hiện không trong thời gian đăng ký.');
	}

	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('course_id', sql.VarChar(20), courseId)
		.input('trainee_id', sql.VarChar(20), traineeId)
		.query(
			`
      IF EXISTS (SELECT 1 FROM course_enrollments WHERE course_id = @course_id AND trainee_id = @trainee_id)
      BEGIN
        THROW 51000, N'Học viên này đã đăng ký khóa học rồi.', 1;
      END
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_course_enrollment_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      INSERT INTO course_enrollments (id, course_id, trainee_id, status, created_by)
      VALUES (@new_id, @course_id, @trainee_id, 'pending', @actor_id);
      SELECT @new_id AS id;
    `,
		)
		.catch((err) => {
			if (err.number === 51000) {
				throw httpError(409, 'Học viên này đã đăng ký khóa học rồi.');
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
	const result = await (
		await inputRoleId(pool.request(), 'trainee_role', ROLE.TRAINEE)
	).query(`
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
		throw httpError(404, 'Khóa học không tồn tại.');
	}
	if (!course.enrollment_open && !bypassWindow) {
		throw httpError(403, 'Khóa học hiện không trong thời gian đăng ký.');
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
			.query(
				'SELECT id, full_name, email, department_id FROM users WHERE id = @uid AND is_active = 1',
			);
		const user = userRes.recordset[0];
		if (!user) {
			throw httpError(404, 'Nhân viên không tồn tại hoặc đã bị khoá.');
		}
		// require muộn — traineeService kéo theo topicMemberService/personService, tránh vòng require.
		const traineeService = require('../trainees/traineeService');
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
			.input('uid', sql.VarChar(20), userId).query(`
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
		throw httpError(404, 'Không tìm thấy đăng ký.');
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
		.input('note', sql.NVarChar(500), note || null).query(`
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
		// Không chờ SMTP: duyệt hàng loạt N đăng ký từng phải chờ N lần gửi mail
		// nối tiếp ngay trong request.
		const fullName = trainee.recordset[0].full_name;
		mailQueue.enqueue('đăng ký khóa học', () =>
			mailService.send({
				event: 'COURSE_ENROLLMENT',
				to: traineeEmail,
				subject: title,
				html: mailService.renderNotificationEmail({
					fullName,
					title,
					message: note || null,
				}),
			}),
		);
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

module.exports = {
	listEnrollments,
	registerTrainee,
	listStaffCandidates,
	registerStaff,
	decideEnrollment,
	bulkDecideEnrollments,
	removeEnrollment,
};
