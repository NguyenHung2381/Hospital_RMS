/**
 * seminarDeviceImportService.js — Lấy danh sách người tham dự hội nghị (CHỈ cán bộ nội viện) từ
 * lượt chấm ở máy chấm công vân tay dành cho hội nghị (attendance_devices.purpose seminar / both).
 *
 * Luồng giống nhập Excel (seminarImportService): dry_run trả bản xem trước, ban tổ chức bỏ chọn
 * người không liên quan rồi xác nhận.
 *   - Lượt chấm trong khoảng giờ (mặc định: ngày / giờ hội nghị, mở sớm theo
 *     DEVICE_CHECKIN_EARLY_MIN) ở các máy được chọn, gom theo mã trên máy (PIN).
 *   - PIN = mã nhân viên ⇒ cán bộ đang làm việc (bỏ tài khoản dùng chung của khoa). Mã học viên /
 *     mã lạ ⇒ "không khớp", không nhập.
 *   - Xác nhận: thêm người chưa có (nội viện, vai trò đại biểu — tập huấn bệnh viện: học viên,
 *     tín chỉ mặc định của hội nghị), đánh dấu điểm danh bằng vân tay cho cả người mới lẫn người
 *     đã có (giờ = lần chấm sớm nhất, không đè QR / quét vé), gắn lượt chấm vào hội nghị
 *     (attendance_punches.seminar_id — như attendanceDevices/seminarPunchMatcher).
 * Chạy lại bao nhiêu lần cũng vậy: người đã có không thêm lại (ux_sp_seminar_user).
 */
const { getPool, sql, jsonValues } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const { httpError } = require('../../utils/httpError');
const { deptAccountJoinSql, isDeptAccountJoinedSql } = require('../../utils/deptAccount');
const attendanceMethods = require('../../utils/attendanceMethods');
const { getDeviceSettings } = require('../attendanceDevices/deviceSettings');
const { staffNumberFromPin } = require('../attendanceDevices/seminarPunchMatcher');
const devicePeople = require('../attendanceDevices/devicePeopleService');
const seminarParticipantService = require('./seminarParticipantService');

const MAX_WINDOW_DAYS = 31;
const LOCAL_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})$/;

// 'YYYY-MM-DDTHH:mm' giờ VN ⇄ Date
const fromLocal = (s) => {
	const m = LOCAL_RE.exec(String(s || '').trim());
	if (!m) return null;
	const d = new Date(`${m[1]}T${m[2]}:${m[3]}:00+07:00`);
	return Number.isNaN(d.getTime()) ? null : d;
};
const toLocal = (d) => new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 16);
// Date → chuỗi giờ UTC cho cột timestamp (không múi giờ) lưu giờ UTC
const utcText = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const dateKey = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);
const hhmm = (s) => (/^\d{1,2}:\d{2}/.test(String(s || '')) ? String(s).slice(0, 5).padStart(5, '0') : null);

/**
 * Khoảng giờ mặc định của hội nghị (hàm thuần): từ giờ bắt đầu − sớm (không ghi giờ: 00:00) ngày
 * đầu tới giờ kết thúc (không ghi giờ: 23:59) ngày cuối. null nếu hội nghị chưa có ngày.
 */
const defaultWindow = (seminar, earlyMin) => {
	const start = dateKey(seminar.start_date);
	if (!start) return null;
	const end = dateKey(seminar.end_date) ?? start;
	const from = fromLocal(`${start}T${hhmm(seminar.start_time) ?? '00:00'}`);
	const to = fromLocal(`${end}T${hhmm(seminar.end_time) ?? '23:59'}`);
	if (hhmm(seminar.start_time)) from.setTime(from.getTime() - earlyMin * 60000);
	// Phút cuối tính trọn (23:59:59)
	to.setTime(to.getTime() + 59999);
	return { from, to };
};

const loadSeminar = async (pool, id) => {
	const s = (
		await pool.request().input('id', sql.VarChar(20), id).query(`
      SELECT id, title, event_type, scope, start_date, end_date, start_time, end_time,
             grants_cme, cme_default_credits
      FROM seminars WHERE id = @id`)
	).recordset[0];
	if (!s) throw httpError(404, 'Hội thảo/hội nghị không tồn tại.');
	return s;
};

// Máy đang hoạt động dùng cho hội nghị
const loadDevices = async (pool) =>
	(
		await pool.request().query(`
      SELECT id, COALESCE(name, serial_no) AS name, serial_no, purpose, last_seen_at
      FROM attendance_devices
      WHERE status = 'active' AND purpose IN ('seminar', 'both')
      ORDER BY COALESCE(name, serial_no)`)
	).recordset;

// Lượt chấm gom theo PIN: lần đầu / lần cuối / số lượt / id lượt / máy của lần đầu
const loadPunchGroups = async (pool, deviceIds, from, to) =>
	(
		await pool
			.request()
			.input('devices', sql.NVarChar(sql.MAX), JSON.stringify(deviceIds))
			.input('from', sql.VarChar(19), utcText(from))
			.input('to', sql.VarChar(19), utcText(to)).query(`
      SELECT p.pin, MIN(p.punched_at) AS first_at, MAX(p.punched_at) AS last_at,
             CAST(COUNT(*) AS int) AS punches, jsonb_agg(p.id ORDER BY p.punched_at) AS ids,
             (array_agg(d.serial_no ORDER BY p.punched_at))[1] AS first_serial
      FROM attendance_punches p
      JOIN attendance_devices d ON d.id = p.device_id
      WHERE p.device_id IN ${jsonValues('@devices', { type: 'INT' })}
        AND p.punched_at >= CAST(@from AS timestamp) AND p.punched_at <= CAST(@to AS timestamp)
      GROUP BY p.pin
      ORDER BY MIN(p.punched_at)`)
	).recordset;

// Cán bộ đang làm việc theo mã nhân viên (bỏ tài khoản dùng chung của khoa)
const loadStaff = async (pool, staffNumbers) => {
	if (!staffNumbers.length) return new Map();
	const r = await pool.request().input('sns', sql.NVarChar(sql.MAX), JSON.stringify(staffNumbers))
		.query(`
      SELECT u.id, u.full_name, u.staff_number, u.date_of_birth, d.name AS department_name
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      ${deptAccountJoinSql('u')}
      WHERE u.is_active = 'true' AND NOT ${isDeptAccountJoinedSql('u')}
        AND u.staff_number IN ${jsonValues('@sns', { type: 'INT' })}`);
	return new Map(r.recordset.map((u) => [Number(u.staff_number), u]));
};

const loadParticipants = async (pool, seminarId) =>
	(
		await pool.request().input('sid', sql.VarChar(20), seminarId).query(`
      SELECT id, user_id, staff_number, full_name, checked_in_at, checkin_method
      FROM seminar_participants WHERE seminar_id = @sid`)
	).recordset;

// jsonb_agg: driver trả mảng hoặc chuỗi JSON tùy cấu hình kiểu — nhận cả hai
const parseIds = (v) => {
	let arr = v;
	if (typeof v === 'string') {
		try {
			arr = JSON.parse(v);
		} catch {
			arr = [];
		}
	}
	return (Array.isArray(arr) ? arr : []).map(Number).filter(Number.isFinite);
};

/**
 * Ghép nhóm lượt chấm với cán bộ / người đã có (hàm thuần — test riêng).
 * @returns {{ pin, first_at, last_at, punches, ids, first_serial, status: 'new'|'existing'|'unmatched',
 *   reason?: string, user: object|null, participant: object|null }[]}
 */
const classify = (groups, staffBySn, participants) => {
	const byUser = new Map(participants.filter((p) => p.user_id).map((p) => [p.user_id, p]));
	const bySn = new Map(
		participants.filter((p) => p.staff_number != null).map((p) => [Number(p.staff_number), p]),
	);
	return groups.map((g) => {
		const sn = staffNumberFromPin(g.pin);
		const user = sn != null ? (staffBySn.get(sn) ?? null) : null;
		const participant = (user && byUser.get(user.id)) || (sn != null && bySn.get(sn)) || null;
		const base = {
			pin: g.pin,
			first_at: g.first_at,
			last_at: g.last_at,
			punches: g.punches,
			ids: parseIds(g.ids),
			first_serial: g.first_serial,
			user: user && {
				id: user.id,
				full_name: user.full_name,
				staff_number: user.staff_number,
				department_name: user.department_name ?? null,
				date_of_birth: user.date_of_birth ?? null,
			},
			participant: participant && {
				id: participant.id,
				full_name: participant.full_name,
				checked_in_at: participant.checked_in_at,
				checkin_method: participant.checkin_method,
			},
		};
		if (participant) return { ...base, status: 'existing' };
		if (user) return { ...base, status: 'new' };
		return {
			...base,
			status: 'unmatched',
			reason: /^\d{8}$/.test(g.pin)
				? 'Mã học viên — chỉ nhập cán bộ nội viện'
				: sn == null
					? 'Mã trên máy không phải mã nhân viên'
					: 'Không có cán bộ đang làm việc mang mã nhân viên này',
		};
	});
};

// Bỏ trường nội bộ khỏi dòng xem trước
const publicRow = ({ ids: _ids, first_serial: _serial, user, ...r }) => ({
	...r,
	user: user && { ...user, date_of_birth: undefined },
});

const resolveWindow = (seminar, earlyMin, input) => {
	const def = defaultWindow(seminar, earlyMin);
	const from = input.from ? fromLocal(input.from) : def?.from;
	const to = input.to ? fromLocal(input.to) : def?.to;
	if (input.from && !from) throw httpError(400, 'Thời gian bắt đầu không hợp lệ.');
	if (input.to && !to) throw httpError(400, 'Thời gian kết thúc không hợp lệ.');
	if (!from || !to)
		throw httpError(400, 'Hội nghị chưa có ngày diễn ra — hãy chọn khoảng thời gian lấy lượt chấm.');
	if (to <= from) throw httpError(400, 'Thời gian kết thúc phải sau thời gian bắt đầu.');
	if (to - from > MAX_WINDOW_DAYS * 86400000)
		throw httpError(400, `Khoảng thời gian tối đa ${MAX_WINDOW_DAYS} ngày.`);
	return { from, to };
};

/**
 * @param {{ seminar_id: string, dry_run?: boolean, from?: string, to?: string,
 *   device_ids?: number[], pins?: string[] }} input  from/to: 'YYYY-MM-DDTHH:mm' giờ VN;
 *   pins: mã cần THÊM khi xác nhận (bỏ trống = mọi người khớp được)
 */
const importFromDevice = async (input, actorId) => {
	const pool = await getPool();
	const seminar = await loadSeminar(pool, input.seminar_id);
	const { earlyMin } = await getDeviceSettings();
	const window = resolveWindow(seminar, earlyMin, input);
	const methods = await attendanceMethods.forSeminarType(seminar.event_type);

	const devices = await loadDevices(pool);
	const wanted = Array.isArray(input.device_ids) && input.device_ids.length ? new Set(input.device_ids.map(Number)) : null;
	const deviceIds = devices.map((d) => d.id).filter((id) => !wanted || wanted.has(id));

	const groups = deviceIds.length ? await loadPunchGroups(pool, deviceIds, window.from, window.to) : [];
	const sns = [...new Set(groups.map((g) => staffNumberFromPin(g.pin)).filter((n) => n != null))];
	const rows = classify(groups, await loadStaff(pool, sns), await loadParticipants(pool, seminar.id));
	// Tên khai trên máy — giúp nhận ra mã không khớp (devicePeopleService)
	const deviceNames = await devicePeople.namesFor(deviceIds, rows.map((r) => r.pin));
	for (const r of rows) r.device_name = deviceNames.get(r.pin) ?? null;

	const warnings = [];
	if (!devices.length)
		warnings.push('Chưa có máy chấm công nào dùng cho hội nghị (trang Máy chấm công → mục đích "Hội nghị").');
	if (!methods.device)
		warnings.push(
			'Phương thức "Máy chấm công vân tay" đang tắt cho loại hội nghị này (Cấu hình hệ thống → Điểm danh) — chỉ xem được, không nhập được.',
		);
	const summary = {
		new: rows.filter((r) => r.status === 'new').length,
		existing: rows.filter((r) => r.status === 'existing').length,
		unmatched: rows.filter((r) => r.status === 'unmatched').length,
		punches: rows.reduce((n, r) => n + r.punches, 0),
	};
	const meta = {
		from: toLocal(window.from),
		to: toLocal(new Date(window.to.getTime() - 59999)),
		devices: devices.map((d) => ({ ...d, selected: deviceIds.includes(d.id) })),
		method_enabled: methods.device,
		summary,
		warnings,
	};
	if (input.dry_run) return { dry_run: true, ...meta, rows: rows.map(publicRow) };

	await attendanceMethods.assertSeminar(seminar.id, 'device');
	const pick = Array.isArray(input.pins) ? new Set(input.pins.map(String)) : null;
	const toAdd = rows.filter((r) => r.status === 'new' && (!pick || pick.has(r.pin)));
	const participationType =
		seminar.event_type === 'training' && seminar.scope === 'hosted' ? 'trainee' : 'attendee';
	const { inserted } = await seminarParticipantService.bulkAdd(
		seminar.id,
		toAdd.map((r) => ({
			user_id: r.user.id,
			full_name: r.user.full_name,
			staff_number: r.user.staff_number,
			dob: r.user.date_of_birth,
			department_raw: r.user.department_name,
			source: 'internal',
			participation_type: participationType,
			cme_credits: seminar.grants_cme ? seminar.cme_default_credits : null,
			notes: 'Nhập từ máy chấm công',
		})),
		actorId,
	);

	// Người vừa thêm + người đã có: điểm danh bằng vân tay, gắn lượt chấm vào hội nghị
	const participants = await loadParticipants(pool, seminar.id);
	const pidByUser = new Map(participants.filter((p) => p.user_id).map((p) => [p.user_id, p.id]));
	let checkedIn = 0;
	let linked = 0;
	for (const r of rows) {
		const added = toAdd.includes(r);
		const pid = r.participant?.id ?? (added ? pidByUser.get(r.user.id) : null);
		if (!pid) continue;
		const upd = await pool
			.request()
			.input('pid', sql.VarChar(24), pid)
			.input('at', sql.DateTime2, new Date(r.first_at))
			.input('tag', sql.VarChar(64), `zk:${r.first_serial}`).query(`
        UPDATE seminar_participants
        SET checked_in_at = @at, checkin_method = 'device', checkin_device_id = @tag
        WHERE id = @pid
          AND (checked_in_at IS NULL OR (checkin_method = 'device' AND checked_in_at > @at))
        RETURNING id`);
		checkedIn += upd.recordset.length;
		const ln = await pool
			.request()
			.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(r.ids))
			.input('sid', sql.VarChar(20), seminar.id)
			.input('pid', sql.VarChar(24), pid).query(`
        UPDATE attendance_punches SET seminar_id = @sid, seminar_participant_id = @pid
        WHERE id IN ${jsonValues('@ids', { type: 'BIGINT' })} AND seminar_id IS NULL
        RETURNING id`);
		linked += ln.recordset.length;
	}
	broadcast('update', { entity: 'seminar' });
	if (linked) broadcast('update', { entity: 'attendance_punch' });
	return { dry_run: false, inserted, checked_in: checkedIn, linked_punches: linked, warnings };
};

module.exports = { importFromDevice, classify, defaultWindow, fromLocal, toLocal };
