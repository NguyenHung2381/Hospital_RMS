const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const mailService = require('../../notifications/mailService');
const mailQueue = require('../../notifications/mailQueue');
const notificationService = require('../../notifications/notificationService');
const { httpError } = require('../../../utils/httpError');
const logger = require('../../../config/logger');

// Khóa ĐTLT thường ("ĐTLT Đợt 3/2026" — không phải khóa tuyển sinh theo đợt, không
// phải đợt con, xem courseBatchService): mỗi chương trình của khóa là 1 LỚP.
//   - Sĩ số tối thiểu (training_programs.min_capacity): chưa đủ học viên đã duyệt
//     thì lớp CHƯA MỞ — không xếp được lịch học cho bài của chương trình đó.
//   - Sĩ số tối đa (max_capacity, không đặt thì capacity của khóa): lớp đầy thì
//     duyệt thêm = vào danh sách chờ ('waitlisted'), tức LƯU HỒ SƠ CHO KHÓA SAU —
//     khóa ĐTLT kế tiếp (chưa khai giảng) có chương trình đó tự nhận hồ sơ chờ.
//     Lớp chưa khai giảng có người rút thì người đầu danh sách chờ được gọi vào.
//   - Khóa đã khai giảng mà lớp vẫn chưa đủ tối thiểu (lớp không mở được): hồ sơ
//     đã duyệt cũng được chuyển sang khóa sau như hồ sơ chờ.
const DTLT_TYPE = 'TRNTP-DTLT';
const VN_TODAY = 'CAST(DATEADD(HOUR, 7, GETUTCDATE()) AS DATE)';

const appliesTo = (c) =>
	!!c && c.training_type_id === DTLT_TYPE && !c.auto_batch && !c.parent_course_id && !c.is_rolling;
const APPLIES_SQL = (c) =>
	`(${c}.training_type_id = '${DTLT_TYPE}' AND ${c}.auto_batch = 0 AND ${c}.parent_course_id IS NULL AND ${c}.is_rolling = 0)`;
const NOT_STARTED_SQL = (c) => `(${c}.start_date IS NULL OR ${c}.start_date > ${VN_TODAY})`;
const countSql = (c, p, status) =>
	`(SELECT COUNT(*) FROM course_enrollments ce WHERE ce.course_id = ${c}.id AND ce.program_id = ${p} AND ce.status = '${status}')`;

// Sĩ số từng lớp (chương trình) của khóa — dùng cho tab Học viên lẫn các kiểm tra bên dưới.
const CLASS_COLUMNS = `ISNULL(tp.min_capacity, 1) AS class_min,
       COALESCE(tp.max_capacity, c.capacity) AS class_max,
       ${countSql('c', 'cp.program_id', 'approved')} AS class_approved,
       ${countSql('c', 'cp.program_id', 'waitlisted')} AS class_waiting,
       CASE WHEN ${APPLIES_SQL('c')} THEN 1 ELSE 0 END AS class_rule`;

const classesOf = async (courseId, q = null) => {
	const req = q ? q() : (await getPool()).request();
	const r = await req.input('course_id', sql.VarChar(20), courseId).query(`
    SELECT cp.program_id, tp.code AS program_code, tp.name AS program_name, c.name AS course_name,
           c.capacity AS course_capacity, c.created_by,
           CASE WHEN ${NOT_STARTED_SQL('c')} THEN 0 ELSE 1 END AS started,
           (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id AND e.status = 'approved') AS course_approved,
           ${CLASS_COLUMNS}
    FROM courses c
    JOIN course_programs cp ON cp.course_id = c.id
    JOIN training_programs tp ON tp.id = cp.program_id
    WHERE c.id = @course_id AND c.status <> 'cancelled'`);
	return r.recordset;
};

// Chỗ còn trống của lớp: theo sĩ số tối đa của chương trình và của cả khóa (null = không giới hạn).
const roomOf = (k) => {
	const rooms = [
		k.class_max == null ? null : k.class_max - k.class_approved,
		k.course_capacity == null ? null : k.course_capacity - k.course_approved,
	].filter((v) => v != null);
	return rooms.length ? Math.max(0, Math.min(...rooms)) : Infinity;
};

const mailTrainees = async (enrollmentIds, title, message) => {
	if (!enrollmentIds.length) return;
	const pool = await getPool();
	const rows = (
		await pool.request().input('ids', sql.NVarChar(sql.MAX), JSON.stringify(enrollmentIds)).query(`
      SELECT t.full_name, t.email, c.name AS course_name
      FROM course_enrollments e JOIN trainees t ON t.id = e.trainee_id JOIN courses c ON c.id = e.course_id
      WHERE e.id IN (SELECT [value] FROM OPENJSON(@ids)) AND t.email IS NOT NULL AND t.email <> ''`)
	).recordset;
	for (const r of rows) {
		const subject = title(r.course_name);
		mailQueue.enqueue('lớp ĐTLT', () =>
			mailService.send({
				event: 'COURSE_ENROLLMENT',
				to: r.email,
				subject,
				html: mailService.renderNotificationEmail({ fullName: r.full_name, title: subject, message }),
			}),
		);
	}
};

/**
 * Trạng thái khi duyệt 1 hồ sơ vào khóa ĐTLT thường: lớp (chương trình) hoặc khóa
 * đã đầy ⇒ 'waitlisted' (lưu cho khóa sau). Khóa không áp dụng ⇒ null (giữ cách cũ).
 */
const statusOnApprove = async (course, programId) => {
	if (!appliesTo(course) || !programId) return null;
	const k = (await classesOf(course.id)).find((x) => x.program_id === programId);
	if (!k) return null;
	return roomOf(k) > 0 ? 'approved' : 'waitlisted';
};

/** Vừa duyệt ⇒ lớp vừa chạm sĩ số tối thiểu thì báo cán bộ tạo khóa: lớp đã mở, xếp lịch được. */
const notifyIfOpened = async (course, programId) => {
	if (!appliesTo(course) || !programId) return;
	const k = (await classesOf(course.id)).find((x) => x.program_id === programId);
	if (!k || k.class_approved !== k.class_min || !k.created_by) return;
	await notificationService.push('course_class', `Đủ sĩ số mở lớp ${k.program_code ?? k.program_name}`, [k.created_by], {
		message: `${k.course_name}: chương trình ${k.program_name} đã đủ ${k.class_min} học viên — có thể xếp lịch học.`,
		refId: course.id,
		refType: 'course',
	});
};

/**
 * Lớp chưa khai giảng còn chỗ ⇒ gọi người đầu danh sách chờ của chính khóa vào
 * (có người rút / bị từ chối / tăng sĩ số).
 */
const promote = async (courseId, programId, actorId) => {
	const k = (await classesOf(courseId)).find((x) => x.program_id === programId);
	if (!k || !k.class_rule || k.started || !k.class_waiting) return [];
	const room = roomOf(k);
	if (!room) return [];
	const pool = await getPool();
	const r = await pool
		.request()
		.input('course_id', sql.VarChar(20), courseId)
		.input('program_id', sql.VarChar(20), programId)
		.input('room', sql.Int, Number.isFinite(room) ? room : k.class_waiting)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      ;WITH q AS (
        SELECT TOP (@room) * FROM course_enrollments
        WHERE course_id = @course_id AND program_id = @program_id AND status = 'waitlisted'
        ORDER BY decided_at, registered_at, id)
      UPDATE q SET status = 'approved', updated_at = GETDATE(), updated_by = @actor_id
      OUTPUT inserted.id`);
	const ids = r.recordset.map((x) => x.id);
	if (ids.length) {
		broadcast('update', { entity: 'course_enrollment' });
		await mailTrainees(ids, (name) => `Bạn đã được nhận vào ${name}`, 'Lớp đã có chỗ — bạn được chuyển từ danh sách chờ vào lớp.').catch(
			(err) => logger.error('[course-class] mail failed:', err.message),
		);
	}
	return ids;
};

/**
 * Khóa sau nhận hồ sơ: khóa ĐTLT thường chưa khai giảng kéo về các hồ sơ cùng
 * chương trình ở khóa ĐTLT trước (khai giảng sớm hơn / tạo trước) — hồ sơ đang chờ,
 * và hồ sơ đã duyệt ở lớp không mở được (khóa đã khai giảng mà chưa đủ tối thiểu,
 * chưa điểm danh buổi nào). Ai chờ trước vào trước, chỉ chuyển đủ số chỗ còn trống.
 * programId: chỉ xét 1 chương trình.
 */
const carryOver = async (courseId, actorId, { programId = null } = {}) => {
	const pool = await getPool();
	const tx = new sql.Transaction(pool);
	await tx.begin();
	const q = () => new sql.Request(tx);
	const moved = [];
	try {
		// 1 khoá chung: 2 khóa cùng kéo 1 hồ sơ thì chỉ 1 khóa nhận.
		await q().query(
			"EXEC sp_getapplock @Resource = 'dtlt-carry-over', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000",
		);
		const classes = (await classesOf(courseId, q)).filter(
			(k) => k.class_rule && !k.started && (!programId || k.program_id === programId),
		);
		let courseApproved = classes[0]?.course_approved ?? 0;
		for (const k of classes) {
			const room = roomOf({ ...k, course_approved: courseApproved });
			if (!room) continue;
			const r = await q()
				.input('course_id', sql.VarChar(20), courseId)
				.input('program_id', sql.VarChar(20), k.program_id)
				.input('room', sql.Int, Number.isFinite(room) ? room : 100000)
				.input('actor_id', sql.VarChar(20), actorId).query(`
          DECLARE @t_start DATE, @t_created DATETIME;
          SELECT @t_start = start_date, @t_created = created_at FROM courses WHERE id = @course_id;
          DECLARE @picked TABLE (id VARCHAR(20));
          INSERT INTO @picked (id)
          SELECT TOP (@room) e.id
          FROM course_enrollments e
          JOIN courses c ON c.id = e.course_id
          JOIN training_programs tp ON tp.id = e.program_id
          WHERE e.program_id = @program_id AND e.course_id <> @course_id
            AND ${APPLIES_SQL('c')} AND c.status <> 'cancelled'
            AND CASE WHEN c.start_date IS NOT NULL AND @t_start IS NOT NULL
                     THEN CASE WHEN c.start_date < @t_start THEN 1 ELSE 0 END
                     ELSE CASE WHEN c.created_at < @t_created THEN 1 ELSE 0 END END = 1
            AND (e.status = 'waitlisted'
                 OR (e.status = 'approved' AND NOT ${NOT_STARTED_SQL('c')}
                     AND ${countSql('c', 'e.program_id', 'approved')} < ISNULL(tp.min_capacity, 1)
                     AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.enrollment_id = e.id)))
            AND NOT EXISTS (SELECT 1 FROM course_enrollments d
                            WHERE d.course_id = @course_id AND d.trainee_id = e.trainee_id AND d.program_id = @program_id)
          ORDER BY c.start_date, c.created_at, e.decided_at, e.registered_at, e.id;
          UPDATE course_enrollments
          SET course_id = @course_id, status = 'approved', updated_at = GETDATE(), updated_by = @actor_id
          WHERE id IN (SELECT id FROM @picked);
          SELECT id FROM @picked;`);
			const ids = r.recordset.map((x) => x.id);
			courseApproved += ids.length;
			moved.push(...ids);
		}
		await tx.commit();
	} catch (err) {
		await tx.rollback().catch(() => {});
		throw err;
	}
	if (moved.length) {
		broadcast('update', { entity: 'course' });
		broadcast('update', { entity: 'course_enrollment' });
		await mailTrainees(
			moved,
			(name) => `Hồ sơ của bạn đã được chuyển sang ${name}`,
			'Lớp bạn đăng ký ở khóa trước đã đủ người hoặc chưa mở được — hồ sơ được giữ và chuyển sang khóa này.',
		).catch((err) => logger.error('[course-class] mail failed:', err.message));
	}
	return moved;
};

/**
 * Hồ sơ vừa vào danh sách chờ ở khóa sourceId ⇒ nếu đã có khóa ĐTLT sau (chưa
 * khai giảng, cùng chương trình) còn chỗ thì chuyển sang luôn.
 */
const forward = async (sourceId, programId, actorId) => {
	const pool = await getPool();
	const targets = (
		await pool.request().input('source_id', sql.VarChar(20), sourceId).input('program_id', sql.VarChar(20), programId)
			.query(`
      SELECT t.id FROM courses s
      JOIN courses t ON t.id <> s.id AND ${APPLIES_SQL('t')} AND t.status <> 'cancelled' AND ${NOT_STARTED_SQL('t')}
      JOIN course_programs cp ON cp.course_id = t.id AND cp.program_id = @program_id
      WHERE s.id = @source_id
        AND CASE WHEN s.start_date IS NOT NULL AND t.start_date IS NOT NULL
                 THEN CASE WHEN s.start_date < t.start_date THEN 1 ELSE 0 END
                 ELSE CASE WHEN s.created_at < t.created_at THEN 1 ELSE 0 END END = 1
      ORDER BY ISNULL(t.start_date, '9999-12-31'), t.created_at`)
	).recordset;
	const moved = [];
	for (const t of targets) moved.push(...(await carryOver(t.id, actorId, { programId })));
	return moved;
};

/** Sau khi tạo / sửa khóa: gọi người chờ vào lớp còn chỗ, rồi nhận hồ sơ từ khóa trước. */
const refreshCourse = async (course, actorId) => {
	if (!appliesTo(course) || course.status === 'cancelled') return;
	for (const programId of course.program_ids ?? []) await promote(course.id, programId, actorId);
	await carryOver(course.id, actorId);
};

/**
 * Chặn xếp lịch cho lớp chưa mở. Bài học (subjectId) thuộc nhiều chương trình của
 * khóa thì chỉ cần 1 lớp đã mở; không chọn bài thì cần ít nhất 1 lớp của khóa đã mở.
 */
const assertClassOpen = async (courseId, subjectId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('course_id', sql.VarChar(20), courseId)
		.input('subject_id', sql.VarChar(20), subjectId || null).query(`
      SELECT tp.code AS program_code, tp.name AS program_name, ${CLASS_COLUMNS},
             CASE WHEN EXISTS (SELECT 1 FROM lesson_programs lp
                               WHERE lp.lesson_id = @subject_id AND lp.program_id = cp.program_id) THEN 1 ELSE 0 END AS has_lesson
      FROM courses c
      JOIN course_programs cp ON cp.course_id = c.id
      JOIN training_programs tp ON tp.id = cp.program_id
      WHERE c.id = @course_id`);
	const all = r.recordset;
	if (!all.length || !all[0].class_rule) return;
	const relevant = all.some((k) => k.has_lesson) ? all.filter((k) => k.has_lesson) : all;
	if (relevant.some((k) => k.class_approved >= k.class_min)) return;
	const list = relevant
		.slice(0, 3)
		.map((k) => `${k.program_code ?? k.program_name} mới có ${k.class_approved}/${k.class_min}`)
		.join('; ');
	throw httpError(
		400,
		`Lớp chưa mở — chưa đủ sĩ số tối thiểu (${list}${relevant.length > 3 ? '; …' : ''}). Đủ học viên mới xếp lịch học được.`,
	);
};

module.exports = {
	appliesTo,
	CLASS_COLUMNS,
	roomOf,
	statusOnApprove,
	notifyIfOpened,
	promote,
	carryOver,
	forward,
	refreshCourse,
	assertClassOpen,
};
