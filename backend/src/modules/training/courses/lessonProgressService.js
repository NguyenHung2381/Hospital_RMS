/**
 * lessonProgressService.js — trạng thái bài học của học viên (enrollment_lessons.status)
 * TÍNH TỪ ĐIỂM DANH (docs/ke-hoach-thiet-ke-lai-luong-dao-tao.md GĐ4, quyết định 13).
 * Không còn chỉnh tay:
 *   - 'done'         có mặt (kể cả đi muộn) ở TẤT CẢ các buổi của bài (class_sessions.subject_id);
 *   - 'in_progress'  có mặt ở ít nhất 1 buổi;
 *   - 'not_started'  chưa có mặt buổi nào, hoặc bài chưa có buổi học.
 * Buổi tính theo lớp của học viên (SESSION_IN_PROGRAM_SQL). Gọi lại sau mỗi lần lưu điểm
 * danh và khi thêm / sửa / xóa buổi học. Dữ liệu cũ chỉ tính lại khi khóa có thay đổi
 * (không chạy hàng loạt — tránh hạ trạng thái bài đã đánh dấu tay ở khóa cũ chưa điểm danh).
 */
const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { SESSION_IN_PROGRAM_SQL } = require('./sessionScope');

const ATTENDED = "('present', 'late')";

/**
 * Tính lại trạng thái bài của các hồ sơ được chọn. Đúng 1 trong các bộ lọc:
 *   sessionId — bài của buổi này, mọi học viên của khóa;
 *   courseId  — mọi bài, mọi học viên của khóa (vd. sau khi xóa / đổi bài của buổi);
 *   enrollmentId — mọi bài của 1 hồ sơ (vd. vừa chép bài khi ghi danh).
 * Trả về số dòng đổi trạng thái.
 */
const recompute = async ({ sessionId = null, courseId = null, enrollmentId = null }) => {
	const pool = await getPool();
	const filter = sessionId
		? `e.course_id = (SELECT course_id FROM class_sessions WHERE id = @session_id)
       AND el.lesson_id = (SELECT subject_id FROM class_sessions WHERE id = @session_id)`
		: courseId
			? 'e.course_id = @course_id'
			: 'e.id = @enrollment_id';
	const r = await pool
		.request()
		.input('session_id', sql.VarChar(20), sessionId)
		.input('course_id', sql.VarChar(20), courseId)
		.input('enrollment_id', sql.VarChar(20), enrollmentId).query(`
      WITH counts AS (
        SELECT el.enrollment_id, el.lesson_id,
               COUNT(s.id) AS total,
               SUM(CASE WHEN a.status IN ${ATTENDED} THEN 1 ELSE 0 END) AS attended,
               MAX(CASE WHEN a.status IN ${ATTENDED} THEN s.session_date END) AS last_attended
        FROM enrollment_lessons el
        JOIN course_enrollments e ON e.id = el.enrollment_id
        LEFT JOIN class_sessions s
          ON s.course_id = e.course_id AND s.subject_id = el.lesson_id AND ${SESSION_IN_PROGRAM_SQL('s', 'e')}
        LEFT JOIN attendance a ON a.session_id = s.id AND a.enrollment_id = e.id
        WHERE ${filter}
        GROUP BY el.enrollment_id, el.lesson_id
      ), next AS (
        SELECT enrollment_id, lesson_id, last_attended,
               CASE WHEN total > 0 AND attended = total THEN 'done'
                    WHEN attended > 0 THEN 'in_progress'
                    ELSE 'not_started' END AS status
        FROM counts
      )
      UPDATE el
      SET status = n.status,
          completed_at = CASE WHEN n.status = 'done' THEN n.last_attended END,
          updated_at = GETDATE()
      FROM enrollment_lessons el
      JOIN next n ON n.enrollment_id = el.enrollment_id AND n.lesson_id = el.lesson_id
      WHERE el.status <> n.status
         OR (n.status = 'done' AND (el.completed_at IS NULL OR el.completed_at <> n.last_attended));
      SELECT @@ROWCOUNT AS n;`);
	const changed = r.recordset[0]?.n ?? 0;
	if (changed) broadcast('update', { entity: 'course_enrollment' });
	return changed;
};

module.exports = { recompute };
