// Lượt chấm vân tay (attendanceDevices) → điểm danh theo ca của học viên (staff_attendance).
//   Chỉ học viên có tài khoản và đang học 1 khóa vào ngày đó (như nút điểm danh trên web);
//   phân hệ "Ca & điểm danh" (ATTENDANCE) tắt thì không ghi.
//   Gán lần ca + giờ vào/ra: utils/attendanceShift.assignPunches / mergeCheckTimes.
// Tính lại từ MỌI lượt chấm của học viên quanh những ngày vừa có lượt mới: lượt kéo lại từ máy
// về muộn, sai thứ tự vẫn ra đúng giờ vào (sớm nhất) / giờ ra (muộn nhất). Chỉ thêm / nới giờ,
// không xoá — chạy lại bao nhiêu lần cũng vậy.
const { getPool, sql, jsonValues } = require('../../config/db');
const logger = require('../../config/logger');
const { broadcast } = require('../events/eventService');
const systemSettingService = require('../settings/systemSettingService');
const shiftLogic = require('../../utils/attendanceShift');
const shiftService = require('./shiftService');

const dateKey = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

// Lần ca dài nhất 24h + ra muộn tối đa 12h ⇒ lượt chấm thuộc lần ca bắt đầu tối đa 2 ngày trước
const BACK_DAYS = 2;

// Lượt chấm [from, to + 2 ngày] (lần ca bắt đầu trong [from, to] có thể kéo sang 2 ngày sau),
// bản ghi / phân ca / lượt học từ 2 ngày trước from
const loadUser = async (pool, userId, from, to) => {
	const lo = shiftLogic.addDays(from, -BACK_DAYS);
	const hi = shiftLogic.addDays(to, BACK_DAYS);
	const [punches, existing, assignments, periods] = await Promise.all([
		pool
			.request()
			.input('user_id', sql.VarChar(20), userId)
			.input('from', sql.Date, from)
			.input('to', sql.Date, hi).query(`
        SELECT p.punched_at, p.device_id
        FROM attendance_punches p
        JOIN trainees t ON t.id = p.trainee_id
        WHERE t.user_id = @user_id
          AND p.punched_at >= (CAST(@from AS timestamp) - interval '7 hours')
          AND p.punched_at < (CAST(@to AS timestamp) + interval '17 hours')`),
		pool
			.request()
			.input('user_id', sql.VarChar(20), userId)
			.input('from', sql.Date, lo)
			.input('to', sql.Date, hi)
			.query(
				'SELECT * FROM staff_attendance WHERE user_id = @user_id AND work_date BETWEEN @from AND @to',
			),
		shiftService.assignmentsForUser(userId, lo, hi),
		shiftService.traineePeriods({ from: lo, to: hi, userId }),
	]);
	return {
		punches: punches.recordset.map((p) => ({ at: new Date(p.punched_at), device_id: p.device_id })),
		existing: existing.recordset.map((r) => ({ ...r, work_date: dateKey(r.work_date) })),
		assignments,
		periods,
	};
};

const writeGroup = async (pool, userId, g, record) => {
	const merged = shiftLogic.mergeCheckTimes(record, g.punches);
	if (!merged?.changed) return false;
	// Giờ ca chụp lúc tạo dòng (như web) — sửa ca về sau không đổi lịch sử đã ghi
	const inst = record?.shift_start_at
		? {
				start_at: new Date(record.shift_start_at),
				end_at: new Date(record.shift_end_at),
				grace_min: g.inst?.grace_min ?? 0,
			}
		: g.inst;
	const isShift = g.shift_id != null && !!inst;
	const req = pool
		.request()
		.input('in_at', sql.DateTime2, merged.in.at)
		.input('in_ip', sql.VarChar(45), merged.in.ip)
		.input('in_dist', sql.Int, merged.in.distance_m)
		.input('in_dev', sql.Int, merged.in.device_id)
		.input('out_at', sql.DateTime2, merged.out?.at ?? null)
		.input('out_ip', sql.VarChar(45), merged.out?.ip ?? null)
		.input('out_dist', sql.Int, merged.out?.distance_m ?? null)
		.input('out_dev', sql.Int, merged.out?.device_id ?? null)
		.input('late', sql.Int, isShift ? shiftLogic.lateMin(inst, merged.in.at) : null)
		.input(
			'early',
			sql.Int,
			isShift && merged.out ? shiftLogic.earlyMin(inst, merged.out.at) : null,
		);
	if (record) {
		await req.input('id', sql.Int, record.id).query(`
      UPDATE staff_attendance SET
        check_in_at = @in_at, check_in_ip = CAST(@in_ip AS inet), check_in_distance_m = @in_dist,
        check_in_device_id = @in_dev,
        check_out_at = @out_at, check_out_ip = CAST(@out_ip AS inet), check_out_distance_m = @out_dist,
        check_out_device_id = @out_dev,
        late_min = @late, early_min = @early, updated_at = (now() AT TIME ZONE 'UTC')
      WHERE id = @id`);
		return true;
	}
	const r = await req
		.input('user_id', sql.VarChar(20), userId)
		.input('work_date', sql.Date, g.work_date)
		.input('shift_id', sql.Int, g.shift_id)
		.input('shift_name', sql.NVarChar(100), g.inst?.name ?? null)
		.input('shift_code', sql.NVarChar(10), g.inst?.code ?? null)
		.input('shift_start_at', sql.DateTime2, g.inst?.start_at ?? null)
		.input('shift_end_at', sql.DateTime2, g.inst?.end_at ?? null)
		.input('course_id', sql.VarChar(20), g.course.course_id)
		.input('course_name', sql.NVarChar(255), g.course.course_name ?? null).query(`
      INSERT INTO staff_attendance (user_id, work_date, shift_id, shift_name, shift_code,
        shift_start_at, shift_end_at, course_id, course_name,
        check_in_at, check_in_ip, check_in_distance_m, check_in_device_id,
        check_out_at, check_out_ip, check_out_distance_m, check_out_device_id, late_min, early_min)
      VALUES (@user_id, @work_date, @shift_id, @shift_name, @shift_code,
        @shift_start_at, @shift_end_at, @course_id, @course_name,
        @in_at, CAST(@in_ip AS inet), @in_dist, @in_dev,
        @out_at, CAST(@out_ip AS inet), @out_dist, @out_dev, @late, @early)
      ON CONFLICT ON CONSTRAINT uq_staff_attendance_user_date_shift DO NOTHING
      RETURNING id`);
	// Vừa có người bấm trên web / máy khác ghi cùng lúc ⇒ đọc lại rồi gộp vào dòng đó
	if (!r.recordset.length) {
		const again = (
			await pool
				.request()
				.input('user_id', sql.VarChar(20), userId)
				.input('work_date', sql.Date, g.work_date)
				.input('shift_id', sql.Int, g.shift_id)
				.query(
					'SELECT * FROM staff_attendance WHERE user_id = @user_id AND work_date = @work_date AND shift_id IS NOT DISTINCT FROM @shift_id',
				)
		).recordset[0];
		return again ? writeGroup(pool, userId, g, again) : false;
	}
	return true;
};

/**
 * Tính lại điểm danh ca của 1 học viên cho các lần ca có lượt chấm trong [from, to] (ngày VN).
 * @returns {Promise<number>} số dòng thêm / sửa
 */
const syncUser = async (pool, userId, from, to, shared) => {
	const data = await loadUser(pool, userId, from, to);
	if (!data.punches.length || !data.periods.length) return 0;
	const groups = shiftLogic.assignPunches({
		punches: data.punches,
		courseOn: shiftService.courseResolver(data.periods, shared.patterns),
		assignments: data.assignments,
		shiftsById: shared.shiftsById,
		existing: data.existing,
	});
	let n = 0;
	for (const g of groups) {
		const record = data.existing.find(
			(r) => r.work_date === g.work_date && (r.shift_id ?? null) === g.shift_id,
		);
		if (await writeGroup(pool, userId, g, record ?? null)) n += 1;
	}
	return n;
};

// Phân hệ Ca & điểm danh mặc định TẮT: chỉ bật khi MODULE_ATTENDANCE = 'true'
// (như middlewares/moduleGuard — service không require middlewares)
const attendanceModuleOn = async () =>
	(await systemSettingService.getValue('MODULE_ATTENDANCE')) === 'true';

// [{ user_id, from, to }] → ghi lại; lỗi 1 người không chặn người khác
const syncUsers = async (pool, users) => {
	if (!users.length || !(await attendanceModuleOn())) return 0;
	const [patterns, shiftsById] = await Promise.all([
		shiftService.listPatterns(),
		shiftService.shiftsMap(),
	]);
	let changed = 0;
	for (const u of users) {
		try {
			changed += await syncUser(pool, u.user_id, dateKey(u.from), dateKey(u.to), {
				patterns,
				shiftsById,
			});
		} catch (e) {
			logger.error(
				`[attendance] Ghi điểm danh ca từ máy chấm công (${u.user_id}) lỗi: ${e.message}`,
			);
		}
	}
	if (changed) broadcast('update', { entity: 'staff_attendance' });
	return changed;
};

// Học viên (có tài khoản) + khoảng ngày VN của các lượt chấm, mở rộng 2 ngày trước
const USERS_SQL = (where) => `
  SELECT t.user_id,
         MIN(CAST(p.punched_at + interval '7 hours' AS date)) - ${BACK_DAYS} AS "from",
         MAX(CAST(p.punched_at + interval '7 hours' AS date)) AS "to"
  FROM attendance_punches p
  JOIN trainees t ON t.id = p.trainee_id
  WHERE t.user_id IS NOT NULL AND ${where}
  GROUP BY t.user_id`;

/** Sau khi ghép lượt chấm mới (punchMatcher đã điền trainee_id). */
const recordPunches = async (punchIds) => {
	if (!punchIds.length) return 0;
	const pool = await getPool();
	const users = (
		await pool
			.request()
			.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(punchIds))
			.query(USERS_SQL(`p.id IN ${jsonValues('@ids', { type: 'BIGINT' })}`))
	).recordset;
	return syncUsers(pool, users);
};

/** Ghi lại N ngày gần nhất — ca / phân ca / ghi danh có thể được tạo sau khi học viên đã chấm. */
const syncRecent = async (days) => {
	const pool = await getPool();
	const users = (
		await pool
			.request()
			.input('days', sql.Int, days)
			.query(USERS_SQL("p.punched_at >= (now() AT TIME ZONE 'UTC') - make_interval(days => @days)"))
	).recordset;
	return syncUsers(pool, users);
};

module.exports = { recordPunches, syncRecent };
