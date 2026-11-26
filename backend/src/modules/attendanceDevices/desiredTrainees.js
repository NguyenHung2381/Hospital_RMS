// Học viên CẦN có trên máy chấm công: ghi danh 'approved' của khóa chưa hủy, đã/sắp bắt đầu
// (≤ UPCOMING_DAYS ngày) và chưa quá cleanupDays ngày sau khi kết thúc. Mã HV + 8 số (PIN).
const { sql } = require('../../config/db');

const UPCOMING_DAYS = 7;

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
        AND EXISTS (
          SELECT 1 FROM course_enrollments e JOIN courses c ON c.id = e.course_id
          WHERE e.trainee_id = t.id AND e.status = 'approved'
            AND c.status NOT IN ('draft', 'cancelled')
            AND COALESCE(e.progress_status, 'in_progress') <> 'dropped'
            AND (COALESCE(e.start_date, c.start_date) IS NULL
                 OR COALESCE(e.start_date, c.start_date)
                    <= CAST(now() AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE) + @upcoming)
            AND (COALESCE(e.end_date, c.end_date) IS NULL
                 OR COALESCE(e.end_date, c.end_date) + @cleanup
                    >= CAST(now() AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE)))`)
	).recordset;
};

module.exports = { desiredTrainees, UPCOMING_DAYS };
