/**
 * courseCmeService.js — tự cộng tín chỉ CME từ khóa ĐTLT / CTCV
 * (docs/ke-hoach-thiet-ke-lai-luong-dao-tao.md GĐ5, quyết định 14; migration
 * 2026-12-06_cme_tu_khoa_hoc). Ghi vào cme_records, trạng thái đã duyệt, có nguồn
 * (source_type, source_id = khóa, user_id) — khóa duy nhất ⇒ chạy lại thì cập nhật.
 *   - Học viên nội viện có tài khoản (trainees.staff_user_id) được cấp giấy chứng
 *     nhận: tín chỉ = số giờ tín chỉ của chương trình, chưa khai thì số tiết LT + TH
 *     × hệ số danh mục DT_KHOAHOC. Thu hồi giấy ⇒ dòng CME bị từ chối; xoá giấy
 *     (cấp nhầm) ⇒ xoá dòng CME.
 *   - Giảng viên có tài khoản, khi khóa điểm: số tiết đảm nhận × hệ số GIANGDAY.
 *     Số tiết = lecturer_assignments.hours; GV chính của 1 bài chưa nhập số tiết
 *     thì lấy số tiết của bài.
 * Công tắc CME_AUTO_TRAINEE / CME_AUTO_LECTURER (mặc định bật). Thu hồi / xoá
 * luôn chạy (kể cả công tắc tắt) để CME không còn tính cho giấy đã hủy.
 */
const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const systemSettingService = require('../../settings/systemSettingService');
const { CLASS_TYPES } = require('./classTypes');

const SOURCE = { trainee: 'course_trainee', lecturer: 'course_lecturer' };
const TYPES_SQL = CLASS_TYPES.map((t) => `'${t}'`).join(', ');

const isOn = async (key) => (await systemSettingService.getValue(key, 'true')) !== 'false';

// Ghi / cập nhật các dòng CME theo nguồn từ bảng tạm #cme (user_id, title, role,
// category_id, quantity, credits, activity_date, note). Trả số dòng ghi.
const UPSERT_SQL = (sourceType) => `
  MERGE cme_records WITH (HOLDLOCK) AS r
  USING #cme AS s
    ON r.source_type = '${sourceType}' AND r.source_id = @course_id AND r.user_id = s.user_id
  WHEN MATCHED THEN UPDATE SET
    title = s.title, role = s.role, category_id = s.category_id, quantity = s.quantity, credits = s.credits,
    activity_date = s.activity_date, year = YEAR(s.activity_date), note = s.note,
    approval_status = 'approved', reject_reason = NULL, updated_at = GETDATE(), updated_by = @actor_id
  WHEN NOT MATCHED THEN
    INSERT (id, user_id, category_id, title, activity_date, year, role, quantity, credits, note,
            approval_status, reviewed_by, reviewed_at, source_type, source_id, created_by)
    VALUES ('CM' + LEFT(REPLACE(NEWID(), '-', ''), 18), s.user_id, s.category_id, s.title, s.activity_date,
            YEAR(s.activity_date), s.role, s.quantity, s.credits, s.note,
            'approved', @actor_id, GETDATE(), '${sourceType}', @course_id, @actor_id);
  SELECT @@ROWCOUNT AS n;`;

const conversionOf = (categoryId) =>
	`ISNULL((SELECT conversion_value FROM cme_credit_categories WHERE id = '${categoryId}'), 1)`;

/**
 * Học viên: ghi CME cho giấy chứng nhận còn hiệu lực của khóa (enrollmentId: chỉ 1 hồ sơ).
 * Bỏ qua học viên ngoại viện / chưa có tài khoản, chương trình không có tín chỉ.
 */
const syncTrainees = async (courseId, actorId, { enrollmentId = null } = {}) => {
	if (!(await isOn('CME_AUTO_TRAINEE'))) return 0;
	const pool = await getPool();
	const r = await pool
		.request()
		.input('course_id', sql.VarChar(20), courseId)
		.input('enrollment_id', sql.VarChar(20), enrollmentId)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      DECLARE @only_program VARCHAR(20) = (
        SELECT CASE WHEN COUNT(*) = 1 THEN MIN(program_id) END FROM course_programs WHERE course_id = @course_id);
      SELECT t.staff_user_id AS user_id,
             LEFT(c.name + ISNULL(N' — ' + tp.name, N''), 255) AS title,
             CAST(N'Học viên' AS NVARCHAR(100)) AS role,
             'DT_KHOAHOC' AS category_id,
             CAST(ISNULL(tp.theory_hours, 0) + ISNULL(tp.practice_hours, 0) AS DECIMAL(8, 2)) AS quantity,
             CAST(COALESCE(tp.credit_hours,
                           (ISNULL(tp.theory_hours, 0) + ISNULL(tp.practice_hours, 0)) * ${conversionOf('DT_KHOAHOC')})
                  AS DECIMAL(6, 2)) AS credits,
             COALESCE(c.end_date, cert.issue_date) AS activity_date,
             CAST(N'Giấy chứng nhận số ' + cert.cert_no AS NVARCHAR(500)) AS note
      INTO #cme
      FROM certificates cert
      JOIN course_enrollments e ON e.id = cert.enrollment_id
      JOIN courses c ON c.id = e.course_id
      JOIN trainees t ON t.id = e.trainee_id
      LEFT JOIN training_programs tp ON tp.id = COALESCE(e.program_id, @only_program)
      WHERE e.course_id = @course_id AND (@enrollment_id IS NULL OR e.id = @enrollment_id)
        AND cert.status <> 'revoked' AND t.staff_user_id IS NOT NULL
        AND c.training_type_id IN (${TYPES_SQL});
      DELETE FROM #cme WHERE credits IS NULL OR credits <= 0;
      ${UPSERT_SQL(SOURCE.trainee)}`);
	const n = r.recordset[0]?.n ?? 0;
	if (n) broadcast('update', { entity: 'cme_record' });
	return n;
};

/** Giấy chứng nhận bị thu hồi (remove=false) hoặc xoá vì cấp nhầm (remove=true). */
const withdrawForCertificate = async (certId, actorId, { remove = false, reason = null } = {}) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('cert_id', sql.VarChar(20), certId)
		.input('actor_id', sql.VarChar(20), actorId)
		.input(
			'reason',
			sql.NVarChar(500),
			reason ? `Thu hồi giấy chứng nhận: ${reason}` : 'Thu hồi giấy chứng nhận',
		).query(`
      DECLARE @course_id VARCHAR(20), @user_id VARCHAR(20);
      SELECT @course_id = e.course_id, @user_id = t.staff_user_id
      FROM certificates cert
      JOIN course_enrollments e ON e.id = cert.enrollment_id
      JOIN trainees t ON t.id = e.trainee_id
      WHERE cert.id = @cert_id;
      ${
				remove
					? `DELETE FROM cme_records WHERE source_type = '${SOURCE.trainee}' AND source_id = @course_id AND user_id = @user_id;`
					: `UPDATE cme_records SET approval_status = 'rejected', reject_reason = @reason,
                 reviewed_by = @actor_id, reviewed_at = GETDATE(), updated_at = GETDATE(), updated_by = @actor_id
         WHERE source_type = '${SOURCE.trainee}' AND source_id = @course_id AND user_id = @user_id;`
			}
      SELECT @@ROWCOUNT AS n;`);
	const n = r.recordset[0]?.n ?? 0;
	if (n) broadcast('update', { entity: 'cme_record' });
	return n;
};

/**
 * Giảng viên: ghi CME theo số tiết đảm nhận (gọi khi khóa điểm). GV không còn
 * phân công (hoặc còn 0 tiết) thì xoá dòng tự động cũ của khóa.
 */
const syncLecturers = async (courseId, actorId) => {
	if (!(await isOn('CME_AUTO_LECTURER'))) return 0;
	const pool = await getPool();
	const r = await pool
		.request()
		.input('course_id', sql.VarChar(20), courseId)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      SELECT lec.user_id,
             SUM(COALESCE(la.hours,
                          CASE WHEN la.role = 'main' AND pl.id IS NOT NULL
                               THEN ISNULL(pl.theory_hours, 0) + ISNULL(pl.practice_hours, 0) END,
                          0)) AS hours
      INTO #hours
      FROM lecturer_assignments la
      JOIN lecturers lec ON lec.id = la.lecturer_id
      JOIN courses c ON c.id = la.course_id
      LEFT JOIN program_lessons pl ON pl.id = la.subject_id
      WHERE la.course_id = @course_id AND lec.user_id IS NOT NULL AND c.training_type_id IN (${TYPES_SQL})
      GROUP BY lec.user_id;

      SELECT h.user_id,
             LEFT(N'Giảng dạy: ' + c.name, 255) AS title,
             CAST(N'Giảng viên' AS NVARCHAR(100)) AS role,
             'GIANGDAY' AS category_id,
             CAST(h.hours AS DECIMAL(8, 2)) AS quantity,
             CAST(h.hours * ${conversionOf('GIANGDAY')} AS DECIMAL(6, 2)) AS credits,
             COALESCE(c.end_date, CAST(GETDATE() AS DATE)) AS activity_date,
             CAST(CONCAT(N'Tự động khi khóa điểm — ', h.hours, N' tiết') AS NVARCHAR(500)) AS note
      INTO #cme
      FROM #hours h JOIN courses c ON c.id = @course_id
      WHERE h.hours > 0;

      DELETE r FROM cme_records r
      WHERE r.source_type = '${SOURCE.lecturer}' AND r.source_id = @course_id
        AND NOT EXISTS (SELECT 1 FROM #cme s WHERE s.user_id = r.user_id);
      ${UPSERT_SQL(SOURCE.lecturer)}`);
	const n = r.recordset[0]?.n ?? 0;
	if (n) broadcast('update', { entity: 'cme_record' });
	return n;
};

// Bảng điểm đã khóa hết (mọi hồ sơ đã duyệt có dòng điểm khóa) — giống gradebook.locked.
const gradesLocked = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN g.locked_at IS NOT NULL THEN 1 ELSE 0 END) AS locked
      FROM course_enrollments e
      LEFT JOIN grades g ON g.enrollment_id = e.id AND g.subject_id IS NULL
      WHERE e.course_id = @course_id AND e.status = 'approved'`);
	const { total, locked } = r.recordset[0];
	return total > 0 && locked === total;
};

/** Nút "Ghi lại CME" ở tab Kết quả: học viên theo giấy đã cấp, giảng viên khi điểm đã khóa. */
const syncCourse = async (courseId, actorId) => {
	const [traineeOn, lecturerOn, locked] = [
		await isOn('CME_AUTO_TRAINEE'),
		await isOn('CME_AUTO_LECTURER'),
		await gradesLocked(courseId),
	];
	return {
		trainees: traineeOn ? await syncTrainees(courseId, actorId) : null,
		lecturers: lecturerOn && locked ? await syncLecturers(courseId, actorId) : null,
		trainee_enabled: traineeOn,
		lecturer_enabled: lecturerOn,
		grades_locked: locked,
	};
};

module.exports = { SOURCE, syncTrainees, syncLecturers, syncCourse, withdrawForCertificate };
