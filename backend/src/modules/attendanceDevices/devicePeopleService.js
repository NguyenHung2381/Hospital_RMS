// Tên người dùng khai trên máy chấm công (attendance_device_people —
// 2027-01-25_ten_nguoi_dung_tren_may.sql). Máy gửi "USER PIN=..\tName=.." qua OPERLOG / USERINFO
// (iclockService.receive); chỉ dùng để HIỂN THỊ cho mã trên máy không khớp cán bộ / học viên.
const { getPool, sql, jsonValues } = require('../../config/db');

const PIN_RE = /^[0-9A-Za-z]{1,24}$/;

/** Tên gõ trên máy → chuỗi sạch (bỏ ký tự điều khiển, gộp khoảng trắng, ≤ 100 ký tự) | null */
const cleanName = (v) => {
	// eslint-disable-next-line no-control-regex
	const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
	return s ? s.slice(0, 100) : null;
};

/**
 * Lưu / cập nhật tên người dùng máy vừa gửi (trùng mã trong 1 lô ⇒ lấy dòng sau cùng).
 * @param {number} deviceId
 * @param {{ pin: string, name: string|null }[]} users
 * @returns {Promise<number>} số người đã lưu
 */
const saveFromDevice = async (deviceId, users) => {
	const byPin = new Map();
	for (const u of users || []) {
		const pin = String(u.pin ?? '').trim();
		if (PIN_RE.test(pin)) byPin.set(pin, cleanName(u.name));
	}
	if (!byPin.size) return 0;
	const rows = [...byPin].map(([pin, name]) => ({ pin, name }));
	const pool = await getPool();
	await pool
		.request()
		.input('device_id', sql.Int, deviceId)
		.input('rows', sql.NVarChar(sql.MAX), JSON.stringify(rows)).query(`
      INSERT INTO attendance_device_people (device_id, pin, name)
      SELECT @device_id, j.pin, j.name
      FROM jsonb_to_recordset(CAST(@rows AS jsonb)) AS j(pin varchar(24), name varchar(100))
      ON CONFLICT (device_id, pin) DO UPDATE SET
        name = EXCLUDED.name, updated_at = (now() AT TIME ZONE 'UTC')`);
	return rows.length;
};

/**
 * Tên trên máy theo mã (ưu tiên máy cập nhật gần nhất trong các máy cho trước).
 * @param {number[]} deviceIds
 * @param {string[]} pins
 * @returns {Promise<Map<string, string>>}
 */
const namesFor = async (deviceIds, pins) => {
	if (!deviceIds.length || !pins.length) return new Map();
	const pool = await getPool();
	const r = await pool
		.request()
		.input('devices', sql.NVarChar(sql.MAX), JSON.stringify(deviceIds))
		.input('pins', sql.NVarChar(sql.MAX), JSON.stringify(pins)).query(`
      SELECT DISTINCT ON (pin) pin, name
      FROM attendance_device_people
      WHERE device_id IN ${jsonValues('@devices', { type: 'INT' })}
        AND pin IN ${jsonValues('@pins', { type: 'VARCHAR(24)' })}
        AND name IS NOT NULL
      ORDER BY pin, updated_at DESC`);
	return new Map(r.recordset.map((x) => [x.pin, x.name]));
};

module.exports = { saveFromDevice, namesFor, cleanName };
