// Ghép lượt chấm vân tay vào điểm danh hội nghị (2027-01-24_cham_van_tay_hoi_nghi.sql).
//   Chỉ máy dành cho hội nghị (purpose seminar / both — devicePurpose.js). Lượt chấm tìm người
//   tham dự của hội nghị diễn ra hôm đó (giờ VN):
//     PIN = mã nhân viên  ⇒ seminar_participants.staff_number, hoặc tài khoản (users.staff_number)
//     PIN = mã học viên   ⇒ HV + 8 số ⇒ trainees.user_id = seminar_participants.user_id
//   Không tự thêm người vào danh sách (như điểm danh QR) — người lạ chấm thì không ghép.
//   Hội nghị nhận lượt chấm khi: ngày chấm trong [ngày bắt đầu, ngày kết thúc]; ngày đầu có giờ
//   bắt đầu thì không sớm hơn giờ đó − DEVICE_CHECKIN_EARLY_MIN; ngày cuối có giờ kết thúc thì
//   không muộn hơn giờ đó. Phương thức "máy chấm công" phải bật (Cấu hình hệ thống + loại hội
//   nghị — utils/attendanceMethods).
//   Ghi giờ điểm danh = lần chấm SỚM nhất; người đã điểm danh bằng QR / quét vé thì giữ nguyên.
// Kết quả ghép lưu ở attendance_punches.seminar_id / seminar_participant_id — độc lập với
// match_status (kết quả ghép buổi học, punchMatcher.js) vì máy dùng chung làm cả hai.
const { getPool, sql, jsonValues } = require('../../config/db');
const logger = require('../../config/logger');
const { broadcast } = require('../events/eventService');
const attendanceMethods = require('../../utils/attendanceMethods');
const { traineeIdFromPin } = require('./iclockProtocol');
const { getDeviceSettings } = require('./deviceSettings');

const SEMINAR_PURPOSES = ['seminar', 'both'];
const isSeminarPurpose = (purpose) => SEMINAR_PURPOSES.includes(purpose);
const seminarDeviceSql = (alias = 'd') => `${alias}.purpose IN ('seminar', 'both')`;

const hhmmToMin = (s) => {
	const m = /^(\d{1,2}):(\d{2})/.exec(String(s || ''));
	return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const dateKey = (d) =>
	d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null;

/** PIN trên máy → mã nhân viên (số nguyên dương) | null */
const staffNumberFromPin = (pin) => {
	if (!/^\d{1,9}$/.test(String(pin))) return null;
	const n = Number(pin);
	return n > 0 ? n : null;
};

/**
 * @typedef {{ seminar_id: string, participant_id: string, start_date: any, end_date: any,
 *   start_time: string|null, end_time: string|null, checked_in_at: any }} SeminarCand
 */

/**
 * Chọn hội nghị cho 1 lượt chấm (hàm thuần — test riêng).
 * @param {SeminarCand[]} cands người tham dự
 *   khớp PIN ở các hội nghị có ngày chứa `date`
 * @param {string} date 'YYYY-MM-DD' giờ VN của lượt chấm
 * @param {number} minute phút trong ngày (giờ VN)
 * @returns {SeminarCand|null} ứng viên được chọn
 */
const pickSeminar = (cands, date, minute, { earlyMin }) => {
	let best = null;
	for (const c of cands) {
		const startDate = dateKey(c.start_date);
		const endDate = dateKey(c.end_date) ?? startDate;
		if (!startDate || date < startDate || date > endDate) continue;
		const start = date === startDate ? hhmmToMin(c.start_time) : null;
		const end = date === endDate ? hhmmToMin(c.end_time) : null;
		if (start !== null && minute < start - earlyMin) continue;
		if (end !== null && minute > end) continue;
		// Ưu tiên người chưa điểm danh, rồi hội nghị bắt đầu gần giờ chấm nhất
		const rank = [c.checked_in_at ? 1 : 0, start === null ? 24 * 60 : Math.abs(minute - start)];
		if (!best || rank[0] < best.rank[0] || (rank[0] === best.rank[0] && rank[1] < best.rank[1]))
			best = { c, rank };
	}
	return best?.c ?? null;
};

// Date UTC → { date: 'YYYY-MM-DD', minute } theo giờ Việt Nam
const vnParts = (d) => {
	const iso = new Date(d.getTime() + 7 * 3600 * 1000).toISOString();
	return {
		date: iso.slice(0, 10),
		minute: Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)),
	};
};

const candidatesFor = async (pool, pin, date) => {
	const sn = staffNumberFromPin(pin);
	const tid = traineeIdFromPin(pin);
	if (!sn && !tid) return [];
	const who = [];
	if (sn)
		who.push(
			'p.staff_number = @sn',
			'p.user_id IN (SELECT u.id FROM users u WHERE u.staff_number = @sn)',
		);
	if (tid)
		who.push(
			'p.user_id IN (SELECT t.user_id FROM trainees t WHERE t.id = @tid AND t.user_id IS NOT NULL)',
		);
	const req = pool.request().input('d', sql.Date, date);
	if (sn) req.input('sn', sql.Int, sn);
	if (tid) req.input('tid', sql.VarChar(20), tid);
	return (
		await req.query(`
      SELECT p.id AS participant_id, p.checked_in_at, p.checkin_method,
             s.id AS seminar_id, s.event_type, s.start_date, s.end_date, s.start_time, s.end_time
      FROM seminar_participants p
      JOIN seminars s ON s.id = p.seminar_id
      WHERE s.start_date IS NOT NULL
        AND @d BETWEEN s.start_date AND COALESCE(s.end_date, s.start_date)
        AND (${who.join(' OR ')})`)
	).recordset;
};

/**
 * Ghép các lượt chấm (đã đọc kèm serial_no, purpose của máy) vào điểm danh hội nghị.
 * Lượt ở máy không dành cho hội nghị / đã ghép rồi thì bỏ qua.
 * @param {{ id: number, pin: string, punched_at: Date, serial_no: string, purpose: string, seminar_id?: string|null }[]} punches
 * @returns {Promise<number>} số lượt ghép được
 */
const matchSeminarPunches = async (punches) => {
	const todo = punches.filter((p) => isSeminarPurpose(p.purpose) && !p.seminar_id);
	if (!todo.length) return 0;
	const pool = await getPool();
	const { earlyMin } = await getDeviceSettings();
	// Phương thức theo loại hội nghị — đọc 1 lần / loại trong lô
	const methodCache = new Map();
	const deviceAllowed = async (eventType) => {
		if (!methodCache.has(eventType))
			methodCache.set(eventType, (await attendanceMethods.forSeminarType(eventType)).device);
		return methodCache.get(eventType);
	};
	const touched = new Set();
	let matched = 0;
	for (const punch of [...todo].sort((a, b) => Number(a.punched_at) - Number(b.punched_at))) {
		try {
			const { date, minute } = vnParts(punch.punched_at);
			const cands = [];
			for (const c of await candidatesFor(pool, punch.pin, date))
				if (await deviceAllowed(c.event_type)) cands.push(c);
			const pick = pickSeminar(cands, date, minute, { earlyMin });
			if (!pick) continue;
			const upd = await pool
				.request()
				.input('pid', sql.VarChar(24), pick.participant_id)
				.input('at', sql.DateTime2, punch.punched_at)
				.input('tag', sql.VarChar(64), `zk:${punch.serial_no}`).query(`
          UPDATE seminar_participants
          SET checked_in_at = @at, checkin_method = 'device', checkin_device_id = @tag
          WHERE id = @pid
            AND (checked_in_at IS NULL OR (checkin_method = 'device' AND checked_in_at > @at))
          RETURNING id`);
			if (upd.recordset.length) touched.add(pick.seminar_id);
			await pool
				.request()
				.input('id', sql.BigInt, punch.id)
				.input('sid', sql.VarChar(20), pick.seminar_id)
				.input('pid', sql.VarChar(24), pick.participant_id)
				.query(
					'UPDATE attendance_punches SET seminar_id = @sid, seminar_participant_id = @pid WHERE id = @id',
				);
			matched += 1;
		} catch (e) {
			logger.error(`[attendanceDevices] Ghép lượt chấm ${punch.id} vào hội nghị lỗi: ${e.message}`);
		}
	}
	if (touched.size) broadcast('update', { entity: 'seminar' });
	if (matched) broadcast('update', { entity: 'attendance_punch' });
	return matched;
};

/** Đọc lượt chấm theo id (kèm máy) rồi ghép — dùng sau khi máy gửi lượt mới */
const loadPunches = async (pool, where, input) => {
	const req = pool.request();
	input(req);
	return (
		await req.query(`
      SELECT p.id, p.pin, p.punched_at, p.seminar_id, d.serial_no, d.purpose
      FROM attendance_punches p JOIN attendance_devices d ON d.id = p.device_id
      WHERE ${seminarDeviceSql('d')} AND p.seminar_id IS NULL AND ${where}
      ORDER BY p.punched_at LIMIT 5000`)
	).recordset;
};

/** @param {number[]} punchIds */
const matchPunchIds = async (punchIds) => {
	if (!punchIds.length) return 0;
	const pool = await getPool();
	const punches = await loadPunches(
		pool,
		`p.id IN ${jsonValues('@ids', { type: 'BIGINT' })}`,
		(r) => r.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(punchIds)),
	);
	return matchSeminarPunches(punches);
};

/**
 * Ghép lại lượt chưa ghép N ngày gần nhất — người tham dự / giờ hội nghị có thể được thêm,
 * sửa sau khi đã chấm, hoặc phương thức vừa được bật lại.
 */
const rematchRecent = async (days = 7) => {
	const pool = await getPool();
	const punches = await loadPunches(
		pool,
		"p.punched_at >= (now() AT TIME ZONE 'UTC') - make_interval(days => @days)",
		(r) => r.input('days', sql.Int, days),
	);
	return matchSeminarPunches(punches);
};

module.exports = {
	matchSeminarPunches,
	matchPunchIds,
	rematchRecent,
	pickSeminar,
	staffNumberFromPin,
	isSeminarPurpose,
	seminarDeviceSql,
};
