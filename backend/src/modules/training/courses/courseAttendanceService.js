const { signToken, verifyToken } = require('../../../utils/keys');
const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { httpError } = require('../../../utils/httpError');

// Mã QR điểm danh: JWT ngắn hạn ký chính session_id (mirror utils/captcha.js)
// — không trạng thái, không cần lưu DB, hết hạn nhanh. FE làm mới QR mỗi 28s;
// TTL 75s để mã vừa biến khỏi màn hình vẫn còn ≥45s — đủ cho đường "chụp ảnh
// mã QR" (mở camera → chụp → xác nhận → tải lên) khi không có HTTPS để quét trực tiếp.
const ATTENDANCE_QR_TTL = '75s';
const ATTENDANCE_QR_PURPOSE = 'course_attendance_qr';
const DEVICE_TAKEN_MSG =
	'Thiết bị này đã dùng để điểm danh cho người khác trong buổi này. Vui lòng dùng thiết bị của chính bạn hoặc liên hệ giảng viên.';

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
	signToken(
		'attendance-qr',
		{ session_id: sessionId, purpose: ATTENDANCE_QR_PURPOSE },
		ATTENDANCE_QR_TTL,
	);

// Học viên tự điểm danh bằng mã QR vừa quét — actor phải là tài khoản đã được
// cấp cho 1 trainee (trainees.user_id, xem D0) có ghi danh 'approved' vào
// khóa của buổi học này.
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
		throw httpError(403, 'Bạn không có trong danh sách học viên của buổi học này.');
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
		throw httpError(403, DEVICE_TAKEN_MSG);
	}
	broadcast('update', { entity: 'attendance' });
	return { session_id: decoded.session_id };
};

module.exports = {
	listAttendance,
	setAttendance,
	bulkSetAttendance,
	generateAttendanceQrToken,
	checkInSelf,
};
