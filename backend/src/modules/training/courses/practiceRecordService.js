/**
 * practiceRecordService.js — danh sách HỒ SƠ THỰC HÀNH GPHN trên mọi khóa (màn
 * "Hồ sơ thực hành GPHN", docs/ke-hoach-thiet-ke-lai-luong-dao-tao.md GĐ2).
 * Phòng Đào tạo làm việc theo hồ sơ, khóa GPHN chỉ còn là nhãn đợt.
 * Mỗi dòng kèm giai đoạn (stage), vòng đang diễn ra hôm nay (khoa / NHD), vòng
 * kế tiếp và số vòng đã qua mà chưa đánh giá. Lọc / tìm / phân trang ở giao diện
 * (vài trăm – vài nghìn hồ sơ).
 * Phạm vi 'assigned' (giảng viên) chỉ thấy khóa mình được phân công.
 */
const { getPool, sql } = require('../../../config/db');
const { scopeOf } = require('../../../permissions/authz');
const { todayKeyVN } = require('../../../utils/vnDate');
const { ASSIGNED_EXISTS_SQL } = require('./coursePolicy');

const GPHN_TYPE = 'TRNTP-GPHN';

// Giai đoạn của hồ sơ — thứ tự luồng: duyệt → xếp lịch → thực hành → kết thúc.
//   pending      chờ duyệt
//   unscheduled  đã duyệt, đang học, chưa có vòng nào
//   practicing   đã duyệt, đang học, đã có vòng
//   completed / dropped   theo tiến độ
//   other        từ chối / danh sách chờ
const STAGE_SQL = `CASE
    WHEN e.status = 'pending' THEN 'pending'
    WHEN e.status <> 'approved' THEN 'other'
    WHEN ISNULL(e.progress_status, 'in_progress') = 'completed' THEN 'completed'
    WHEN e.progress_status = 'dropped' THEN 'dropped'
    WHEN rc.total = 0 THEN 'unscheduled'
    ELSE 'practicing' END`;

const list = async (actor = null) => {
	const pool = await getPool();
	const req = pool.request().input('today', sql.Date, todayKeyVN()).input('gphn', sql.VarChar(20), GPHN_TYPE);
	const where = ['(c.is_rolling = 1 OR c.training_type_id = @gphn)'];
	if (actor && scopeOf(actor, 'courses') === 'assigned') {
		where.push(ASSIGNED_EXISTS_SQL);
		req.input('actor_id', sql.VarChar(20), actor.id);
	}
	const r = await req.query(`
    SELECT e.id, e.course_id, c.name AS course_name, e.trainee_id, t.full_name AS trainee_name,
           t.phone AS trainee_phone, CAST(CASE WHEN t.staff_user_id IS NULL THEN 0 ELSE 1 END AS BIT) AS is_internal,
           e.status, e.progress_status, e.practice_code, e.program_id, tp.code AS program_code, tp.name AS program_name,
           e.start_date, e.end_date, e.sending_unit, e.registered_at,
           ${STAGE_SQL} AS stage,
           rc.total AS rotation_total, rc.passed AS rotation_passed, rc.failed AS rotation_failed,
           rc.awaiting AS rotation_awaiting,
           cur.round_title AS current_round, cur.department_id AS current_department_id,
           ISNULL(cd.name, cur.department_name) AS current_department, cur.mentor_user_id AS current_mentor_user_id,
           cur.mentor_name AS current_mentor, cur.end_date AS current_end_date,
           nx.round_title AS next_round, ISNULL(nd.name, nx.department_name) AS next_department, nx.start_date AS next_start_date
    FROM course_enrollments e
    JOIN courses c ON c.id = e.course_id
    JOIN trainees t ON t.id = e.trainee_id
    LEFT JOIN training_programs tp ON tp.id = e.program_id
    -- Đếm vòng: đạt / không đạt / đã qua ngày kết thúc mà chưa có kết quả (chờ NHD đánh giá)
    OUTER APPLY (
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN x.result = 'pass' THEN 1 ELSE 0 END) AS passed,
             SUM(CASE WHEN x.result = 'fail' THEN 1 ELSE 0 END) AS failed,
             SUM(CASE WHEN x.result = 'pending' AND x.end_date < @today THEN 1 ELSE 0 END) AS awaiting
      FROM enrollment_rotations x WHERE x.enrollment_id = e.id) rc
    -- Vòng đang diễn ra hôm nay
    OUTER APPLY (
      SELECT TOP 1 x.round_title, x.department_id, x.department_name, x.mentor_user_id, x.mentor_name, x.end_date
      FROM enrollment_rotations x
      WHERE x.enrollment_id = e.id AND x.start_date <= @today AND x.end_date >= @today AND x.result <> 'fail'
      ORDER BY x.seq) cur
    LEFT JOIN departments cd ON cd.id = cur.department_id
    -- Vòng kế tiếp (khi hôm nay chưa vào vòng nào / giữa 2 vòng)
    OUTER APPLY (
      SELECT TOP 1 x.round_title, x.department_id, x.department_name, x.start_date
      FROM enrollment_rotations x
      WHERE x.enrollment_id = e.id AND x.start_date > @today
      ORDER BY x.start_date, x.seq) nx
    LEFT JOIN departments nd ON nd.id = nx.department_id
    WHERE ${where.join(' AND ')}
    ORDER BY e.registered_at DESC`);
	return r.recordset;
};

module.exports = { list, GPHN_TYPE };
