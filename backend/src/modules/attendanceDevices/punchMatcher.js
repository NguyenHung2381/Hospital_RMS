// Ghép lượt chấm vân tay vào điểm danh buổi học.
//   PIN 8 số ⇔ học viên HV + 8 số. Buổi học: cùng ngày (giờ VN), thuộc khóa học viên đã
//   được duyệt, đúng lớp/chương trình (SESSION_IN_PROGRAM_SQL — như điểm danh QR).
//   Hợp lệ khi chấm trong [bắt đầu − EARLY, kết thúc]; ≤ bắt đầu + LATE ⇒ có mặt, sau đó ⇒ muộn.
//   Nhiều buổi cùng khớp ⇒ buổi có giờ bắt đầu gần lượt chấm nhất.
const { getPool, sql, jsonValues } = require('../../config/db');
const logger = require('../../config/logger');
const { broadcast } = require('../events/eventService');
const { SESSION_IN_PROGRAM_SQL } = require('../training/courses/sessionScope');
const { traineeIdFromPin } = require('./iclockProtocol');
const { getDeviceSettings } = require('./deviceSettings');

// require muộn — courseAttendanceService kéo theo gradebook / certificate...
const attendance = () => require('../training/courses/courseAttendanceService');
const lessonProgress = () => require('../training/courses/lessonProgressService');

// Buổi không ghi giờ kết thúc: coi như dài 4 tiếng
const DEFAULT_SESSION_MIN = 240;

const hhmmToMin = (s) => {
	const m = /^(\d{1,2}):(\d{2})/.exec(String(s || ''));
	return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Date UTC → { date: 'YYYY-MM-DD', minute } theo giờ Việt Nam
const vnParts = (d) => {
	const iso = new Date(d.getTime() + 7 * 3600 * 1000).toISOString();
	return {
		date: iso.slice(0, 10),
		minute: Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)),
	};
};

/**
 * Chọn buổi + trạng thái cho 1 lượt chấm (hàm thuần — test riêng).
 * @param {{ session_id: string, start_time: string, end_time: string|null }[]} sessions buổi cùng ngày
 * @param {number} minute phút trong ngày (giờ VN) của lượt chấm
 */
const pickSession = (sessions, minute, { earlyMin, lateAfterMin }) => {
	let best = null;
	for (const s of sessions) {
		const start = hhmmToMin(s.start_time);
		if (start === null) continue;
		const endRaw = hhmmToMin(s.end_time);
		const end = endRaw !== null && endRaw > start ? endRaw : start + DEFAULT_SESSION_MIN;
		if (minute < start - earlyMin || minute > end) continue;
		const dist = Math.abs(minute - start);
		if (!best || dist < best.dist) best = { session: s, start, dist };
	}
	if (!best) return null;
	return {
		sessionId: best.session.session_id,
		status: minute <= best.start + lateAfterMin ? 'present' : 'late',
	};
};

const sessionsOfTraineeOnDate = async (pool, traineeId, date) =>
	(
		await pool.request().input('trainee_id', sql.VarChar(20), traineeId).input('d', sql.Date, date)
			.query(`
      SELECT sess.id AS session_id, sess.start_time, sess.end_time, e.id AS enrollment_id
      FROM class_sessions sess
      JOIN course_enrollments e ON e.course_id = sess.course_id AND e.status = 'approved'
      WHERE e.trainee_id = @trainee_id AND sess.session_date = @d
        AND ${SESSION_IN_PROGRAM_SQL('sess', 'e')}`)
	).recordset;

const traineeExists = async (pool, traineeId) =>
	(
		await pool
			.request()
			.input('id', sql.VarChar(20), traineeId)
			.query('SELECT 1 AS x FROM trainees WHERE id = @id')
	).recordset.length > 0;

const recordWithRetry = async (args) => {
	try {
		return await attendance().recordDeviceCheckIn(args);
	} catch (e) {
		// 2 máy cùng ghi 1 học viên/buổi cùng lúc ⇒ vướng uq_att_session_enrollment; ghi lại 1 lần
		if (e && e.code === '23505') return attendance().recordDeviceCheckIn(args);
		throw e;
	}
};

// Kết quả xấu nhất khi 1 buổi có nhiều lượt ghi danh (học viên học nhiều lớp của khóa)
const RESULT_RANK = { matched: 0, kept_manual: 1, locked: 2 };

const matchOne = async (pool, punch, settings) => {
	const traineeId = traineeIdFromPin(punch.pin);
	if (!traineeId || !(await traineeExists(pool, traineeId)))
		return { status: 'no_trainee', traineeId: null, sessionId: null };
	const { date, minute } = vnParts(punch.punched_at);
	const rows = await sessionsOfTraineeOnDate(pool, traineeId, date);
	const sessions = [...new Map(rows.map((r) => [r.session_id, r])).values()];
	const picked = pickSession(sessions, minute, settings);
	if (!picked) return { status: 'no_session', traineeId, sessionId: null };
	let status = 'matched';
	for (const r of rows.filter((x) => x.session_id === picked.sessionId)) {
		const res = await recordWithRetry({
			sessionId: picked.sessionId,
			enrollmentId: r.enrollment_id,
			status: picked.status,
			checkedInAt: punch.punched_at,
			deviceTag: `zk:${punch.serial_no}`,
		});
		if (RESULT_RANK[res] > RESULT_RANK[status]) status = res;
	}
	return { status, traineeId, sessionId: picked.sessionId };
};

/**
 * Ghép các lượt chấm theo id (mới nhận, hoặc ghép lại lượt chưa khớp).
 * @param {number[]} punchIds
 */
const matchPunches = async (punchIds) => {
	if (!punchIds.length) return { matched: 0, total: 0 };
	const pool = await getPool();
	const punches = (
		await pool.request().input('ids', sql.NVarChar(sql.MAX), JSON.stringify(punchIds)).query(`
      SELECT p.id, p.pin, p.punched_at, d.serial_no
      FROM attendance_punches p JOIN attendance_devices d ON d.id = p.device_id
      WHERE p.id IN ${jsonValues('@ids', { type: 'BIGINT' })}
      ORDER BY p.punched_at`)
	).recordset;
	const settings = await getDeviceSettings();
	const touchedSessions = new Set();
	let matched = 0;
	for (const punch of punches) {
		let result;
		try {
			result = await matchOne(pool, punch, settings);
		} catch (e) {
			logger.error(`[attendanceDevices] Ghép lượt chấm ${punch.id} lỗi: ${e.message}`);
			continue;
		}
		if (result.status === 'matched') {
			matched += 1;
			touchedSessions.add(result.sessionId);
		}
		await pool
			.request()
			.input('id', sql.BigInt, punch.id)
			.input('status', sql.VarChar(12), result.status)
			.input('trainee_id', sql.VarChar(20), result.traineeId)
			.input('session_id', sql.VarChar(20), result.sessionId).query(`
        UPDATE attendance_punches SET match_status = @status, trainee_id = @trainee_id,
               session_id = @session_id, matched_at = (now() AT TIME ZONE 'UTC')
        WHERE id = @id`);
	}
	for (const sessionId of touchedSessions) await lessonProgress().recompute({ sessionId });
	if (touchedSessions.size) broadcast('update', { entity: 'attendance' });
	broadcast('update', { entity: 'attendance_punch' });
	return { matched, total: punches.length };
};

/** Ghép lại lượt chưa khớp trong N ngày gần nhất (buổi / ghi danh có thể tạo sau khi chấm) */
const rematchRecent = async (days = 7) => {
	const pool = await getPool();
	const ids = (
		await pool.request().input('days', sql.Int, days).query(`
      SELECT id FROM attendance_punches
      WHERE match_status IN ('pending', 'no_trainee', 'no_session')
        AND punched_at >= (now() AT TIME ZONE 'UTC') - make_interval(days => @days)
      ORDER BY id LIMIT 5000`)
	).recordset.map((r) => r.id);
	return matchPunches(ids);
};

module.exports = { matchPunches, rematchRecent, pickSession, vnParts };
