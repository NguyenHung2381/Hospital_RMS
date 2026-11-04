/**
 * courseCmeService.js — tự cộng tín chỉ CME từ khóa ĐTLT / CTCV
 * (docs/ke-hoach-thiet-ke-lai-luong-dao-tao.md GĐ5, quyết định 14; migration
 * 2026-12-06_cme_tu_khoa_hoc). Ghi vào cme_records, trạng thái đã duyệt, có nguồn
 * (source_type, source_id = khóa, user_id) — khóa duy nhất ⇒ chạy lại thì cập nhật.
 *   - Học viên nội viện có tài khoản (trainees.staff_user_id) được cấp giấy chứng
 *     nhận: tín chỉ = số giờ tín chỉ của chương trình, chưa khai thì số tiết LT + TH
 *     × hệ số danh mục DT_KHOAHOC. Thu hồi giấy ⇒ dòng CME bị từ chối; xóa giấy
 *     (cấp nhầm) ⇒ xóa dòng CME.
 *   - Giảng viên có tài khoản, khi khóa điểm: số tiết đảm nhận × hệ số GIANGDAY.
 *     Số tiết = lecturer_assignments.hours; GV chính của 1 bài chưa nhập số tiết
 *     thì lấy số tiết của bài.
 * Công tắc CME_AUTO_TRAINEE / CME_AUTO_LECTURER (mặc định bật). Thu hồi / xóa
 * luôn chạy (kể cả công tắc tắt) để CME không còn tính cho giấy đã hủy.
 */
const {
	getPool,
	sql,
	withTransaction,
	newIdSql,
	nowSql,
	datePart,
	upsert,
} = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const systemSettingService = require('../../settings/systemSettingService');
const { CLASS_TYPES } = require('./classTypes');

const SOURCE = { trainee: 'course_trainee', lecturer: 'course_lecturer' };
const TYPES_SQL = CLASS_TYPES.map((t) => `'${t}'`).join(', ');

const isOn = async (key) => (await systemSettingService.getValue(key, 'true')) !== 'false';

// Ghi / cập nhật các dòng CME của khóa @course_id theo câu SELECT `source` (user_id, title,
// role, category_id, quantity, credits, activity_date, note) — khóa duy nhất
// (source_type, source_id, user_id). Số dòng ghi = rowsAffected[0].
const SAME_AS_INSERT = [
	'title',
	'role',
	'category_id',
	'quantity',
	'credits',
	'activity_date',
	'year',
	'note',
];
const upsertCmeSql = (sourceType, source) =>
	upsert({
		table: 'cme_records',
		key: ['source_type', 'source_id', 'user_id'],
		conflictWhere: 'source_type IS NOT NULL',
		source,
		values: {
			id: newIdSql('CM', 18),
			user_id: 'src.user_id',
			category_id: 'src.category_id',
			title: 'src.title',
			activity_date: 'src.activity_date',
			year: datePart('YEAR', 'src.activity_date'),
			role: 'src.role',
			quantity: 'src.quantity',
			credits: 'src.credits',
			note: 'src.note',
			approval_status: "'approved'",
			reviewed_by: '@actor_id',
			reviewed_at: nowSql,
			source_type: `'${sourceType}'`,
			source_id: '@course_id',
			created_by: '@actor_id',
		},
		update: {
			...Object.fromEntries(SAME_AS_INSERT.map((c) => [c, `EXCLUDED.${c}`])),
			approval_status: "'approved'",
			reject_reason: 'NULL',
			updated_at: nowSql,
			updated_by: '@actor_id',
		},
	});

const conversionOf = (categoryId) =>
	`COALESCE((SELECT conversion_value FROM cme_credit_categories WHERE id = '${categoryId}'), 1)`;

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
		.input('actor_id', sql.VarChar(20), actorId)
		.query(upsertCmeSql(SOURCE.trainee, TRAINEE_SOURCE));
	const n = r.rowsAffected[0] ?? 0;
	if (n) broadcast('update', { entity: 'cme_record' });
	return n;
};

// Giấy chứng nhận còn hiệu lực của khóa (@enrollment_id NULL = mọi hồ sơ), có tín chỉ > 0
const TRAINEE_SOURCE = `
    SELECT x.* FROM (
      SELECT t.staff_user_id AS user_id,
             LEFT(CONCAT(c.name, CASE WHEN tp.name IS NOT NULL THEN CONCAT(' — ', tp.name) END), 255) AS title,
             N'Học viên' AS role,
             'DT_KHOAHOC' AS category_id,
             CAST(COALESCE(tp.theory_hours, 0) + COALESCE(tp.practice_hours, 0) AS DECIMAL(8, 2)) AS quantity,
             CAST(COALESCE(tp.credit_hours,
                           (COALESCE(tp.theory_hours, 0) + COALESCE(tp.practice_hours, 0)) * ${conversionOf('DT_KHOAHOC')})
                  AS DECIMAL(6, 2)) AS credits,
             COALESCE(c.end_date, cert.issue_date) AS activity_date,
             CONCAT(N'Giấy chứng nhận số ', cert.cert_no) AS note
      FROM certificates cert
      JOIN course_enrollments e ON e.id = cert.enrollment_id
      JOIN courses c ON c.id = e.course_id
      JOIN trainees t ON t.id = e.trainee_id
      -- Khóa chỉ 1 chương trình ⇒ lượt ghi danh chưa chọn chương trình lấy chương trình đó
      LEFT JOIN training_programs tp ON tp.id = COALESCE(e.program_id,
        (SELECT CASE WHEN COUNT(*) = 1 THEN MIN(program_id) END FROM course_programs WHERE course_id = @course_id))
      WHERE e.course_id = @course_id AND (@enrollment_id IS NULL OR e.id = @enrollment_id)
        AND cert.status <> 'revoked' AND t.staff_user_id IS NOT NULL
        AND c.training_type_id IN (${TYPES_SQL})
    ) x WHERE x.credits > 0`;

/** Giấy chứng nhận bị thu hồi (remove=false) hoặc xóa vì cấp nhầm (remove=true). */
const withdrawForCertificate = async (certId, actorId, { remove = false, reason = null } = {}) => {
	const pool = await getPool();
	const owner = (
		await pool.request().input('cert_id', sql.VarChar(20), certId).query(`
      SELECT e.course_id, t.staff_user_id AS user_id
      FROM certificates cert
      JOIN course_enrollments e ON e.id = cert.enrollment_id
      JOIN trainees t ON t.id = e.trainee_id
      WHERE cert.id = @cert_id`)
	).recordset[0];
	if (!owner?.user_id) return 0;
	const r = await pool
		.request()
		.input('course_id', sql.VarChar(20), owner.course_id)
		.input('user_id', sql.VarChar(20), owner.user_id)
		.input('actor_id', sql.VarChar(20), actorId)
		.input(
			'reason',
			sql.NVarChar(500),
			reason ? `Thu hồi giấy chứng nhận: ${reason}` : 'Thu hồi giấy chứng nhận',
		)
		.query(
			remove
				? `DELETE FROM cme_records WHERE source_type = '${SOURCE.trainee}' AND source_id = @course_id AND user_id = @user_id`
				: `UPDATE cme_records SET approval_status = 'rejected', reject_reason = @reason,
                 reviewed_by = @actor_id, reviewed_at = ${nowSql}, updated_at = ${nowSql}, updated_by = @actor_id
         WHERE source_type = '${SOURCE.trainee}' AND source_id = @course_id AND user_id = @user_id`,
		);
	const n = r.rowsAffected[0] ?? 0;
	if (n) broadcast('update', { entity: 'cme_record' });
	return n;
};

/**
 * Giảng viên: ghi CME theo số tiết đảm nhận (gọi khi khóa điểm). GV không còn
 * phân công (hoặc còn 0 tiết) thì xóa dòng tự động cũ của khóa.
 */
const syncLecturers = async (courseId, actorId) => {
	if (!(await isOn('CME_AUTO_LECTURER'))) return 0;
	// Xóa dòng của GV không còn trong danh sách rồi ghi / cập nhật, trong 1 transaction
	const n = await withTransaction(async (tx) => {
		const req = () =>
			new sql.Request(tx)
				.input('course_id', sql.VarChar(20), courseId)
				.input('actor_id', sql.VarChar(20), actorId);
		await req().query(`
      DELETE FROM cme_records
      WHERE source_type = '${SOURCE.lecturer}' AND source_id = @course_id
        AND NOT EXISTS (SELECT 1 FROM (${LECTURER_SOURCE}) s WHERE s.user_id = cme_records.user_id)`);
		const r = await req().query(upsertCmeSql(SOURCE.lecturer, LECTURER_SOURCE));
		return r.rowsAffected[0] ?? 0;
	});
	if (n) broadcast('update', { entity: 'cme_record' });
	return n;
};

// Số tiết của từng GV có tài khoản trong khóa @course_id (> 0)
const LECTURER_SOURCE = `
    SELECT h.user_id,
           LEFT(CONCAT(N'Giảng dạy: ', c.name), 255) AS title,
           N'Giảng viên' AS role,
           'GIANGDAY' AS category_id,
           CAST(h.hours AS DECIMAL(8, 2)) AS quantity,
           CAST(h.hours * ${conversionOf('GIANGDAY')} AS DECIMAL(6, 2)) AS credits,
           COALESCE(c.end_date, CAST(${nowSql} AS DATE)) AS activity_date,
           CONCAT(N'Tự động khi khóa điểm — ', h.hours, N' tiết') AS note
    FROM (
      SELECT lec.user_id,
             SUM(COALESCE(la.hours,
                          CASE WHEN la.role = 'main' AND pl.id IS NOT NULL
                               THEN COALESCE(pl.theory_hours, 0) + COALESCE(pl.practice_hours, 0) END,
                          0)) AS hours
      FROM lecturer_assignments la
      JOIN lecturers lec ON lec.id = la.lecturer_id
      JOIN courses c ON c.id = la.course_id
      LEFT JOIN program_lessons pl ON pl.id = la.subject_id
      WHERE la.course_id = @course_id AND lec.user_id IS NOT NULL AND c.training_type_id IN (${TYPES_SQL})
      GROUP BY lec.user_id
    ) h JOIN courses c ON c.id = @course_id
    WHERE h.hours > 0`;

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
