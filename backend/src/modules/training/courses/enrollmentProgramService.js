/**
 * enrollmentProgramService.js — chương trình học viên chọn khi ghi danh và
 * những gì đi theo nó (xem 2026-11-10_enrollment_programs):
 *   - ĐTLT: bài học (lesson_kind 'theory') của chương trình được CHÉP sang
 *     enrollment_lessons để theo dõi tiến độ từng học viên; sửa chương trình
 *     sau này không làm đổi hồ sơ cũ (có nút đồng bộ lại).
 *   - GPHN: các trường đăng ký thực hành của sổ (mã thực hành 226.BS, lĩnh
 *     vực, hình thức hành nghề, thời gian, địa điểm, đơn vị cử đi, NHD chính,
 *     tiến độ). Vòng khoa + NHD từng vòng làm ở giai đoạn sau.
 */
const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { httpError } = require('../../../utils/httpError');

const PROGRESS = ['in_progress', 'completed', 'dropped'];
const LESSON_STATUS = ['not_started', 'in_progress', 'done'];

const ENROLLMENT_FIELDS = {
	practice_code: sql.NVarChar(30),
	professional_field: sql.NVarChar(200),
	practice_form: sql.NVarChar(300),
	start_date: sql.Date,
	end_date: sql.Date,
	total_duration: sql.NVarChar(50),
	practice_location: sql.NVarChar(500),
	sending_unit: sql.NVarChar(200),
	main_mentor_user_id: sql.VarChar(20),
	progress_status: sql.VarChar(15),
	progress_date: sql.Date,
	progress_reason: sql.NVarChar(500),
	note: sql.NVarChar(500),
};

// Chương trình phải là 1 chương trình áp dụng của khóa (course_programs).
const assertProgramInCourse = async (courseId, programId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('course_id', sql.VarChar(20), courseId)
		.input('program_id', sql.VarChar(20), programId)
		.query(
			'SELECT 1 AS ok FROM course_programs WHERE course_id = @course_id AND program_id = @program_id',
		);
	if (!r.recordset[0]) throw httpError(400, 'Chương trình không thuộc khóa học này.');
};

// Chép bài học lý thuyết của chương trình sang hồ sơ học viên. replace=true:
// bỏ bài không còn trong chương trình (giữ nguyên tiến độ bài còn lại).
const syncLessons = async (enrollmentId, { replace = false } = {}) => {
	const pool = await getPool();
	const r = await pool.request().input('id', sql.VarChar(20), enrollmentId).query(`
    DECLARE @program_id VARCHAR(20) = (SELECT program_id FROM course_enrollments WHERE id = @id);
    ${
			replace
				? `DELETE el FROM enrollment_lessons el
       WHERE el.enrollment_id = @id
         AND NOT EXISTS (SELECT 1 FROM lesson_programs lp WHERE lp.program_id = @program_id AND lp.lesson_id = el.lesson_id);`
				: ''
		}
    UPDATE el SET display_order = lp.display_order
    FROM enrollment_lessons el
    JOIN lesson_programs lp ON lp.lesson_id = el.lesson_id AND lp.program_id = @program_id
    WHERE el.enrollment_id = @id;
    INSERT INTO enrollment_lessons (enrollment_id, lesson_id, display_order)
    SELECT @id, lp.lesson_id, lp.display_order
    FROM lesson_programs lp
    JOIN program_lessons pl ON pl.id = lp.lesson_id
    WHERE lp.program_id = @program_id AND pl.lesson_kind = 'theory' AND pl.is_active = 1
      AND NOT EXISTS (SELECT 1 FROM enrollment_lessons el WHERE el.enrollment_id = @id AND el.lesson_id = lp.lesson_id);
    SELECT @@ROWCOUNT AS added;
  `);
	return { added: r.recordset[0]?.added ?? 0 };
};

const listLessons = async (enrollmentId) => {
	const pool = await getPool();
	const r = await pool.request().input('id', sql.VarChar(20), enrollmentId).query(`
    SELECT el.lesson_id, el.display_order, el.status, el.completed_at,
           pl.code, pl.title, pl.theory_hours, pl.practice_hours, pl.total_hours, pl.credits
    FROM enrollment_lessons el
    JOIN program_lessons pl ON pl.id = el.lesson_id
    WHERE el.enrollment_id = @id
    ORDER BY el.display_order, pl.title
  `);
	return r.recordset;
};

const updateLesson = async (enrollmentId, lessonId, { status }, actorId) => {
	if (!LESSON_STATUS.includes(status)) throw httpError(400, 'Trạng thái bài học không hợp lệ');
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.input('lesson_id', sql.VarChar(20), lessonId)
		.input('status', sql.VarChar(15), status)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      UPDATE enrollment_lessons
      SET status = @status,
          completed_at = CASE WHEN @status = 'done' THEN ISNULL(completed_at, CAST(GETDATE() AS DATE)) ELSE NULL END,
          updated_at = GETDATE(), updated_by = @actor_id
      WHERE enrollment_id = @id AND lesson_id = @lesson_id;
      SELECT @@ROWCOUNT AS n;
    `);
	if (!r.recordset[0]?.n) throw httpError(404, 'Không tìm thấy bài học của học viên.');
	broadcast('update', { entity: 'course_enrollment' });
};

// GPHN: điền lĩnh vực chuyên môn / hình thức hành nghề MẶC ĐỊNH của chương trình
// (danh mục, xem 2026-12-03_danh_muc_thuc_hanh_gphn) vào hồ sơ — chỉ ô còn trống.
const fillPracticeDefaults = async (enrollmentId) => {
	const pool = await getPool();
	await pool.request().input('id', sql.VarChar(20), enrollmentId).query(`
    UPDATE e
    SET professional_field = ISNULL(e.professional_field, pf.name),
        practice_form = ISNULL(e.practice_form, f.name)
    FROM course_enrollments e
    JOIN training_programs tp ON tp.id = e.program_id
    LEFT JOIN professional_fields pf ON pf.id = tp.professional_field_id
    LEFT JOIN practice_forms f ON f.id = tp.practice_form_id
    WHERE e.id = @id AND (pf.id IS NOT NULL OR f.id IS NOT NULL)
      AND (e.professional_field IS NULL OR e.practice_form IS NULL)`);
};

// Sửa thông tin 1 lượt ghi danh: đổi chương trình (chép lại bài học), trường
// thực hành GPHN, tiến độ. Chỉ ghi trường có trong data.
const updateEnrollment = async (enrollmentId, data, actorId) => {
	const pool = await getPool();
	const cur = (
		await pool
			.request()
			.input('id', sql.VarChar(20), enrollmentId)
			.query('SELECT id, course_id, program_id FROM course_enrollments WHERE id = @id')
	).recordset[0];
	if (!cur) throw httpError(404, 'Không tìm thấy đăng ký.');
	if (data.progress_status !== undefined && !PROGRESS.includes(data.progress_status))
		throw httpError(400, 'Tiến độ không hợp lệ');

	const programChanged =
		data.program_id !== undefined && (data.program_id || null) !== cur.program_id;
	if (programChanged && data.program_id)
		await assertProgramInCourse(cur.course_id, data.program_id);

	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.input('actor_id', sql.VarChar(20), actorId);
	if (programChanged) {
		sets.push('program_id = @program_id');
		req.input('program_id', sql.VarChar(20), data.program_id || null);
	}
	for (const [field, type] of Object.entries(ENROLLMENT_FIELDS)) {
		if (data[field] === undefined) continue;
		sets.push(`${field} = @${field}`);
		const v = data[field] === '' ? null : data[field];
		req.input(field, type, field === 'progress_status' ? v || 'in_progress' : v);
	}
	await req
		.query(`UPDATE course_enrollments SET ${sets.join(', ')} WHERE id = @id`)
		.catch((err) => {
			if (err.number === 2601 || err.number === 2627) {
				throw httpError(
					409,
					String(err.message).includes('practice_code')
						? 'Mã thực hành đã được dùng cho hồ sơ khác.'
						: 'Học viên đã ghi danh chương trình này trong khóa rồi.',
				);
			}
			throw err;
		});
	if (programChanged) await syncLessons(enrollmentId, { replace: true });
	if (programChanged && data.program_id) await fillPracticeDefaults(enrollmentId);
	broadcast('update', { entity: 'course_enrollment' });
};

module.exports = {
	assertProgramInCourse,
	syncLessons,
	fillPracticeDefaults,
	listLessons,
	updateLesson,
	updateEnrollment,
};
