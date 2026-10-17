const { getPool, sql } = require('../../config/db');
const { broadcast } = require('../events/eventService');

// Cấu hình hệ thống qua UI (2026-09-14_system_settings.sql) — thay .env cho các
// giá trị nghiệp vụ hay đổi. value NULL = "chưa cấu hình qua UI, dùng .env"
// (mailService.js/cmeRequirementService.js tự fallback process.env).
const SECRET_KEYS = new Set(['SMTP_PASS']);
// Whitelist — PUT /:key không được tạo key tuỳ ý. Thêm key mới = thêm ở đây +
// trang cấu hình frontend (features/settings).
const KEYS = [
	'MAIL_ENABLED', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_NAME',
	'PUBLIC_BASE_URL', 'CME_CYCLE_YEARS', 'CME_MIN_HOURS', 'REQUIRE_2FA_FOR_ADMINS', 'TWOFA_GRACE_DAYS', 'ALERT_EMAILS', 'PASSWORD_RESET_ENABLED',
	'MODULE_RESEARCH', 'MODULE_TRAINING', 'MODULE_SEMINAR', 'MODULE_SURVEY', 'MODULE_ATTENDANCE',
	// File tài liệu được nhận — utils/uploadPolicy.js
	'UPLOAD_ALLOWED_EXTENSIONS', 'UPLOAD_MAX_MB',
	// Chấm công nhân viên — utils/attendancePolicy.js
	'ATTENDANCE_ALLOWED_IPS', 'ATTENDANCE_LOCATION', 'ATTENDANCE_RADIUS_M', 'ATTENDANCE_MAX_ACCURACY_M',
	// Email theo chức năng — mặc định ở mailService.EVENT_DEFAULTS
	'MAIL_EVENT_TOPIC_RESULT', 'MAIL_EVENT_DEADLINE_REMINDER', 'MAIL_EVENT_PASSWORD_EXPIRY', 'MAIL_EVENT_COURSE_ENROLLMENT',
	'MAIL_EVENT_SEMINAR_BADGE', 'MAIL_EVENT_SECURITY_ALERT', 'MAIL_EVENT_TOPIC_SUBMITTED', 'MAIL_EVENT_ACCOUNT_GRANTED', 'MAIL_EVENT_BROADCAST',
];
const isKey = (key) => KEYS.includes(key);
const MASK = '••••••';

// Không bao giờ trả plaintext secret ra ngoài — chỉ báo "đã đặt" hay chưa.
const maskRow = (row) => {
	if (!row) return row;
	if (SECRET_KEYS.has(row.setting_key) && row.value) {
		return { ...row, value: MASK, has_value: true };
	}
	return { ...row, has_value: row.value !== null && row.value !== '' };
};

// Cache 15s/worker: getValue được gọi mỗi request (chính sách 2FA) — không để mỗi
// lần chạm DB. update() xoá cache của worker xử lý; worker khác tự hết hạn sau TTL.
const TTL_MS = 15000;
let cache = null;
const loadRows = async () => {
	if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
	const pool = await getPool();
	const result = await pool.request().query('SELECT * FROM system_settings');
	const rows = new Map(result.recordset.map((r) => [r.setting_key, r]));
	cache = { at: Date.now(), rows };
	return rows;
};

const getRaw = async (key) => (await loadRows()).get(key) || null;

// Đọc giá trị đã cấu hình qua UI, fallback về .env nếu bảng trống/NULL —
// dùng ở mailService.js, cmeRequirementService.js... không phải ở route.
const getValue = async (key, envFallback) => {
	const row = await getRaw(key);
	if (row && row.value !== null && row.value !== '') return row.value;
	return envFallback !== undefined ? envFallback : process.env[key];
};

// Mỗi key trong whitelist 1 dòng; `effective` = giá trị đang áp dụng (UI hoặc .env),
// không trả cho secret.
const getAll = async () =>
	Promise.all(
		KEYS.map(async (key) => {
			const row = maskRow((await getRaw(key)) || { setting_key: key, value: null });
			return SECRET_KEYS.has(key) ? row : { ...row, effective: (await getValue(key)) ?? null };
		}),
	);

const getById = async (key) => maskRow(await getRaw(key));

const update = async (key, value, actorId) => {
	// UI gửi lại MASK khi admin không đổi secret → giữ nguyên giá trị cũ.
	if (SECRET_KEYS.has(key) && value === MASK) return getById(key);
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
	cache = null;
	broadcast('update', { entity: 'system_setting' });
	return getById(key);
};

module.exports = { getAll, getById, getValue, update, isKey };
