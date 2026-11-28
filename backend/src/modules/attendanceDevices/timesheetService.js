// Bảng công từ lượt chấm vân tay: mỗi người (PIN) mỗi ngày một dòng — giờ vào (lượt đầu),
// giờ ra (lượt cuối), số lượt, kèm điểm danh theo ca (vào / ra / muộn / sớm của từng ca). Xem trên trang Máy chấm công (tab Bảng công) và xuất Excel.
// punched_at lưu UTC ⇒ đổi sang giờ VN ngay trong SQL và trả chuỗi, tránh lệch múi giờ ở JS.
const { getPool, sql, jsonValues } = require('../../config/db');
const { httpError } = require('../../utils/httpError');
const { trainingDeviceSql } = require('./devicePurpose');

const MAX_DAYS = 93;
const MAX_DAY_ROWS = 5000;
const MAX_PUNCH_ROWS = 50000;

const DAY_MS = 24 * 3600 * 1000;

/** @param {{ from?: string, to?: string }} q */
const assertRange = ({ from, to }) => {
	if (!from || !to) throw httpError(400, 'Chọn khoảng ngày cần xem');
	const span = (Date.parse(to) - Date.parse(from)) / DAY_MS;
	if (!(span >= 0)) throw httpError(400, 'Khoảng ngày không hợp lệ');
	if (span >= MAX_DAYS) throw httpError(400, `Chỉ xem tối đa ${MAX_DAYS} ngày một lần`);
};

// Lượt chấm trong khoảng ngày giờ VN [from 00:00, to 23:59:59], kèm giờ VN và mã học viên
// (PIN 8 số ⇔ HV + 8 số — như punchMatcher, kể cả lượt chưa ghép được buổi học)
const punchesCte = (q, req) => {
	req.input('from', sql.Date, q.from);
	req.input('to', sql.Date, q.to);
	const where = [
		"p.punched_at >= (CAST(@from AS timestamp) - interval '7 hours')",
		"p.punched_at < (CAST(@to AS timestamp) + interval '17 hours')",
	];
	if (q.device_id) {
		req.input('device_id', sql.Int, q.device_id);
		where.push('p.device_id = @device_id');
	} else
		// Bảng công học viên: mặc định bỏ máy chỉ dành cho hội nghị (chọn đúng máy thì vẫn xem được)
		where.push(
			`p.device_id IN (SELECT d.id FROM attendance_devices d WHERE ${trainingDeviceSql('d')})`,
		);
	return `
    WITH p AS (
      SELECT p.id, p.pin, p.device_id, p.session_id, p.match_status, p.verify_mode,
             p.punched_at + interval '7 hours' AS vn_at,
             COALESCE(p.trainee_id, CASE WHEN p.pin ~ '^[0-9]{8}$' THEN 'HV' || p.pin END) AS tid
      FROM attendance_punches p
      WHERE ${where.join(' AND ')}
    )`;
};

/**
 * Bảng công theo ngày.
 * @param {{ from: string, to: string, device_id?: number }} q
 */
const getTimesheet = async (q) => {
	assertRange(q);
	const pool = await getPool();
	const req = pool.request();
	const rows = (
		await req.input('limit', sql.Int, MAX_DAY_ROWS + 1).query(`${punchesCte(q, req)}
      SELECT to_char(p.vn_at, 'YYYY-MM-DD') AS work_date, p.pin,
             t.id AS trainee_id, t.full_name AS trainee_name,
             to_char(MIN(p.vn_at), 'HH24:MI:SS') AS first_time,
             to_char(MAX(p.vn_at), 'HH24:MI:SS') AS last_time,
             CAST(FLOOR(EXTRACT(EPOCH FROM MAX(p.vn_at) - MIN(p.vn_at)) / 60) AS integer) AS span_minutes,
             COUNT(*) AS punch_count,
             COUNT(*) FILTER (WHERE p.match_status = 'matched') AS matched_count,
             string_agg(to_char(p.vn_at, 'HH24:MI'), ' · ' ORDER BY p.vn_at) AS times,
             string_agg(DISTINCT COALESCE(d.name, d.serial_no), ', ') AS devices,
             string_agg(DISTINCT c.name, '; ') AS courses
      FROM p
      JOIN attendance_devices d ON d.id = p.device_id
      LEFT JOIN trainees t ON t.id = p.tid
      LEFT JOIN class_sessions s ON s.id = p.session_id
      LEFT JOIN courses c ON c.id = s.course_id
      GROUP BY 1, 2, 3, 4
      ORDER BY 1 DESC, t.full_name NULLS LAST, p.pin
      LIMIT @limit`)
	).recordset.map((r) => ({
		...r,
		span_minutes: Number(r.span_minutes),
		punch_count: Number(r.punch_count),
		matched_count: Number(r.matched_count),
	}));
	const truncated = rows.length > MAX_DAY_ROWS;
	if (truncated) rows.length = MAX_DAY_ROWS;
	await attachShifts(pool, q, rows);
	return { rows, truncated, summary: summarize(rows) };
};

// Điểm danh theo ca (staff_attendance, ghi từ lượt chấm — attendance/deviceShiftService) của
// học viên có trong bảng: mỗi dòng người/ngày kèm các ca bắt đầu ngày đó, giờ VN dạng HH:MM.
const attachShifts = async (pool, q, rows) => {
	for (const r of rows) r.shifts = [];
	const ids = [...new Set(rows.map((r) => r.trainee_id).filter(Boolean))];
	if (!ids.length) return;
	const hhmm = (col) => `to_char(${col} + interval '7 hours', 'HH24:MI')`;
	const list = (
		await pool
			.request()
			.input('from', sql.Date, q.from)
			.input('to', sql.Date, q.to)
			.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids)).query(`
      SELECT to_char(a.work_date, 'YYYY-MM-DD') AS work_date, t.id AS trainee_id,
             a.shift_id, a.shift_name, a.shift_code,
             ${hhmm('a.shift_start_at')} AS shift_start, ${hhmm('a.shift_end_at')} AS shift_end,
             ${hhmm('a.check_in_at')} AS check_in, ${hhmm('a.check_out_at')} AS check_out,
             a.late_min, a.early_min,
             (a.check_out_at IS NULL AND a.shift_end_at < (now() AT TIME ZONE 'UTC')) AS missing_out
      FROM staff_attendance a
      JOIN trainees t ON t.user_id = a.user_id
      WHERE a.work_date BETWEEN @from AND @to AND a.course_id IS NOT NULL
        AND t.id IN ${jsonValues('@ids', { type: 'VARCHAR(20)' })}
      ORDER BY a.shift_start_at NULLS LAST, a.check_in_at`)
	).recordset;
	const byKey = new Map(rows.map((r) => [`${r.work_date}|${r.trainee_id}`, r]));
	for (const a of list) {
		const row = byKey.get(`${a.work_date}|${a.trainee_id}`);
		if (!row) continue;
		const { work_date: _d, trainee_id: _t, ...shift } = a;
		row.shifts.push({
			...shift,
			late_min: shift.late_min ?? null,
			early_min: shift.early_min ?? null,
			missing_out: shift.missing_out === true || shift.missing_out === 'true',
		});
	}
};

/** @param {{ pin: string, work_date: string, trainee_id: string|null, punch_count: number }[]} rows */
const summarize = (rows) => {
	const pins = new Set();
	const unknown = new Set();
	const days = new Set();
	let punches = 0;
	for (const r of rows) {
		pins.add(r.pin);
		days.add(r.work_date);
		if (!r.trainee_id) unknown.add(r.pin);
		punches += r.punch_count;
	}
	return { punches, people: pins.size, days: days.size, unknown_pins: unknown.size };
};

/**
 * Từng lượt chấm (sheet chi tiết của file Excel).
 * @param {{ from: string, to: string, device_id?: number }} q
 */
const listPunchDetails = async (q) => {
	assertRange(q);
	const pool = await getPool();
	const req = pool.request();
	return (
		await req.input('limit', sql.Int, MAX_PUNCH_ROWS).query(`${punchesCte(q, req)}
      SELECT to_char(p.vn_at, 'YYYY-MM-DD') AS work_date, to_char(p.vn_at, 'HH24:MI:SS') AS punch_time,
             p.pin, t.id AS trainee_id, t.full_name AS trainee_name, p.match_status, p.verify_mode,
             COALESCE(d.name, d.serial_no) AS device_name,
             c.name AS course_name, to_char(s.session_date, 'YYYY-MM-DD') AS session_date, s.start_time
      FROM p
      JOIN attendance_devices d ON d.id = p.device_id
      LEFT JOIN trainees t ON t.id = p.tid
      LEFT JOIN class_sessions s ON s.id = p.session_id
      LEFT JOIN courses c ON c.id = s.course_id
      ORDER BY p.vn_at, p.pin
      LIMIT @limit`)
	).recordset;
};

const deviceLabel = async (deviceId) => {
	if (!deviceId) return null;
	const pool = await getPool();
	const d = (
		await pool
			.request()
			.input('id', sql.Int, deviceId)
			.query('SELECT COALESCE(name, serial_no) AS label FROM attendance_devices WHERE id = @id')
	).recordset[0];
	return d ? d.label : null;
};

/** Dữ liệu cho file Excel */
const getExportData = async (q) => {
	const [sheet, punches, device] = await Promise.all([
		getTimesheet(q),
		listPunchDetails(q),
		deviceLabel(q.device_id),
	]);
	return { from: q.from, to: q.to, device, days: sheet.rows, punches };
};

module.exports = { getTimesheet, getExportData, summarize };
