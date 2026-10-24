/**
 * hospitalTrainingSelfService.js — nhân viên tự đăng ký Tập huấn bệnh viện trên cổng
 * người dùng (/me/hospital-trainings — docs/ke-hoach-thiet-ke-lai-luong-dao-tao.md GĐ6).
 *   - Danh sách: buổi chưa kết thúc + buổi mình đã có trong danh sách (180 ngày gần đây).
 *   - Đăng ký: buổi chưa qua ngày học ⇒ thêm mình vào seminar_participants (Học viên,
 *     created_by = chính mình = "tự đăng ký").
 *   - Hủy: chỉ dòng mình tự đăng ký, chưa điểm danh, trước ngày học, và khoa mình
 *     không thuộc khoa bắt buộc (khoa bắt buộc do phòng Đào tạo thêm cả khoa).
 */
const { getPool, sql } = require('../../config/db');
const { httpError } = require('../../utils/httpError');
const { HOSPITAL_TRAINING_SQL } = require('./hospitalTraining');
const participantService = require('./seminarParticipantService');

const VN_TODAY = 'CAST(DATEADD(HOUR, 7, GETUTCDATE()) AS DATE)';

const SELECT_SQL = `
  SELECT s.id, s.title, s.start_date, s.end_date, s.start_time, s.end_time, s.date_text, s.location,
         s.lesson_hours, s.grants_cme, s.speakers, od.name AS organizer_department_name, ht.name AS topic_name,
         CAST(CASE WHEN EXISTS (SELECT 1 FROM seminar_required_departments r JOIN users me ON me.id = @uid
                                WHERE r.seminar_id = s.id AND r.department_id = me.department_id)
              THEN 1 ELSE 0 END AS BIT) AS required,
         p.id AS participant_id, p.checked_in_at, p.cme_status, p.cme_credits,
         CAST(CASE WHEN p.created_by = @uid THEN 1 ELSE 0 END AS BIT) AS self_registered,
         CAST(CASE WHEN s.start_date IS NULL OR s.start_date >= ${VN_TODAY} THEN 1 ELSE 0 END AS BIT) AS [open],
         CAST(CASE WHEN s.start_date IS NULL OR s.start_date > ${VN_TODAY} THEN 1 ELSE 0 END AS BIT) AS before_day
  FROM seminars s
  LEFT JOIN departments od ON od.id = s.organizer_department_id
  LEFT JOIN hospital_training_topics ht ON ht.id = s.topic_id
  OUTER APPLY (SELECT TOP 1 x.id, x.checked_in_at, x.cme_status, x.cme_credits, x.created_by
               FROM seminar_participants x WHERE x.seminar_id = s.id AND x.user_id = @uid) p
  WHERE ${HOSPITAL_TRAINING_SQL}`;

const withActions = (row) => ({
	...row,
	registered: !!row.participant_id,
	can_register: !row.participant_id && row.open,
	can_cancel:
		!!row.participant_id &&
		row.self_registered &&
		!row.required &&
		!row.checked_in_at &&
		row.before_day,
});

const listForMe = async (userId) => {
	const pool = await getPool();
	const r = await pool.request().input('uid', sql.VarChar(20), userId).query(`
    ${SELECT_SQL}
      AND (s.start_date IS NULL OR COALESCE(s.end_date, s.start_date) >= ${VN_TODAY}
           OR (p.id IS NOT NULL AND COALESCE(s.end_date, s.start_date) >= DATEADD(DAY, -180, ${VN_TODAY})))
    ORDER BY CASE WHEN s.start_date IS NULL THEN 1 ELSE 0 END, s.start_date, s.start_time, s.title`);
	return r.recordset.map(withActions);
};

const getForMe = async (seminarId, userId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('uid', sql.VarChar(20), userId)
		.input('sid', sql.VarChar(20), seminarId)
		.query(`${SELECT_SQL} AND s.id = @sid`);
	if (!r.recordset[0]) throw httpError(404, 'Không tìm thấy buổi tập huấn.');
	return withActions(r.recordset[0]);
};

const register = async (seminarId, userId) => {
	const t = await getForMe(seminarId, userId);
	if (t.registered) throw httpError(409, 'Bạn đã có trong danh sách buổi tập huấn này.');
	if (!t.open) throw httpError(409, 'Buổi tập huấn đã diễn ra, không đăng ký được nữa.');
	const { inserted } = await participantService.addUsers(seminarId, [userId], userId);
	if (!inserted) throw httpError(409, 'Bạn đã có trong danh sách buổi tập huấn này.');
	return getForMe(seminarId, userId);
};

const cancel = async (seminarId, userId) => {
	const t = await getForMe(seminarId, userId);
	if (!t.registered) throw httpError(404, 'Bạn chưa đăng ký buổi tập huấn này.');
	if (!t.can_cancel) {
		const why = t.required
			? 'khoa của bạn bắt buộc tham dự buổi này'
			: !t.self_registered
				? 'bạn được phòng Đào tạo thêm vào danh sách'
				: t.checked_in_at
					? 'bạn đã điểm danh'
					: 'đã tới ngày học';
		throw httpError(409, `Không hủy được đăng ký: ${why}.`);
	}
	await participantService.remove(seminarId, t.participant_id, userId);
	return getForMe(seminarId, userId);
};

module.exports = { listForMe, register, cancel };
