const { signToken, verifyToken } = require('../../../utils/keys');
const { getPool, sql, withTransaction, jsonValues, utcNowSql } = require('../../../config/db');
const { genAttendanceId } = require('../../../utils/idGenerator');
const { broadcast } = require('../../events/eventService');
const { httpError } = require('../../../utils/httpError');
const { SESSION_IN_PROGRAM_SQL } = require('./sessionScope');
const { courseModeSql, usesSessions } = require('../../../utils/attendanceMode');
const attendanceMethods = require('../../../utils/attendanceMethods');
const lessonProgressService = require('./lessonProgressService');
const { TRAINEE_OF_USER_SQL } = require('../trainees/traineeOfUser');

// require muộn — gradebookService kéo theo certificateService / courseCmeService
const gradebook = () => require('./gradebookService');

// Điểm tổng đã khóa ⇒ không đổi trạng thái điểm danh (chuyên cần là đầu vào kết quả — L-11,
// audit run-5); lưu lại đúng trạng thái cũ (chỉ sửa ghi chú) vẫn được.
const assertAttendanceEditable = async (sessionId, records) => {
	const locked = await gradebook().lockedEnrollmentIds(records.map((r) => r.enrollment_id));
	if (!locked.size) return;
	const r = await (
		await getPool()
	)
		.request()
		.input('session_id', sql.VarChar(20), sessionId)
		.input('ids', sql.NVarChar(sql.MAX), JSON.stringify([...locked]))
		.query(
			`SELECT enrollment_id, status FROM attendance
       WHERE session_id = @session_id AND enrollment_id IN ${jsonValues('@ids')}`,
		);
	const cur = new Map(r.recordset.map((x) => [x.enrollment_id, x.status]));
	if (records.some((x) => locked.has(x.enrollment_id) && cur.get(x.enrollment_id) !== x.status))
		throw httpError(
			409,
			'Điểm của học viên đã khóa — cần mở khóa điểm (grades:unlock) trước khi sửa điểm danh.',
		);
};

// Mã QR điểm danh: JWT ngắn hạn ký chính session_id (mirror utils/captcha.js)
// — không trạng thái, không cần lưu DB, hết hạn nhanh. FE làm mới QR mỗi 28s;
// TTL 75s để mã vừa biến khỏi màn hình vẫn còn ≥45s — đủ cho đường "chụp ảnh
// mã QR" (mở camera → chụp → xác nhận → tải lên) khi không có HTTPS để quét trực tiếp.
const ATTENDANCE_QR_TTL = '75s';
const ATTENDANCE_QR_PURPOSE = 'course_attendance_qr';
const DEVICE_TAKEN_MSG =
	'Thiết bị này đã dùng để điểm danh cho người khác trong buổi này. Vui lòng dùng thiết bị của chính bạn hoặc liên hệ giảng viên.';

// ─── Điểm danh ───────────────────────────────────────────────────────────
// Học viên đã duyệt của khóa đang theo học chương trình có buổi này (khóa nhiều
// chương trình: chỉ lớp của bài học — xem sessionScope) + trạng thái điểm danh
// (chưa điểm danh thì status = null để FE phân biệt "chưa điểm danh" và "vắng").
const ROSTER_FROM = `
    FROM class_sessions sess
    JOIN course_enrollments e ON e.course_id = sess.course_id AND e.status = 'approved'
    JOIN trainees t ON t.id = e.trainee_id`;
const ROSTER_WHERE = `sess.id = @session_id AND ${SESSION_IN_PROGRAM_SQL('sess', 'e')}`;

const listAttendance = async (sessionId) => {
	const pool = await getPool();
	const r = await pool.request().input('session_id', sql.VarChar(20), sessionId).query(`
    SELECT e.id AS enrollment_id, t.full_name AS trainee_name,
           tp.code AS program_code, tp.name AS program_name,
           a.id AS attendance_id, a.status, a.note, a.method, a.checked_in_at
    ${ROSTER_FROM}
    LEFT JOIN training_programs tp ON tp.id = e.program_id
    LEFT JOIN attendance a ON a.session_id = sess.id AND a.enrollment_id = e.id
    WHERE ${ROSTER_WHERE}
    ORDER BY t.full_name
  `);
	return r.recordset;
};

// recompute=false khi lưu hàng loạt — bulkSetAttendance tính lại 1 lần sau cùng.
// Đã có dòng điểm danh của lượt ghi danh này ở buổi này chưa
const attendanceExists = async (tx, sessionId, enrollmentId) =>
	(
		await tx
			.request()
			.input('session_id', sql.VarChar(20), sessionId)
			.input('enrollment_id', sql.VarChar(20), enrollmentId)
			.query(
				'SELECT 1 AS x FROM attendance WHERE session_id = @session_id AND enrollment_id = @enrollment_id',
			)
	).recordset.length > 0;

const setAttendance = async (
	sessionId,
	enrollmentId,
	status,
	note,
	actorId,
	{ recompute = true, lockChecked = false } = {},
) => {
	if (!lockChecked)
		await assertAttendanceEditable(sessionId, [{ enrollment_id: enrollmentId, status }]);
	await withTransaction(async (tx) => {
		const req = () =>
			tx
				.request()
				.input('session_id', sql.VarChar(20), sessionId)
				.input('enrollment_id', sql.VarChar(20), enrollmentId)
				.input('status', sql.VarChar(10), status)
				.input('note', sql.NVarChar(255), note || null)
				.input('actor_id', sql.VarChar(20), actorId);
		if (await attendanceExists(tx, sessionId, enrollmentId)) {
			await req().query(`
        UPDATE attendance SET status = @status, note = @note, updated_at = CURRENT_TIMESTAMP, updated_by = @actor_id
        WHERE session_id = @session_id AND enrollment_id = @enrollment_id`);
			return;
		}
		await req().input('new_id', sql.VarChar(20), await genAttendanceId(tx)).query(`
        INSERT INTO attendance (id, session_id, enrollment_id, status, note, created_by, updated_by, updated_at)
        VALUES (@new_id, @session_id, @enrollment_id, @status, @note, @actor_id, @actor_id, CURRENT_TIMESTAMP)`);
	});
	broadcast('update', { entity: 'attendance' });
	// Bài học "đã học" tính theo điểm danh (quyết định 13)
	if (recompute) await lessonProgressService.recompute({ sessionId });
};

const bulkSetAttendance = async (sessionId, records, actorId) => {
	const pool = await getPool();
	const roster = new Set(
		(
			await pool
				.request()
				.input('session_id', sql.VarChar(20), sessionId)
				.query(`SELECT e.id ${ROSTER_FROM} WHERE ${ROSTER_WHERE}`)
		).recordset.map((x) => x.id),
	);
	if (records.some((rec) => !roster.has(rec.enrollment_id))) {
		throw httpError(400, 'Có học viên không thuộc lớp (chương trình) của buổi học này.');
	}
	// Kiểm cả lô trước khi ghi dòng nào
	await assertAttendanceEditable(sessionId, records);
	for (const rec of records) {
		await setAttendance(sessionId, rec.enrollment_id, rec.status, rec.note, actorId, {
			recompute: false,
			lockChecked: true,
		});
	}
	await lessonProgressService.recompute({ sessionId });
};

// Phương thức điểm danh dùng được ở buổi học (utils/attendanceMethods) + kiểu chấm công của khóa
// — modal điểm danh dùng để ẩn nút "Hiện mã QR" khi khóa không nhận QR.
const sessionMethods = async (sessionId) => {
	const [methods, course] = await Promise.all([
		attendanceMethods.forSession(sessionId),
		getPool().then((pool) =>
			pool.request().input('session_id', sql.VarChar(20), sessionId).query(`
        SELECT ${courseModeSql('c')} AS attendance_mode
        FROM class_sessions sess JOIN courses c ON c.id = sess.course_id
        WHERE sess.id = @session_id`),
		),
	]);
	if (!methods) throw httpError(404, 'Không tìm thấy buổi học.');
	const mode = course.recordset[0]?.attendance_mode ?? null;
	// QR chỉ có nghĩa với khóa chấm theo buổi học
	return { ...methods, qr: methods.qr && usesSessions(mode), attendance_mode: mode };
};

// Sinh mã QR điểm danh cho 1 buổi học — giảng viên/quản lý (đã qua
// authorizePermission courses:update ở route) hiển thị lên màn hình lớp,
// học viên tự quét bằng tài khoản đã đăng nhập (checkInSelf).
// Khóa không nhận QR (phương thức bị tắt / chấm theo ca) ⇒ không phát mã.
const generateAttendanceQrToken = async (sessionId) => {
	const methods = await sessionMethods(sessionId);
	if (!methods.qr) {
		if (!usesSessions(methods.attendance_mode))
			throw httpError(409, 'Khóa học này không điểm danh theo buổi học nên không dùng mã QR.');
		attendanceMethods.assertTraining(methods, 'qr', await attendanceMethods.systemTraining());
	}
	return signToken(
		'attendance-qr',
		{ session_id: sessionId, purpose: ATTENDANCE_QR_PURPOSE },
		ATTENDANCE_QR_TTL,
	);
};

// Học viên tự điểm danh bằng mã QR vừa quét — actor phải là tài khoản đã được
// gắn với 1 trainee (tài khoản học viên hoặc nhân viên nội viện — traineeOfUser) có ghi danh 'approved' vào
// khóa của buổi học này, đúng chương trình (lớp) có buổi đó.
const checkInSelf = async (token, deviceId, actor) => {
	let decoded;
	try {
		decoded = verifyToken('attendance-qr', token);
	} catch {
		throw httpError(401, 'Mã QR đã hết hạn, vui lòng thử lại.');
	}
	if (decoded.purpose !== ATTENDANCE_QR_PURPOSE) {
		throw httpError(401, 'Mã QR không hợp lệ.');
	}

	const pool = await getPool();
	// Khóa chấm công theo ca / không chấm công: buổi học không nhận QR (giảng viên vẫn điểm danh tay)
	const course = (
		await pool.request().input('session_id', sql.VarChar(20), decoded.session_id).query(`
      SELECT ${courseModeSql('c')} AS attendance_mode
      FROM class_sessions sess JOIN courses c ON c.id = sess.course_id
      WHERE sess.id = @session_id`)
	).recordset[0];
	if (course && !usesSessions(course.attendance_mode)) {
		throw httpError(
			409,
			course.attendance_mode === 'shift'
				? 'Khóa học này chấm công theo ca — vui lòng điểm danh vào/ra ở mục Điểm danh, không quét QR buổi học.'
				: 'Khóa học này không điểm danh bằng mã QR.',
		);
	}
	// Phương thức QR bị tắt (toàn hệ thống / loại hình) — mã đã phát trước khi tắt cũng không nhận
	const methods = await attendanceMethods.forSession(decoded.session_id);
	if (methods) attendanceMethods.assertTraining(methods, 'qr', await attendanceMethods.systemTraining());
	// Học viên học nhiều lớp trong khóa: buổi chung (không gắn bài) khớp nhiều lượt
	// ghi danh ⇒ quét 1 lần ghi đủ các lượt đó.
	const enrollRes = await pool
		.request()
		.input('session_id', sql.VarChar(20), decoded.session_id)
		.input('user_id', sql.VarChar(20), actor.id).query(`
      SELECT e.id AS enrollment_id, e.trainee_id ${ROSTER_FROM}
      WHERE ${ROSTER_WHERE} AND ${TRAINEE_OF_USER_SQL('t', '@user_id')}
    `);
	if (!enrollRes.recordset.length) {
		throw httpError(403, 'Bạn không có trong danh sách học viên của buổi học này.');
	}
	// Lượt ghi danh đã khóa điểm: không tự điểm danh thêm (L-11)
	const locked = await gradebook().lockedEnrollmentIds(
		enrollRes.recordset.map((e) => e.enrollment_id),
	);
	const enrollments = enrollRes.recordset.filter((e) => !locked.has(e.enrollment_id));
	if (!enrollments.length) {
		throw httpError(409, 'Điểm khóa học của bạn đã khóa, không điểm danh thêm được.');
	}

	// 1 thiết bị chỉ điểm danh cho 1 học viên mỗi buổi — chặn cầm máy đăng nhập
	// lần lượt tài khoản người khác để điểm danh hộ. Chính học viên quét lại
	// (kể cả từ máy khác) vẫn được, ghi đè mã thiết bị.
	for (const enrollment of enrollments) {
		const deviceTaken = await withTransaction(async (tx) => {
			const req = () =>
				tx
					.request()
					.input('session_id', sql.VarChar(20), decoded.session_id)
					.input('enrollment_id', sql.VarChar(20), enrollment.enrollment_id)
					.input('trainee_id', sql.VarChar(20), enrollment.trainee_id)
					.input('device_id', sql.VarChar(64), deviceId)
					.input('actor_id', sql.VarChar(20), actor.id);
			const taken = await req().query(`
        SELECT 1 AS x FROM attendance a JOIN course_enrollments ae ON ae.id = a.enrollment_id
        WHERE a.session_id = @session_id AND a.checkin_device_id = @device_id
          AND ae.trainee_id <> @trainee_id`);
			if (taken.recordset.length) return true;
			if (await attendanceExists(tx, decoded.session_id, enrollment.enrollment_id)) {
				await req().query(`
          UPDATE attendance SET status = 'present', method = 'qr', checked_in_at = ${utcNowSql},
                 checkin_device_id = @device_id, updated_at = CURRENT_TIMESTAMP, updated_by = @actor_id
          WHERE session_id = @session_id AND enrollment_id = @enrollment_id`);
			} else {
				await req().input('new_id', sql.VarChar(20), await genAttendanceId(tx)).query(`
          INSERT INTO attendance (id, session_id, enrollment_id, status, method, checked_in_at, checkin_device_id, created_by, updated_by, updated_at)
          VALUES (@new_id, @session_id, @enrollment_id, 'present', 'qr', ${utcNowSql}, @device_id, @actor_id, @actor_id, CURRENT_TIMESTAMP)`);
			}
			return false;
		});
		if (deviceTaken) {
			throw httpError(403, DEVICE_TAKEN_MSG);
		}
	}
	broadcast('update', { entity: 'attendance' });
	await lessonProgressService.recompute({ sessionId: decoded.session_id });
	return { session_id: decoded.session_id };
};

// Điểm danh từ máy chấm công vân tay (modules/attendanceDevices/punchMatcher). Không tự
// broadcast / tính lại tiến độ — bên gọi làm 1 lần sau cả lô. Trả kết quả cho lượt chấm:
//   'locked'      điểm đã khóa (L-11) — không ghi
//   'kept_manual' giảng viên đã điểm danh tay buổi này — giữ nguyên, không ghi đè
//   'matched'     đã ghi; dòng QR / máy chấm công có sẵn thì giữ lần chấm SỚM nhất
const recordDeviceCheckIn = async ({ sessionId, enrollmentId, status, checkedInAt, deviceTag }) => {
	if ((await gradebook().lockedEnrollmentIds([enrollmentId])).size) return 'locked';
	return withTransaction(async (tx) => {
		const req = () =>
			tx
				.request()
				.input('session_id', sql.VarChar(20), sessionId)
				.input('enrollment_id', sql.VarChar(20), enrollmentId)
				.input('status', sql.VarChar(10), status)
				.input('checked_in_at', sql.DateTime2, checkedInAt)
				.input('device_id', sql.VarChar(64), deviceTag);
		const cur = (
			await req().query(`
        SELECT method, checked_in_at FROM attendance
        WHERE session_id = @session_id AND enrollment_id = @enrollment_id FOR UPDATE`)
		).recordset[0];
		if (!cur) {
			await req().input('new_id', sql.VarChar(20), await genAttendanceId(tx)).query(`
        INSERT INTO attendance (id, session_id, enrollment_id, status, method, checked_in_at, checkin_device_id, updated_at)
        VALUES (@new_id, @session_id, @enrollment_id, @status, 'device', @checked_in_at, @device_id, CURRENT_TIMESTAMP)`);
			return 'matched';
		}
		if (cur.method === 'manual') return 'kept_manual';
		if (cur.checked_in_at && cur.checked_in_at.getTime() <= checkedInAt.getTime()) return 'matched';
		await req().query(`
        UPDATE attendance SET status = @status, method = 'device', checked_in_at = @checked_in_at,
               checkin_device_id = @device_id, updated_at = CURRENT_TIMESTAMP
        WHERE session_id = @session_id AND enrollment_id = @enrollment_id`);
		return 'matched';
	});
};

module.exports = {
	recordDeviceCheckIn,
	listAttendance,
	setAttendance,
	bulkSetAttendance,
	generateAttendanceQrToken,
	sessionMethods,
	checkInSelf,
};
