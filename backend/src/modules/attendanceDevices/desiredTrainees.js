// Học viên CẦN có trên máy chấm công (mã HV + 8 số ⇔ PIN), một trong hai:
//   - ghi danh 'approved' của khóa chưa hủy, đã/sắp bắt đầu (≤ UPCOMING_DAYS ngày) và chưa
//     quá cleanupDays ngày sau khi kết thúc;
//   - được đẩy tay ở trang Tất cả học viên (attendance_device_manual) và chưa quá until_date.
const { sql } = require('../../config/db');

const UPCOMING_DAYS = 7;
const VN_TODAY = "CAST(now() AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE)";

/**
 * @param {any} runner pool hoặc transaction
 * @param {number} cleanupDays
 * @param {string} [traineeId] chỉ kiểm 1 học viên
 * @returns {Promise<{ trainee_id: string, full_name: string }[]>}
 */
const desiredTrainees = async (runner, cleanupDays, traineeId) => {
	const req = runner
		.request()
		.input('upcoming', sql.Int, UPCOMING_DAYS)
		.input('cleanup', sql.Int, cleanupDays);
	if (traineeId) req.input('trainee_id', sql.VarChar(20), traineeId);
	return (
		await req.query(`
      SELECT t.id AS trainee_id, t.full_name
      FROM trainees t
      WHERE t.is_active AND t.id ~ '^HV[0-9]{8}$'${traineeId ? ' AND t.id = @trainee_id' : ''}
        AND (
          EXISTS (
            SELECT 1 FROM course_enrollments e JOIN courses c ON c.id = e.course_id
            WHERE e.trainee_id = t.id AND e.status = 'approved'
              AND c.status NOT IN ('draft', 'cancelled')
              AND COALESCE(e.progress_status, 'in_progress') <> 'dropped'
              AND (COALESCE(e.start_date, c.start_date) IS NULL
                   OR COALESCE(e.start_date, c.start_date) <= ${VN_TODAY} + @upcoming)
              AND (COALESCE(e.end_date, c.end_date) IS NULL
                   OR COALESCE(e.end_date, c.end_date) + @cleanup >= ${VN_TODAY}))
          OR EXISTS (
            SELECT 1 FROM attendance_device_manual m
            WHERE m.trainee_id = t.id AND m.until_date >= ${VN_TODAY}))`)
	).recordset;
};

module.exports = { desiredTrainees, UPCOMING_DAYS };
