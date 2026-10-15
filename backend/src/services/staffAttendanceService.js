const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const attendancePolicy = require('../utils/attendancePolicy');
const { normalizeIp } = require('../utils/activityDescribe');
const { todayKeyVN } = require('../utils/vnDate');

// Chấm công hằng ngày (2026-10-29_staff_attendance.sql) — 1 dòng/người/ngày.
// Lần bấm đầu trong ngày = giờ vào, các lần sau = cập nhật giờ ra (lần cuối).
// Điều kiện hợp lệ ở utils/attendancePolicy.js (IP bệnh viện VÀ GPS trong bán kính).

const badRequest = (message, reasons) => Object.assign(new Error(message), { statusCode: 400, reasons });

const getMine = async (userId, ip) => {
	const pool = await getPool();
	const history = (
		await pool
			.request()
			.input('user_id', sql.VarChar(20), userId)
			.query(`
        SELECT TOP 31 * FROM staff_attendance WHERE user_id = @user_id ORDER BY work_date DESC
      `)
	).recordset;
	const today = todayKeyVN();
	const policy = await attendancePolicy.getPolicy();
	return {
		today: history.find((r) => r.work_date?.toISOString?.().slice(0, 10) === today) ?? null,
		history,
		client_ip: normalizeIp(ip),
		ip_ok: policy.ipRanges.length ? attendancePolicy.ipAllowed(ip, policy.ipRanges) : false,
		configured: policy.ipRanges.length > 0 && !!policy.location,
		radius_m: policy.radiusM,
	};
};

const check = async (userId, { ip, lat, lng, accuracy }) => {
	const result = attendancePolicy.evaluate(await attendancePolicy.getPolicy(), { ip, lat, lng, accuracy });
	if (!result.ok) throw badRequest(result.reasons.join('. '), result.reasons);

	const pool = await getPool();
	// MERGE trên UNIQUE(user_id, work_date): bấm 2 lần cùng lúc không tạo 2 dòng.
	const row = (
		await pool
			.request()
			.input('user_id', sql.VarChar(20), userId)
			.input('work_date', sql.Date, todayKeyVN())
			.input('now', sql.DateTime2, new Date())
			.input('ip', sql.VarChar(45), normalizeIp(ip))
			.input('distance', sql.Int, result.distance_m)
			.query(`
        MERGE staff_attendance WITH (HOLDLOCK) AS t
        USING (SELECT @user_id AS user_id, @work_date AS work_date) AS s
          ON t.user_id = s.user_id AND t.work_date = s.work_date
        WHEN MATCHED THEN UPDATE SET check_out_at = @now, check_out_ip = @ip, check_out_distance_m = @distance
        WHEN NOT MATCHED THEN INSERT (user_id, work_date, check_in_at, check_in_ip, check_in_distance_m)
          VALUES (@user_id, @work_date, @now, @ip, @distance)
        OUTPUT inserted.*, $action AS merge_action;
      `)
	).recordset[0];
	broadcast('update', { entity: 'staff_attendance' });
	const { merge_action, ...record } = row;
	return { action: merge_action === 'INSERT' ? 'check_in' : 'check_out', record };
};

// Bảng chấm công 1 ngày cho quản trị — lọc khoa/tìm tên làm ở client (1 ngày ít dòng)
const getByDate = async (date) => {
	const pool = await getPool();
	return (
		await pool
			.request()
			.input('date', sql.Date, date || todayKeyVN())
			.query(`
        SELECT a.*, u.full_name, u.staff_number, d.name AS department_name
        FROM staff_attendance a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE a.work_date = @date
        ORDER BY a.check_in_at
      `)
	).recordset;
};

module.exports = { getMine, check, getByDate };
