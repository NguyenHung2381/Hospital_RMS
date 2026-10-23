const { getPool, sql } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const notificationService = require('../notifications/notificationService');
const { findActiveUserIdsWhere } = require('../access/permissionService');
const { hasPermission, scopeOf } = require('../../permissions/authz');
const shiftLogic = require('../../utils/attendanceShift');
const leavePolicy = require('../../utils/leavePolicy');
const shiftService = require('./shiftService');
const { todayKeyVN, fmtDateVN } = require('../../utils/vnDate');
const { badRequest, conflict, notFound } = require('../../utils/httpError');

// Đơn xin phép của học viên (2026-12-02_attendance_leave_requests.sql): xin nghỉ
// (1 hoặc nhiều ngày, cả ngày hoặc 1 ca) hoặc xin đi muộn (1 ngày, kèm giờ dự kiến có mặt).
// Học viên gửi → người có staff_attendance:approve (theo phạm vi khoa) duyệt / từ chối.
// Đơn đã duyệt hiện "Nghỉ có phép" / "Muộn có phép" ở bảng điểm danh (staffAttendanceService.getByDate).

// Giới hạn ngày nộp bù / xin trước / độ dài đơn: Cấu hình hệ thống (utils/leavePolicy.js)
const TYPE_TEXT = { absent: 'xin nghỉ', late: 'xin đi muộn' };

const changed = () => broadcast('update', { entity: 'attendance_leave' });
const dateKey = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const normalize = (r) => ({ ...r, from_date: dateKey(r.from_date), to_date: dateKey(r.to_date) });
const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

// "ngày 05/12" hoặc "05/12 – 07/12" (+ ca) để ghi vào thông báo
const periodText = (r) => {
	const from = fmtDateVN(r.from_date);
	const range = r.from_date === r.to_date ? `ngày ${from}` : `${from} – ${fmtDateVN(r.to_date)}`;
	return r.shift_name ? `${range} (${r.shift_name})` : range;
};

// ─── Người duyệt ─────────────────────────────────────────────────────────────
// Tài khoản có quyền duyệt toàn viện + tài khoản duyệt phạm vi khoa cùng khoa với học viên
const approversFor = async (departmentId) => {
	const canApprove = (u, scope) =>
		hasPermission(u, 'staff_attendance', 'approve') &&
		scopeOf(u, 'staff_attendance', 'approve') === scope;
	const [all, deptScoped] = await Promise.all([
		findActiveUserIdsWhere((u) => canApprove(u, 'all')),
		departmentId ? findActiveUserIdsWhere((u) => canApprove(u, 'department')) : [],
	]);
	if (!deptScoped.length) return all;
	const pool = await getPool();
	const sameDept = (
		await pool
			.request()
			.input('dept', sql.VarChar(20), String(departmentId))
			.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(deptScoped))
			.query(
				'SELECT id FROM users WHERE department_id = @dept AND id IN (SELECT [value] FROM OPENJSON(@ids))',
			)
	).recordset.map((r) => r.id);
	return [...new Set([...all, ...sameDept])];
};

// ─── Học viên ────────────────────────────────────────────────────────────────
const SELECT_MINE = `
  SELECT r.*, u.full_name AS reviewer_name
  FROM attendance_leave_requests r
  LEFT JOIN users u ON u.id = r.reviewed_by
`;

const listMine = async (userId) => {
	const pool = await getPool();
	const rows = (
		await pool
			.request()
			.input('user_id', sql.VarChar(20), userId)
			.query(
				`${SELECT_MINE} WHERE r.user_id = @user_id ORDER BY r.from_date DESC, r.created_at DESC
         OFFSET 0 ROWS FETCH NEXT 200 ROWS ONLY`,
			)
	).recordset;
	return rows.map(normalize);
};

/**
 * @param {string} userId
 * @param {{ type: 'absent'|'late', from_date: string, to_date?: string, shift_id?: number|null,
 *           arrive_time?: string|null, reason: string }} body
 */
const createMine = async (userId, body) => {
	const type = body.type;
	const from = body.from_date;
	const to = type === 'late' ? from : body.to_date || from;
	const shiftId = body.shift_id ?? null;
	const reason = String(body.reason ?? '').trim();
	const today = todayKeyVN();

	const policy = await leavePolicy.getPolicy();
	if (!policy.enabled) throw badRequest('Quản trị đã tắt chức năng gửi đơn xin phép');
	if (to < from) throw badRequest('"Đến ngày" phải sau hoặc bằng "Từ ngày"');
	if (from < shiftLogic.addDays(today, -policy.backdateDays))
		throw badRequest(
			policy.backdateDays
				? `Chỉ được nộp bổ sung đơn cho ngày đã qua tối đa ${policy.backdateDays} ngày`
				: 'Không được nộp đơn cho ngày đã qua',
		);
	if (to > shiftLogic.addDays(today, policy.aheadDays))
		throw badRequest(`Chỉ được xin phép trước tối đa ${policy.aheadDays} ngày`);
	if (daysBetween(from, to) + 1 > policy.maxSpanDays)
		throw badRequest(`Một đơn xin nghỉ tối đa ${policy.maxSpanDays} ngày`);
	if (shiftId != null && from !== to) throw badRequest('Chỉ chọn ca khi xin phép trong 1 ngày');
	if (type === 'late' && !body.arrive_time) throw badRequest('Nhập giờ dự kiến có mặt');
	if (reason.length < 5) throw badRequest('Lý do tối thiểu 5 ký tự');

	const pool = await getPool();
	const [trainee, periods, patterns, shiftsById, assignments] = await Promise.all([
		pool
			.request()
			.input('user_id', sql.VarChar(20), userId)
			.query('SELECT TOP 1 id, full_name, department_id FROM trainees WHERE user_id = @user_id'),
		shiftService.traineePeriods({ from, to, userId }),
		shiftService.listPatterns(),
		shiftService.shiftsMap(),
		shiftService.assignmentsForUser(userId, from, from),
	]);
	const me = trainee.recordset[0];
	if (!me) throw badRequest('Đơn xin phép chỉ dành cho tài khoản học viên');
	const courseOn = shiftService.courseResolver(periods, patterns);
	// Khóa của ngày đầu tiên có học trong khoảng xin nghỉ (bản chụp)
	let course = null;
	for (let d = from; d <= to && !course; d = shiftLogic.addDays(d, 1)) course = courseOn(d);
	if (!course) throw badRequest('Khoảng ngày này bạn không có khóa học nào đang diễn ra');

	let shiftName = null;
	if (shiftId != null) {
		const shift = shiftsById.get(shiftId);
		if (!shift) throw badRequest('Ca không tồn tại hoặc đã ngừng dùng');
		const day =
			courseOn(from) && shiftLogic.shiftIdsForDay(courseOn(from).pattern, assignments, from);
		if (day && !day.shiftIds.includes(shiftId))
			throw badRequest(`Ngày ${fmtDateVN(from)} bạn không có ca ${shift.name}`);
		shiftName = `${shift.name} (${shift.start_time}–${shift.end_time})`;
	}

	// Trùng đơn đang chờ / đã duyệt: cùng ngày và (cả ngày hoặc cùng ca)
	const dup = (
		await pool
			.request()
			.input('user_id', sql.VarChar(20), userId)
			.input('from', sql.Date, from)
			.input('to', sql.Date, to)
			.input('shift_id', sql.Int, shiftId).query(`
        SELECT TOP 1 id, status FROM attendance_leave_requests
        WHERE user_id = @user_id AND status IN ('pending', 'approved')
          AND from_date <= @to AND to_date >= @from
          AND (shift_id IS NULL OR @shift_id IS NULL OR shift_id = @shift_id)
      `)
	).recordset[0];
	if (dup)
		throw conflict(
			`Bạn đã có đơn ${dup.status === 'approved' ? 'đã được duyệt' : 'đang chờ duyệt'} trùng thời gian này`,
		);

	const row = (
		await pool
			.request()
			.input('user_id', sql.VarChar(20), userId)
			.input('type', sql.VarChar(10), type)
			.input('from', sql.Date, from)
			.input('to', sql.Date, to)
			.input('shift_id', sql.Int, shiftId)
			.input('shift_name', sql.NVarChar(100), shiftName)
			.input('arrive_time', sql.Char(5), type === 'late' ? body.arrive_time : null)
			.input('reason', sql.NVarChar(1000), reason)
			.input('course_id', sql.VarChar(20), course.course_id)
			.input('course_name', sql.NVarChar(255), course.course_name ?? null)
			.input('now', sql.DateTime2, new Date()).query(`
        INSERT INTO attendance_leave_requests
          (user_id, type, from_date, to_date, shift_id, shift_name, arrive_time, reason,
           course_id, course_name, status, created_at, created_by)
        OUTPUT inserted.*
        VALUES (@user_id, @type, @from, @to, @shift_id, @shift_name, @arrive_time, @reason,
           @course_id, @course_name, 'pending', @now, @user_id)
      `)
	).recordset[0];
	const saved = normalize(row);
	changed();

	const approvers = (await approversFor(me.department_id)).filter((id) => id !== userId);
	await notificationService.push(
		'leave_request_submitted',
		`${me.full_name} gửi đơn ${TYPE_TEXT[type]} ${periodText(saved)}`,
		approvers,
		{
			message: `Lý do: ${reason}${type === 'late' ? ` — dự kiến có mặt lúc ${body.arrive_time}` : ''}`,
			refId: String(saved.id),
			refType: 'leave_request',
		},
	);
	return saved;
};

// Học viên tự huỷ đơn còn chờ duyệt
const cancelMine = async (userId, id) => {
	const pool = await getPool();
	const res = await pool
		.request()
		.input('id', sql.Int, id)
		.input('user_id', sql.VarChar(20), userId).query(`
      UPDATE attendance_leave_requests
      SET status = 'cancelled', updated_at = GETDATE(), updated_by = @user_id
      WHERE id = @id AND user_id = @user_id AND status = 'pending'
    `);
	if (!res.rowsAffected[0]) throw conflict('Chỉ huỷ được đơn của bạn đang chờ duyệt');
	changed();
};

// ─── Quản trị ────────────────────────────────────────────────────────────────
// Phạm vi khoa khi xem danh sách: theo quyền duyệt nếu có, không thì theo quyền xem bảng điểm danh
const listLimit = (actor) =>
	shiftService.deptLimit(
		actor,
		hasPermission(actor, 'staff_attendance', 'approve') ? 'approve' : 'read',
	);

const SELECT_ADMIN = `
  SELECT r.*, t.id AS trainee_id, t.full_name, t.department_id, d.name AS department_name,
         u.full_name AS reviewer_name
  FROM attendance_leave_requests r
  CROSS APPLY (SELECT TOP 1 id, full_name, department_id FROM trainees WHERE user_id = r.user_id) t
  LEFT JOIN departments d ON d.id = t.department_id
  LEFT JOIN users u ON u.id = r.reviewed_by
`;

/** @param {{ status?: string, from?: string, to?: string }} filter */
const list = async ({ status, from, to }, actor) => {
	const dept = listLimit(actor);
	if (dept === null) return [];
	const pool = await getPool();
	const req = pool.request();
	const where = [];
	if (status) {
		req.input('status', sql.VarChar(10), status);
		where.push('r.status = @status');
	}
	if (from) {
		req.input('from', sql.Date, from);
		where.push('r.to_date >= @from');
	}
	if (to) {
		req.input('to', sql.Date, to);
		where.push('r.from_date <= @to');
	}
	if (dept !== undefined) {
		req.input('dept', sql.VarChar(20), String(dept));
		where.push('t.department_id = @dept');
	}
	const rows = (
		await req.query(`
      ${SELECT_ADMIN}
      WHERE 1 = 1 ${where.map((w) => `AND ${w}`).join(' ')}
      ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.from_date DESC, r.created_at DESC
      OFFSET 0 ROWS FETCH NEXT 1000 ROWS ONLY
    `)
	).recordset;
	return rows.map(normalize);
};

/**
 * @param {number|string} id
 * @param {{ decision: 'approved'|'rejected', note?: string }} body
 * @param {any} actor
 */
const review = async (id, { decision, note }, actor) => {
	const reviewNote = String(note ?? '').trim() || null;
	if (decision === 'rejected' && !reviewNote) throw badRequest('Nhập lý do từ chối');
	const dept = shiftService.deptLimit(actor, 'approve');
	const pool = await getPool();
	const current = (
		await pool.request().input('id', sql.Int, id).query(`${SELECT_ADMIN} WHERE r.id = @id`)
	).recordset[0];
	// Ngoài phạm vi khoa coi như không tồn tại
	if (
		!current ||
		dept === null ||
		(dept !== undefined && String(current.department_id) !== String(dept))
	)
		throw notFound('Không tìm thấy đơn xin phép');
	if (current.status !== 'pending') throw conflict('Đơn này đã được xử lý');
	if (current.user_id === actor.id) throw badRequest('Không tự duyệt đơn của chính mình');

	const res = await pool
		.request()
		.input('id', sql.Int, id)
		.input('status', sql.VarChar(10), decision)
		.input('note', sql.NVarChar(500), reviewNote)
		.input('actor_id', sql.VarChar(20), actor.id)
		.input('now', sql.DateTime2, new Date()).query(`
      UPDATE attendance_leave_requests
      SET status = @status, review_note = @note, reviewed_by = @actor_id, reviewed_at = @now,
          updated_at = GETDATE(), updated_by = @actor_id
      WHERE id = @id AND status = 'pending'
    `);
	if (!res.rowsAffected[0]) throw conflict('Đơn này đã được xử lý');
	changed();

	const r = normalize(current);
	const verdict = decision === 'approved' ? 'đã được duyệt' : 'bị từ chối';
	await notificationService.push(
		'leave_request_reviewed',
		`Đơn ${TYPE_TEXT[r.type]} ${periodText(r)} ${verdict}`,
		[r.user_id],
		{ message: reviewNote, refId: String(id), refType: 'leave_request' },
	);
	return { ...r, status: decision, review_note: reviewNote, reviewed_by: actor.id };
};

// Đơn chờ duyệt / đã duyệt phủ 1 ngày (bảng điểm danh), có phạm vi khoa
const coveringDate = async (date, dept) => {
	const pool = await getPool();
	const req = pool.request().input('date', sql.Date, date);
	if (dept !== undefined) req.input('dept', sql.VarChar(20), String(dept));
	const rows = (
		await req.query(`
      ${SELECT_ADMIN}
      WHERE r.status IN ('pending', 'approved') AND @date BETWEEN r.from_date AND r.to_date
      ${dept !== undefined ? 'AND t.department_id = @dept' : ''}
    `)
	).recordset;
	return rows.map(normalize);
};

module.exports = { listMine, createMine, cancelMine, list, review, coveringDate };
