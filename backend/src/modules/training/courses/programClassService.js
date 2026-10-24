const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const mailService = require('../../notifications/mailService');
const mailQueue = require('../../notifications/mailQueue');
const notificationService = require('../../notifications/notificationService');
const { httpError } = require('../../../utils/httpError');
const logger = require('../../../config/logger');
const systemSettingService = require('../../settings/systemSettingService');
const { suggestClassDates } = require('../../../utils/classDates');

// Khóa ĐTLT / CTCV: mỗi chương trình của khóa là 1 LỚP (dòng course_programs) —
// xem migration 2026-11-26_course_classes.
//   - Đủ sĩ số tối thiểu (training_programs.min_capacity) ⇒ BÁO cán bộ; cán bộ
//     bấm "Mở lớp" (course_programs.opened_at). Lớp chưa mở thì chưa xếp lịch.
//     Không có hạn đăng ký: lớp cứ chờ tới khi đủ.
//   - Sĩ số tối đa (max_capacity, không đặt = không giới hạn): lớp đầy thì
//     NỘI VIỆN (trainees.staff_user_id) duyệt thêm = vào DANH SÁCH CHỜ ĐỢT SAU
//     ('waitlisted'); NGOẠI VIỆN bị chặn "Lớp đã đủ sĩ số" (cả form đăng ký công khai).
//     Lớp có người rút ⇒ người chờ CỦA CHÍNH KHÓA được gọi vào. Không tự chuyển sang
//     khóa khác: đợt mới cùng chương trình gợi ý danh sách "Người chờ từ đợt trước",
//     cán bộ chọn rồi bấm chuyển (waitlistTransferService).
const { CLASS_TYPES } = require('./classTypes');
const VN_TODAY = 'CAST(DATEADD(HOUR, 7, GETUTCDATE()) AS DATE)';

const appliesTo = (c) => !!c && CLASS_TYPES.includes(c.training_type_id) && !c.is_rolling;
const APPLIES_SQL = (c) =>
	`(${c}.training_type_id IN (${CLASS_TYPES.map((t) => `'${t}'`).join(', ')}) AND ${c}.is_rolling = 0)`;
// Lớp đã khai giảng chưa: theo ngày của lớp, lớp chưa đặt ngày thì theo ngày khóa.
const NOT_STARTED_SQL = (cp, c) =>
	`(COALESCE(${cp}.start_date, ${c}.start_date) IS NULL OR COALESCE(${cp}.start_date, ${c}.start_date) > ${VN_TODAY})`;
const countSql = (c, p, status) =>
	`(SELECT COUNT(*) FROM course_enrollments ce WHERE ce.course_id = ${c}.id AND ce.program_id = ${p} AND ce.status = '${status}')`;

// Vị trí trong danh sách chờ của chương trình (1 = đầu hàng), tính trên mọi khóa.
const WAITLIST_POSITION_SQL = (e) => `(SELECT COUNT(*) FROM course_enrollments w
    JOIN courses wc ON wc.id = w.course_id
    WHERE w.status = 'waitlisted' AND w.program_id = ${e}.program_id AND ${APPLIES_SQL('wc')}
      AND (w.decided_at < ${e}.decided_at OR (w.decided_at = ${e}.decided_at AND w.id <= ${e}.id)))`;

// Sĩ số từng lớp (chương trình) của khóa — dùng cho tab Học viên lẫn các kiểm tra bên dưới.
// class_waiting: cả danh sách chờ của chương trình (mọi khóa).
const CLASS_COLUMNS = `ISNULL(tp.min_capacity, 1) AS class_min,
       tp.max_capacity AS class_max,
       cp.opened_at AS class_opened_at,
       cp.start_date AS class_start, cp.end_date AS class_end,
       ${countSql('c', 'cp.program_id', 'approved')} AS class_approved,
       (SELECT COUNT(*) FROM course_enrollments w JOIN courses wc ON wc.id = w.course_id
         WHERE w.program_id = cp.program_id AND w.status = 'waitlisted' AND ${APPLIES_SQL('wc')}) AS class_waiting,
       CASE WHEN ${APPLIES_SQL('c')} THEN 1 ELSE 0 END AS class_rule`;

/** Chỗ còn trống của lớp (Infinity = không giới hạn). */
const roomOf = (k) =>
	k.class_max == null ? Infinity : Math.max(0, k.class_max - k.class_approved);

/** 'open' đã mở · 'ready' đủ tối thiểu, chờ cán bộ mở · 'waiting' chưa đủ. */
const classStatus = (k) =>
	k.class_opened_at ? 'open' : k.class_approved >= k.class_min ? 'ready' : 'waiting';

const classesOf = async (courseId, q = null) => {
	const req = q ? q() : (await getPool()).request();
	const r = await req.input('course_id', sql.VarChar(20), courseId).query(`
    SELECT cp.program_id, tp.code AS program_code, tp.name AS program_name, c.name AS course_name, c.created_by,
           CASE WHEN ${NOT_STARTED_SQL('cp', 'c')} THEN 0 ELSE 1 END AS started,
           ${CLASS_COLUMNS}
    FROM courses c
    JOIN course_programs cp ON cp.course_id = c.id
    JOIN training_programs tp ON tp.id = cp.program_id
    WHERE c.id = @course_id AND c.status <> 'cancelled'`);
	return r.recordset;
};
const classOf = async (courseId, programId) =>
	(await classesOf(courseId)).find((k) => k.program_id === programId);

const mailTrainees = (enrollmentIds, title, message) =>
	(async () => {
		if (!enrollmentIds.length) return;
		const pool = await getPool();
		const rows = (
			await pool.request().input('ids', sql.NVarChar(sql.MAX), JSON.stringify(enrollmentIds))
				.query(`
        SELECT t.full_name, t.email, c.name AS course_name, tp.name AS program_name
        FROM course_enrollments e JOIN trainees t ON t.id = e.trainee_id JOIN courses c ON c.id = e.course_id
        LEFT JOIN training_programs tp ON tp.id = e.program_id
        WHERE e.id IN (SELECT [value] FROM OPENJSON(@ids)) AND t.email IS NOT NULL AND t.email <> ''`)
		).recordset;
		for (const r of rows) {
			const subject = title(r);
			mailQueue.enqueue('lớp đào tạo', () =>
				mailService.send({
					event: 'COURSE_ENROLLMENT',
					to: r.email,
					subject,
					html: mailService.renderNotificationEmail({
						fullName: r.full_name,
						title: subject,
						message,
					}),
				}),
			);
		}
	})().catch((err) => logger.error('[course-class] mail failed:', err.message));

/** Nội viện = hồ sơ học viên gắn tài khoản nhân viên của viện (quyết định 12a). */
const isInternalTrainee = async (traineeId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), traineeId)
		.query('SELECT staff_user_id FROM trainees WHERE id = @id');
	return !!r.recordset[0]?.staff_user_id;
};

const FULL_MESSAGE = (k) =>
	`Lớp ${k.program_code ?? k.program_name} đã đủ sĩ số tối đa (${k.class_max} học viên).`;

/**
 * Trạng thái khi duyệt 1 hồ sơ: lớp đầy ⇒ nội viện vào danh sách chờ đợt sau
 * ('waitlisted'), ngoại viện bị chặn (409). Khóa không áp dụng ⇒ null (giữ cách cũ).
 */
const statusOnApprove = async (course, programId, traineeId) => {
	if (!appliesTo(course) || !programId) return null;
	const k = await classOf(course.id, programId);
	if (!k) return null;
	if (roomOf(k) > 0) return 'approved';
	if (await isInternalTrainee(traineeId)) return 'waitlisted';
	throw httpError(409, `${FULL_MESSAGE(k)} Học viên ngoại viện không vào danh sách chờ — hãy từ chối hoặc nâng sĩ số.`);
};

/** Đăng ký mới (công khai / ghi danh hộ) vào lớp đầy: ngoại viện bị chặn ngay (12b). */
const assertRoomForTrainee = async (course, programId, traineeId) => {
	if (!appliesTo(course) || !programId) return;
	const k = await classOf(course.id, programId);
	if (!k || roomOf(k) > 0 || (await isInternalTrainee(traineeId))) return;
	throw httpError(409, `${FULL_MESSAGE(k)} Vui lòng chọn đợt khác hoặc liên hệ phòng Đào tạo.`);
};

/**
 * Vừa thêm `added` học viên đã duyệt ⇒ lớp chưa mở vừa vượt qua sĩ số tối thiểu
 * thì báo cán bộ tạo khóa vào bấm "Mở lớp".
 */
const notifyIfReady = async (courseId, programId, added = 1) => {
	if (!programId) return;
	const k = await classOf(courseId, programId);
	if (!k?.class_rule || k.class_opened_at || !k.created_by) return;
	if (!(k.class_approved >= k.class_min && k.class_approved - added < k.class_min)) return;
	await notificationService.push(
		'course_class',
		`Lớp ${k.program_code ?? k.program_name} đủ sĩ số`,
		[k.created_by],
		{
			message: `${k.course_name}: chương trình ${k.program_name} đã đủ ${k.class_min} học viên tối thiểu — vào tab Học viên bấm "Mở lớp".`,
			refId: courseId,
			refType: 'course',
		},
	);
};

/**
 * Lớp (chưa khai giảng) còn chỗ ⇒ gọi người chờ CỦA CHÍNH KHÓA vào, ai chờ lâu vào
 * trước. Người chờ ở khóa khác không tự chuyển (12c) — xem waitlistTransferService.
 * programId: chỉ xét 1 chương trình (null = mọi lớp của khóa).
 */
const fillFromWaitlist = async (courseId, actorId, { programId = null } = {}) => {
	const pool = await getPool();
	const tx = new sql.Transaction(pool);
	await tx.begin();
	const q = () => new sql.Request(tx);
	const moved = [];
	const added = []; // [program_id, số người] — để báo lớp vừa đủ sĩ số
	try {
		// 1 khoá chung: 2 khóa cùng kéo 1 hồ sơ thì chỉ 1 khóa nhận, không vượt sĩ số.
		await q().query(
			"EXEC sp_getapplock @Resource = 'course-class-waitlist', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000",
		);
		const classes = (await classesOf(courseId, q)).filter(
			(k) => k.class_rule && !k.started && (!programId || k.program_id === programId),
		);
		for (const k of classes) {
			const room = roomOf(k);
			if (!room) continue;
			const r = await q()
				.input('course_id', sql.VarChar(20), courseId)
				.input('program_id', sql.VarChar(20), k.program_id)
				.input('room', sql.Int, Number.isFinite(room) ? room : 100000)
				.input('actor_id', sql.VarChar(20), actorId).query(`
          DECLARE @picked TABLE (id VARCHAR(20));
          INSERT INTO @picked (id)
          SELECT TOP (@room) e.id
          FROM course_enrollments e
          WHERE e.course_id = @course_id AND e.program_id = @program_id AND e.status = 'waitlisted'
          ORDER BY e.decided_at, e.registered_at, e.id;
          UPDATE course_enrollments
          SET status = 'approved', updated_at = GETDATE(), updated_by = @actor_id
          WHERE id IN (SELECT id FROM @picked);
          SELECT id FROM @picked;`);
			const ids = r.recordset.map((x) => x.id);
			if (ids.length) added.push([k.program_id, ids.length]);
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
		mailTrainees(
			moved,
			(r) => `Bạn đã được xếp vào lớp ${r.program_name ?? ''} — ${r.course_name}`,
			'Lớp đã có chỗ — bạn được chuyển từ danh sách chờ vào lớp. Lịch học sẽ được thông báo khi cán bộ xếp lịch.',
		);
		for (const [programId, n] of added) await notifyIfReady(courseId, programId, n);
	}
	return moved;
};

/** Sau khi tạo / sửa khóa (vd. nâng sĩ số): lớp còn chỗ thì nhận người chờ của chính khóa. */
const refreshCourse = async (course, actorId) => {
	if (!appliesTo(course) || course.status === 'cancelled') return;
	await fillFromWaitlist(course.id, actorId);
};

const todayVN = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const fmtVN = (d) =>
	d
		? String(d instanceof Date ? d.toISOString() : d)
				.slice(0, 10)
				.split('-')
				.reverse()
				.join('/')
		: '';

/**
 * Gợi ý ngày học của lớp (utils/classDates): thời lượng chương trình + tổng tiết các
 * bài, ngày chuẩn bị và ngày lễ lấy ở Cấu hình hệ thống (tab Đào tạo).
 */
const suggestDates = async (courseId, programId) => {
	const pool = await getPool();
	const p = (
		await pool
			.request()
			.input('course_id', sql.VarChar(20), courseId)
			.input('program_id', sql.VarChar(20), programId).query(`
      SELECT tp.duration_value, tp.duration_unit,
             COALESCE((SELECT SUM(ISNULL(pl.theory_hours, 0) + ISNULL(pl.practice_hours, 0))
                       FROM lesson_programs lp JOIN program_lessons pl ON pl.id = lp.lesson_id AND pl.is_active = 1
                       WHERE lp.program_id = tp.id),
                      ISNULL(tp.theory_hours, 0) + ISNULL(tp.practice_hours, 0)) AS total_hours
      FROM course_programs cp JOIN training_programs tp ON tp.id = cp.program_id
      WHERE cp.course_id = @course_id AND cp.program_id = @program_id`)
	).recordset[0];
	if (!p) throw httpError(404, 'Không tìm thấy lớp của chương trình này trong khóa.');
	return suggestClassDates({
		today: todayVN(),
		prepDays: Number(await systemSettingService.getValue('TRAINING_CLASS_PREP_DAYS', '7')),
		durationValue: p.duration_value == null ? null : Number(p.duration_value),
		durationUnit: p.duration_unit,
		totalHours: p.total_hours,
		holidays: await systemSettingService.getValue('TRAINING_HOLIDAYS', ''),
	});
};

// Ngày khóa = sớm nhất → muộn nhất của các lớp đã đặt ngày (lớp chưa đặt thì giữ ngày khóa).
const syncCourseDates = (req) =>
	req.query(`
    UPDATE c SET start_date = x.s, end_date = x.e, updated_at = GETDATE()
    FROM courses c
    CROSS APPLY (SELECT MIN(start_date) AS s, MAX(end_date) AS e FROM course_programs WHERE course_id = c.id) x
    WHERE c.id = @course_id AND x.s IS NOT NULL`);

const datesInput = (req, { start_date = null, end_date = null }) => {
	if (start_date && end_date && end_date < start_date)
		throw httpError(400, 'Ngày kết thúc phải sau ngày bắt đầu.');
	return req
		.input('start_date', sql.Date, start_date || null)
		.input('end_date', sql.Date, end_date || null);
};

/** Đặt / sửa ngày học của lớp, rồi tính lại ngày khóa. */
const setClassDates = async (courseId, programId, dates, actorId) => {
	const k = await classOf(courseId, programId);
	if (!k?.class_rule) throw httpError(404, 'Không tìm thấy lớp của chương trình này trong khóa.');
	const pool = await getPool();
	const req = datesInput(pool.request(), dates)
		.input('course_id', sql.VarChar(20), courseId)
		.input('program_id', sql.VarChar(20), programId)
		.input('actor_id', sql.VarChar(20), actorId);
	await req.query(`
      UPDATE course_programs SET start_date = @start_date, end_date = @end_date, updated_at = GETDATE(), updated_by = @actor_id
      WHERE course_id = @course_id AND program_id = @program_id`);
	await syncCourseDates(pool.request().input('course_id', sql.VarChar(20), courseId));
	broadcast('update', { entity: 'course' });
	return { start_date: dates.start_date || null, end_date: dates.end_date || null };
};

/** Cán bộ bấm "Mở lớp": lớp phải đủ sĩ số tối thiểu; kèm ngày học (gợi ý sẵn ở giao diện). */
const openClass = async (courseId, programId, actorId, dates = {}) => {
	const k = await classOf(courseId, programId);
	if (!k || !k.class_rule)
		throw httpError(404, 'Không tìm thấy lớp của chương trình này trong khóa.');
	if (k.class_opened_at) throw httpError(400, 'Lớp đã mở rồi.');
	if (k.class_approved < k.class_min)
		throw httpError(
			400,
			`Lớp chưa đủ sĩ số tối thiểu (${k.class_approved}/${k.class_min} học viên đã duyệt).`,
		);
	const pool = await getPool();
	const r = await datesInput(pool.request(), dates)
		.input('course_id', sql.VarChar(20), courseId)
		.input('program_id', sql.VarChar(20), programId)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      UPDATE course_programs
      SET opened_at = GETDATE(), opened_by = @actor_id, updated_at = GETDATE(), updated_by = @actor_id,
          start_date = COALESCE(@start_date, start_date), end_date = COALESCE(@end_date, end_date)
      WHERE course_id = @course_id AND program_id = @program_id AND opened_at IS NULL;
      SELECT id FROM course_enrollments WHERE course_id = @course_id AND program_id = @program_id AND status = 'approved';`);
	await syncCourseDates(pool.request().input('course_id', sql.VarChar(20), courseId));
	broadcast('update', { entity: 'course' });
	const when = dates.start_date
		? ` Thời gian học: ${fmtVN(dates.start_date)}${dates.end_date ? ` → ${fmtVN(dates.end_date)}` : ''}.`
		: '';
	mailTrainees(
		r.recordset.map((x) => x.id),
		(t) => `Lớp ${t.program_name ?? ''} — ${t.course_name} đã mở`,
		`Lớp học của bạn đã đủ sĩ số và được mở.${when} Lịch từng buổi sẽ được thông báo khi cán bộ xếp lịch.`,
	);
	return { opened: true, trainees: r.recordset.length };
};

/**
 * Hủy mở lớp (bấm nhầm, hoặc lớp không tổ chức được nữa): lớp quay về trạng thái
 * chờ mở, học viên giữ nguyên. Lớp đã có buổi học trong lịch thì phải xóa các buổi
 * đó trước — chỉ tính buổi CHỈ nhờ lớp này mà xếp được (bài học còn thuộc 1 lớp khác
 * đã mở của khóa thì vẫn giữ được, xem assertClassOpen).
 */
const cancelOpenClass = async (courseId, programId, actorId) => {
	const k = await classOf(courseId, programId);
	if (!k || !k.class_rule)
		throw httpError(404, 'Không tìm thấy lớp của chương trình này trong khóa.');
	if (!k.class_opened_at) throw httpError(400, 'Lớp chưa mở.');
	const pool = await getPool();
	const params = (req) =>
		req
			.input('course_id', sql.VarChar(20), courseId)
			.input('program_id', sql.VarChar(20), programId);
	// Lớp khác của khóa vẫn đang mở, có bài học s.subject_id (lesson NULL = lớp bất kỳ).
	const otherOpen = (lesson) => `EXISTS (SELECT 1 FROM course_programs o
        WHERE o.course_id = @course_id AND o.program_id <> @program_id AND o.opened_at IS NOT NULL
          ${lesson ? `AND EXISTS (SELECT 1 FROM lesson_programs lo WHERE lo.program_id = o.program_id AND lo.lesson_id = ${lesson})` : ''})`;
	const sessions = (
		await params(pool.request()).query(`
      SELECT COUNT(*) AS n FROM class_sessions s
      WHERE s.course_id = @course_id AND (
        -- bài thuộc chương trình này, không lớp nào khác đã mở có bài đó
        (EXISTS (SELECT 1 FROM lesson_programs lp WHERE lp.program_id = @program_id AND lp.lesson_id = s.subject_id)
         AND NOT ${otherOpen('s.subject_id')})
        -- buổi không gắn bài / bài không thuộc chương trình nào của khóa: cần ít nhất 1 lớp mở
        OR (NOT EXISTS (SELECT 1 FROM lesson_programs lp JOIN course_programs cp
                          ON cp.program_id = lp.program_id AND cp.course_id = @course_id
                        WHERE lp.lesson_id = s.subject_id)
            AND NOT ${otherOpen(null)})
      )`)
	).recordset[0].n;
	if (sessions)
		throw httpError(
			400,
			`Lớp đã có ${sessions} buổi học trong lịch — xóa các buổi đó ở tab Lịch học trước khi hủy mở lớp.`,
		);
	const r = await params(pool.request()).input('actor_id', sql.VarChar(20), actorId).query(`
      UPDATE course_programs
      SET opened_at = NULL, opened_by = NULL, updated_at = GETDATE(), updated_by = @actor_id
      WHERE course_id = @course_id AND program_id = @program_id AND opened_at IS NOT NULL;
      SELECT id FROM course_enrollments WHERE course_id = @course_id AND program_id = @program_id AND status = 'approved';`);
	broadcast('update', { entity: 'course' });
	mailTrainees(
		r.recordset.map((x) => x.id),
		(t) => `Lớp ${t.program_name ?? ''} — ${t.course_name} tạm hoãn mở`,
		'Lớp học của bạn tạm thời chưa mở như thông báo trước. Bạn vẫn giữ chỗ trong lớp; thời gian học mới sẽ được thông báo khi lớp mở lại.',
	);
	return { cancelled: true, trainees: r.recordset.length };
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
	if (relevant.some((k) => k.class_opened_at)) return;
	const list = relevant
		.slice(0, 3)
		.map((k) => `${k.program_code ?? k.program_name} ${k.class_approved}/${k.class_min}`)
		.join('; ');
	throw httpError(
		400,
		`Lớp chưa mở (${list}${relevant.length > 3 ? '; …' : ''}). Đủ sĩ số tối thiểu thì bấm "Mở lớp" ở tab Học viên rồi mới xếp lịch.`,
	);
};

module.exports = {
	CLASS_TYPES,
	appliesTo,
	APPLIES_SQL,
	CLASS_COLUMNS,
	WAITLIST_POSITION_SQL,
	roomOf,
	classStatus,
	statusOnApprove,
	notifyIfReady,
	fillFromWaitlist,
	classesOf,
	mailTrainees,
	isInternalTrainee,
	assertRoomForTrainee,
	refreshCourse,
	openClass,
	cancelOpenClass,
	suggestDates,
	setClassDates,
	assertClassOpen,
};
