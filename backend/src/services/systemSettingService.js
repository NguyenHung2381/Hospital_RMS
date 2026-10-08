const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');

// Cấu hình hệ thống qua UI (2026-09-14_system_settings.sql) — thay .env cho các
// giá trị nghiệp vụ hay đổi. value NULL = "chưa cấu hình qua UI, dùng .env"
// (mailService.js/cmeRequirementService.js tự fallback process.env).
const SECRET_KEYS = new Set(['SMTP_PASS']);
const MASK = '••••••';

// Không bao giờ trả plaintext secret ra ngoài — chỉ báo "đã đặt" hay chưa.
const maskRow = (row) => {
	if (!row) return row;
	if (SECRET_KEYS.has(row.setting_key) && row.value) {
		return { ...row, value: MASK, has_value: true };
	}
	return { ...row, has_value: row.value !== null && row.value !== '' };
};

const getAll = async () => {
	const pool = await getPool();
	const result = await pool.request().query('SELECT * FROM system_settings ORDER BY setting_key');
	return result.recordset.map(maskRow);
};

const getRaw = async (key) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('key', sql.VarChar(50), key)
		.query('SELECT * FROM system_settings WHERE setting_key = @key');
	return result.recordset[0] || null;
};

// Đọc giá trị đã cấu hình qua UI, fallback về .env nếu bảng trống/NULL —
// dùng ở mailService.js, cmeRequirementService.js... không phải ở route.
const getValue = async (key, envFallback) => {
	const row = await getRaw(key);
	if (row && row.value !== null && row.value !== '') return row.value;
	return envFallback !== undefined ? envFallback : process.env[key];
};

const getById = async (key) => maskRow(await getRaw(key));

const update = async (key, value, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('key', sql.VarChar(50), key)
		.input('value', sql.NVarChar(sql.MAX), value === '' ? null : value)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`
      MERGE system_settings AS tgt
      USING (SELECT @key AS setting_key) AS src ON tgt.setting_key = src.setting_key
      WHEN MATCHED THEN UPDATE SET value = @value, updated_at = GETDATE(), updated_by = @actor_id
      WHEN NOT MATCHED THEN INSERT (setting_key, value, created_by, updated_by) VALUES (@key, @value, @actor_id, @actor_id);
    `);
	broadcast('update', { entity: 'system_setting' });
	return getById(key);
};

module.exports = { getAll, getById, getValue, update };
