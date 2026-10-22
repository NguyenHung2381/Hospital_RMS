const { getPool, sql } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const attendancePolicy = require('../../utils/attendancePolicy');
const shiftLogic = require('../../utils/attendanceShift');
const shiftService = require('./shiftService');
const { normalizeIp } = require('../../utils/activityDescribe');
const { todayKeyVN } = require('../../utils/vnDate');
const { badRequest } = require('../../utils/httpError');

// Chấm công HỌC VIÊN theo khóa đào tạo (2026-10-29_staff_attendance.sql +
// 2026-10-30_attendance_shifts.sql + 2026-11-30_trainee_attendance.sql). Tên bảng
// staff_attendance giữ từ thời chấm công nhân viên.
// Chỉ tài khoản học viên, trong những ngày đang học 1 khóa (shiftService.traineePeriods),
// mới chấm được. Ca theo phân ca ngày, không có thì theo mẫu ca tuần của khóa.
// 1 dòng / học viên / ca / ngày bắt đầu ca. Lần bấm đầu = giờ vào, các lần sau = giờ ra (lần cuối).
// Ca nào đang được bấm: utils/attendanceShift.js. Không có lịch ca → 1 dòng/ngày (shift_id NULL).
// Điều kiện vị trí ở utils/attendancePolicy.js (IP bệnh viện VÀ GPS trong bán kính).

const dateKey = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const WEEK_AHEAD = 7;

// Ca để hiển thị / gửi về client (bỏ trường nội bộ)
const publicOption = (o) => ({
	shift_id: o.shift_id,
	work_date: o.work_date,
	action: o.action,
	course_id: o.course_id ?? null,
	course_name: o.course_name ?? null,
	name: o.name ?? null,
	code: o.code ?? null,
	color: o.color ?? null,
	start_time: o.start_time ?? null,
	end_time: o.end_time ?? null,
	start_at: o.start_at ?? null,
	end_at: o.end_at ?? null,
});

// Hồ sơ học viên + khóa đang học + phân ca + ca + bản ghi gần đây của 1 tài khoản
const loadContext = async (userId) => {
	const today = todayKeyVN();
	const from = shiftLogic.addDays(today, -2);
	const to = shiftLogic.addDays(today, WEEK_AHEAD);
	const pool = await getPool();
	const [trainee, periods, patterns, assignments, shiftsById, records] = await Promise.all([
		pool
			.request()
			.input('user_id', sql.VarChar(20), userId)
			.query('SELECT TOP 1 id, full_name FROM trainees WHERE user_id = @user_id'),
		shiftService.traineePeriods({ from, to, userId }),
		shiftService.listPatterns(),
		shiftService.assignmentsForUser(userId, from, to),
		shiftService.shiftsMap(),
		pool
			.request()
			.input('user_id', sql.VarChar(20), userId)
			.query(
				'SELECT TOP 60 * FROM staff_attendance WHERE user_id = @user_id AND course_id IS NOT NULL ORDER BY work_date DESC, check_in_at DESC',
			),
	]);
	return {
		today,
		trainee: trainee.recordset[0] ?? null,
		courseOn: shiftService.courseResolver(periods, patterns),
		assignments,
		shiftsById,
		records: records.recordset.map((r) => ({ ...r, work_date: dateKey(r.work_date) })),
	};
};

// Gọi được với mọi tài khoản (Cấu hình hệ thống dùng client_ip); không phải học viên → is_trainee false
const getMine = async (userId, ip) => {
	const [ctx, policy] = await Promise.all([loadContext(userId), attendancePolicy.getPolicy()]);
	const { today, trainee, courseOn, assignments, shiftsById, records } = ctx;
	// Lịch 7 ngày tới: course_id null = không học khóa nào; shifts null = không có lịch ca (chấm tự do)
	const week = Array.from({ length: WEEK_AHEAD }, (_, i) => {
		const date = shiftLogic.addDays(today, i);
		const course = trainee ? courseOn(date) : null;
		const day = course && shiftLogic.shiftIdsForDay(course.pattern, assignments, date);
		return {
			date,
			course_id: course?.course_id ?? null,
			course_name: course?.course_name ?? null,
			source: day?.source ?? null,
			shifts: day
				? day.shiftIds
						.map((id) => shiftsById.get(id))
						.filter(Boolean)
						.map((s) => shiftLogic.instanceOf(s, date))
						.sort((a, b) => a.start_at - b.start_at)
						.map(publicOption)
				: null,
		};
	});
	const current = trainee ? courseOn(today) : null;
	return {
		is_trainee: !!trainee,
		options: trainee
			? shiftLogic.checkOptions({ courseOn, assignments, shiftsById, records }).map(publicOption)
			: [],
		recent: records.filter((r) => r.work_date >= shiftLogic.addDays(today, -1)),
		history: records,
		week,
		current_course: current && {
			course_id: current.course_id,
			course_name: current.course_name,
			pattern_name: current.pattern?.name ?? null,
		},
		client_ip: normalizeIp(ip),
		ip_ok: policy.ipRanges.length ? attendancePolicy.ipAllowed(ip, policy.ipRanges) : false,
		configured: policy.ipRanges.length > 0 && !!policy.location,
		radius_m: policy.radiusM,
	};
};

const fmtTime = (o) =>
	o.start_time ? `${o.name} ${o.start_time}–${o.end_time}` : 'chấm công tự do';

// Chọn ca được bấm: client gửi (shift_id, work_date) khi có nhiều lựa chọn
const pickOption = (options, choice) => {
	if (choice.work_date) {
		const o = options.find(
			(x) => x.work_date === choice.work_date && (x.shift_id ?? null) === (choice.shift_id ?? null),
		);
		if (!o)
			throw badRequest(
				'Ca này hiện không trong giờ được chấm công. Tải lại trang để xem ca hiện có.',
			);
		return o;
	}
	if (options.length === 1) return options[0];
	if (!options.length) throw badRequest('Hiện không có ca nào trong giờ được chấm công');
	throw badRequest(
		`Có ${options.length} ca có thể chấm lúc này (${options.map(fmtTime).join('; ')}) — chọn ca cần chấm`,
	);
};

const check = async (userId, { ip, lat, lng, accuracy, shift_id, work_date }) => {
	const [ctx, policy] = await Promise.all([loadContext(userId), attendancePolicy.getPolicy()]);
	if (!ctx.trainee) throw badRequest('Chấm công chỉ dành cho tài khoản học viên');
	const now = new Date();
	const options = shiftLogic.checkOptions({ ...ctx, now });
	const result = attendancePolicy.evaluate(policy, { ip, lat, lng, accuracy });
	let option;
	try {
		if (!options.length && !ctx.courseOn(shiftLogic.dateKeyVN(now)))
			throw badRequest('Hôm nay bạn không có khóa học nào đang diễn ra nên không cần chấm công');
		option = pickOption(options, { shift_id, work_date });
	} catch (err) {
		result.reasons.unshift(err.message);
	}
	if (result.reasons.length)
		throw badRequest(result.reasons.join('. '), { reasons: result.reasons });

	const isShift = option.shift_id != null;
	const pool = await getPool();
	// MERGE trên UNIQUE(user_id, work_date, shift_id): bấm 2 lần cùng lúc không tạo 2 dòng.
	// Giờ ca + khóa học chụp lại lúc chấm vào — sửa ca / khóa về sau không đổi lịch sử.
	const row = (
		await pool
			.request()
			.input('user_id', sql.VarChar(20), userId)
			.input('work_date', sql.Date, option.work_date)
			.input('shift_id', sql.Int, option.shift_id)
			.input('shift_name', sql.NVarChar(100), option.name ?? null)
			.input('shift_code', sql.NVarChar(10), option.code ?? null)
			.input('shift_start_at', sql.DateTime2, option.start_at ?? null)
			.input('shift_end_at', sql.DateTime2, option.end_at ?? null)
			.input('course_id', sql.VarChar(20), option.course_id)
			.input('course_name', sql.NVarChar(255), option.course_name ?? null)
			.input('late', sql.Int, isShift ? shiftLogic.lateMin(option, now) : null)
			.input('early', sql.Int, isShift ? shiftLogic.earlyMin(option, now) : null)
			.input('now', sql.DateTime2, now)
			.input('ip', sql.VarChar(45), normalizeIp(ip))
			.input('distance', sql.Int, result.distance_m).query(`
        MERGE staff_attendance WITH (HOLDLOCK) AS t
        USING (SELECT @user_id AS user_id, @work_date AS work_date, @shift_id AS shift_id) AS s
          ON t.user_id = s.user_id AND t.work_date = s.work_date
             AND (t.shift_id = s.shift_id OR (t.shift_id IS NULL AND s.shift_id IS NULL))
        WHEN MATCHED THEN UPDATE SET check_out_at = @now, check_out_ip = @ip, check_out_distance_m = @distance, early_min = @early
        WHEN NOT MATCHED THEN INSERT
          (user_id, work_date, shift_id, shift_name, shift_code, shift_start_at, shift_end_at,
           course_id, course_name, check_in_at, check_in_ip, check_in_distance_m, late_min)
          VALUES (@user_id, @work_date, @shift_id, @shift_name, @shift_code, @shift_start_at, @shift_end_at,
           @course_id, @course_name, @now, @ip, @distance, @late)
        OUTPUT inserted.*, $action AS merge_action;
      `)
	).recordset[0];
	broadcast('update', { entity: 'staff_attendance' });
	const { merge_action, ...record } = row;
	return { action: merge_action === 'INSERT' ? 'check_in' : 'check_out', record };
};

// Bảng chấm công học viên 1 ngày (theo ngày bắt đầu ca) cho quản trị: các lượt đã chấm +
// các ca được xếp mà chưa chấm. Lọc khóa / khoa / tìm tên làm ở client.
// Xem phạm vi khoa (staff_attendance:read@department): chỉ học viên thuộc khoa của actor.
const getByDate = async (dateArg, actor) => {
	const date = dateArg || todayKeyVN();
	const dept = shiftService.deptLimit(actor, 'read');
	if (dept === null) return [];
	const pool = await getPool();
	const req = pool.request().input('date', sql.Date, date);
	if (dept !== undefined) req.input('dept', sql.VarChar(20), String(dept));
	const [records, plan] = await Promise.all([
		req.query(`
      SELECT a.*, t.id AS trainee_id, t.full_name, d.name AS department_name
      FROM staff_attendance a
      CROSS APPLY (SELECT TOP 1 * FROM trainees WHERE user_id = a.user_id) t
      LEFT JOIN departments d ON d.id = t.department_id
      WHERE a.work_date = @date AND a.course_id IS NOT NULL${dept !== undefined ? ' AND t.department_id = @dept' : ''}
    `),
		shiftService.planForDate(date, dept),
	]);
	const rows = records.recordset.map((r) => ({
		...r,
		key: `r${r.id}`,
		work_date: date,
		status: 'checked',
	}));
	const done = new Set(rows.map((r) => `${r.user_id}|${r.shift_id ?? ''}`));
	for (const u of plan.trainees) {
		const course = shiftService.courseResolver(u.periods, plan.patterns)(date);
		if (!course) continue;
		const day = shiftLogic.shiftIdsForDay(
			course.pattern,
			plan.assignments.filter((a) => a.user_id === u.id),
			date,
		);
		for (const id of day?.shiftIds ?? []) {
			const shift = plan.shifts.get(id);
			if (!shift || done.has(`${u.id}|${id}`)) continue;
			const inst = shiftLogic.instanceOf(shift, date);
			rows.push({
				key: `p${u.id}|${id}`,
				user_id: u.id,
				trainee_id: u.trainee_id,
				full_name: u.full_name,
				department_name: u.department_name,
				course_id: course.course_id,
				course_name: course.course_name,
				work_date: date,
				shift_id: id,
				shift_name: shift.name,
				shift_code: shift.code,
				shift_start_at: inst.start_at,
				shift_end_at: inst.end_at,
				check_in_at: null,
				check_out_at: null,
				// Hết ca mà chưa chấm vào = vắng; chưa hết ca = chưa chấm
				status: Date.now() > inst.end_at.getTime() ? 'absent' : 'pending',
			});
		}
	}
	const t = (r) => new Date(r.shift_start_at ?? r.check_in_at).getTime();
	return rows.sort((a, b) => t(a) - t(b) || a.full_name.localeCompare(b.full_name, 'vi'));
};

module.exports = { getMine, check, getByDate };
