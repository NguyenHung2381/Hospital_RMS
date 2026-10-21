const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const mailService = require('../../notifications/mailService');
const mailQueue = require('../../notifications/mailQueue');
const { ROLE, inputRoleId } = require('../../access/roleCodes');
const { getById } = require('./courseService');
const { httpError } = require('../../../utils/httpError');
const enrollmentProgramService = require('./enrollmentProgramService');
const practiceAutoService = require('./practiceAutoService');
const courseBatchService = require('./courseBatchService');
const programClassService = require('./programClassService');

// ─── Đăng ký khóa học ────────────────────────────────────────────────────
const listEnrollments = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT e.*, t.full_name AS trainee_name, t.phone AS trainee_phone, t.email AS trainee_email,
           u.full_name AS decided_by_name,
           tp.code AS program_code, tp.name AS program_name, mm.full_name AS main_mentor_name,
           (SELECT COUNT(*) FROM enrollment_lessons el WHERE el.enrollment_id = e.id) AS lesson_total,
           (SELECT COUNT(*) FROM enrollment_lessons el WHERE el.enrollment_id = e.id AND el.status = 'done') AS lesson_done,
           CASE WHEN e.status = 'waitlisted' THEN ${courseBatchService.WAITLIST_POSITION_SQL('e')} END AS waitlist_position
    FROM course_enrollments e
    JOIN trainees t ON t.id = e.trainee_id
    LEFT JOIN users u ON u.id = e.decided_by
    LEFT JOIN training_programs tp ON tp.id = e.program_id
    LEFT JOIN users mm ON mm.id = e.main_mentor_user_id
    WHERE e.course_id = @course_id
    ORDER BY e.registered_at DESC
  `);
	return r.recordset;
};

// Thêm học viên vào khóa học. Chặn nếu khóa học đang đóng cửa sổ đăng ký, trừ
// khi options.bypassWindow (admin / quản lý đào tạo ghi danh hộ — xem
// courseController.registerTrainee). options.programId: chương trình học viên
// chọn (phải thuộc khóa) — bài học lý thuyết của chương trình tự gắn theo.
const registerTrainee = async (
	courseId,
	traineeId,
	actorId,
	{ bypassWindow = false, programId = null } = {},
) => {
	const pool = await getPool();
	const course = await getById(courseId);
	if (!course) {
		throw httpError(404, 'Khóa học không tồn tại.');
	}
	if (!course.enrollment_open && !bypassWindow) {
		throw httpError(403, 'Khóa học hiện không trong thời gian đăng ký.');
	}
	// Khóa có chương trình ⇒ mỗi lượt ghi danh theo đúng 1 chương trình (khóa chỉ
	// có 1 thì tự chọn). Khóa chưa gán chương trình nào thì ghi danh trơn như cũ.
	if (!programId && course.program_ids.length === 1) programId = course.program_ids[0];
	if (!programId && course.program_ids.length)
		throw httpError(400, 'Vui lòng chọn chương trình học.');
	if (programId) await enrollmentProgramService.assertProgramInCourse(courseId, programId);

	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('course_id', sql.VarChar(20), courseId)
		.input('trainee_id', sql.VarChar(20), traineeId)
		.input('program_id', sql.VarChar(20), programId || null)
		.query(
			`
      -- Khóa tuyển sinh: người đã được chuyển sang 1 đợt của khóa cũng tính là đã đăng ký.
      IF EXISTS (SELECT 1 FROM course_enrollments WHERE trainee_id = @trainee_id
                 AND (course_id = @course_id OR course_id IN (SELECT id FROM courses WHERE parent_course_id = @course_id))
                 AND ISNULL(program_id, '') = ISNULL(@program_id, ''))
      BEGIN
        THROW 51000, N'Học viên này đã đăng ký khóa học rồi.', 1;
      END
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_course_enrollment_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      INSERT INTO course_enrollments (id, course_id, trainee_id, program_id, status, created_by)
      VALUES (@new_id, @course_id, @trainee_id, @program_id, 'pending', @actor_id);
      SELECT @new_id AS id;
    `,
		)
		.catch((err) => {
			if (err.number === 51000) {
				throw httpError(
					409,
					programId
						? 'Học viên này đã ghi danh chương trình này trong khóa rồi.'
						: 'Học viên này đã đăng ký khóa học rồi.',
				);
			}
			throw err;
		});
	const id = result.recordset[0].id;
	if (programId) await enrollmentProgramService.syncLessons(id);
	broadcast('update', { entity: 'course_enrollment' });
	return { id };
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
const registerStaff = async (
	courseId,
	userId,
	actorId,
	{ bypassWindow = false, programId = null } = {},
) => {
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

	return registerTrainee(courseId, traineeId, actorId, { bypassWindow, programId });
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

	const course = await getById(row.course_id);
	let finalStatus = decision;
	if (decision === 'approved') {
		// Khóa tuyển sinh: duyệt = vào danh sách chờ đợt; rebalance bên dưới xếp vào đợt
		// còn chỗ hoặc lập đợt mới khi đủ sĩ số.
		if (course?.auto_batch) finalStatus = 'waitlisted';
		else if (programClassService.appliesTo(course) && row.program_id) {
			// Khóa ĐTLT thường: sĩ số tính theo lớp (chương trình) — lớp đầy thì lưu cho khóa sau.
			// Hồ sơ đã duyệt (đang chiếm chỗ) thì giữ nguyên.
			if (row.status !== 'approved')
				finalStatus = (await programClassService.statusOnApprove(course, row.program_id)) ?? decision;
		} else if (course?.capacity != null && course.approved_count >= course.capacity) {
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

	// Đổi trạng thái ở khóa tuyển sinh / đợt ⇒ xếp lại người chờ (người được duyệt
	// vào đợt, hoặc đợt vừa có chỗ trống vì người khác bị từ chối).
	let batchName = null;
	let waitlistPosition = null;
	if (row.program_id && (course?.auto_batch || course?.parent_course_id)) {
		await courseBatchService.rebalance(course.auto_batch ? course.id : course.parent_course_id, row.program_id, actorId);
		const after = (
			await pool.request().input('id', sql.VarChar(20), enrollmentId).query(`
        SELECT e.status, c.name AS course_name,
               CASE WHEN e.status = 'waitlisted' THEN ${courseBatchService.WAITLIST_POSITION_SQL('e')} END AS waitlist_position
        FROM course_enrollments e JOIN courses c ON c.id = e.course_id WHERE e.id = @id`)
		).recordset[0];
		if (after && course.auto_batch && finalStatus === 'waitlisted') {
			finalStatus = after.status;
			if (after.status === 'approved') batchName = after.course_name;
			waitlistPosition = after.waitlist_position;
		}
	}
	if (row.program_id && programClassService.appliesTo(course)) {
		if (finalStatus === 'approved') await programClassService.notifyIfOpened(course, row.program_id);
		else if (row.status === 'approved') await programClassService.promote(course.id, row.program_id, actorId);
		if (finalStatus === 'waitlisted') {
			// Lớp đầy: đã có khóa ĐTLT sau còn chỗ thì chuyển hồ sơ sang luôn.
			await programClassService.forward(course.id, row.program_id, actorId);
			const after = (
				await pool.request().input('id', sql.VarChar(20), enrollmentId).query(`
          SELECT e.status, e.course_id, c.name AS course_name,
                 CASE WHEN e.status = 'waitlisted' THEN ${courseBatchService.WAITLIST_POSITION_SQL('e')} END AS waitlist_position
          FROM course_enrollments e JOIN courses c ON c.id = e.course_id WHERE e.id = @id`)
			).recordset[0];
			if (after && after.course_id !== course.id) {
				finalStatus = after.status;
				batchName = after.course_name;
			} else waitlistPosition = after.waitlist_position;
		}
	}

	// Học viên là thực thể độc lập, KHÔNG bắt buộc có tài khoản đăng nhập ⇒
	// không thể dùng notificationService (yêu cầu user_id). Báo trực tiếp qua
	// email tới trainees.email nếu có.
	const trainee = await pool
		.request()
		.input('trainee_id', sql.VarChar(20), row.trainee_id)
		.query('SELECT full_name, email FROM trainees WHERE id = @trainee_id');
	const traineeEmail = trainee.recordset[0]?.email;
	// Được xếp vào đợt thì courseBatchService đã gửi thư riêng.
	if (traineeEmail && !batchName) {
		const title =
			finalStatus === 'approved'
				? 'Đăng ký khóa học đã được duyệt'
				: finalStatus === 'waitlisted'
					? course?.auto_batch
						? `Đăng ký đã được duyệt — bạn ở vị trí thứ ${waitlistPosition ?? '?'} trong danh sách chờ đợt học tiếp theo`
						: programClassService.appliesTo(course)
							? `Lớp đã đủ người — hồ sơ của bạn được lưu cho khóa sau (vị trí ${waitlistPosition ?? '?'})`
							: 'Đăng ký khóa học đang chờ (danh sách chờ)'
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

	// Duyệt vào khóa GPHN ⇒ tự xếp vòng / khoa / NHD
	const auto =
		finalStatus === 'approved'
			? await practiceAutoService.arrangeIfPractice(enrollmentId, actorId)
			: {};
	broadcast('update', { entity: 'course_enrollment' });
	return {
		id: enrollmentId,
		status: finalStatus,
		batch_name: batchName,
		waitlist_position: waitlistPosition,
		auto_warning: auto.warning ?? null,
	};
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
const removeEnrollment = async (enrollmentId, actorId = null) => {
	const pool = await getPool();
	const r = await pool.request().input('id', sql.VarChar(20), enrollmentId).query(`
    SELECT e.program_id, e.course_id, e.status, c.parent_course_id, c.training_type_id, c.auto_batch, c.is_rolling
    FROM course_enrollments e JOIN courses c ON c.id = e.course_id WHERE e.id = @id;
    DELETE FROM attendance WHERE enrollment_id = @id;
    DELETE FROM course_enrollments WHERE id = @id;
  `);
	broadcast('update', { entity: 'course_enrollment' });
	// Rút khỏi đợt chưa khai giảng ⇒ người đầu danh sách chờ được gọi vào.
	const gone = r.recordsets[0][0];
	if (gone?.parent_course_id) await courseBatchService.rebalance(gone.parent_course_id, gone.program_id, actorId);
	// Rút khỏi lớp ĐTLT chưa khai giảng ⇒ người đầu danh sách chờ của khóa được gọi vào.
	else if (gone?.status === 'approved' && gone.program_id && programClassService.appliesTo(gone))
		await programClassService.promote(gone.course_id, gone.program_id, actorId);
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
