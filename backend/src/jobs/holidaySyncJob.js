/**
 * holidaySyncJob.js — job hằng tuần đối chiếu lịch nghỉ lễ đồng bộ (modules/settings/holidaySync.js)
 * với cấu hình đang dùng, có điểm khác thì báo quản trị cấu hình.
 */
const crypto = require('crypto');
const { getPool } = require('../config/db');
const systemSettingService = require('../modules/settings/systemSettingService');
const holidaySync = require('../modules/settings/holidaySync');
const notificationService = require('../modules/notifications/notificationService');
const dedupe = require('./dedupe');
const { todayKeyVN } = require('../utils/vnDate');
const logger = require('../config/logger');

/** Người nhận thông báo: superuser + vai trò có quyền system_settings:manage. */
const settingAdmins = async () => {
	const pool = await getPool();
	const r = await pool.request().query(`
		SELECT DISTINCT u.id FROM users u
		JOIN roles r ON r.id = u.role_id
		LEFT JOIN role_permissions rp ON rp.role_id = u.role_id
		LEFT JOIN permissions p ON p.id = rp.permission_id
		WHERE u.is_active = 'true'
		  AND (r.is_superuser = 'true' OR CONCAT(p.resource, ':', p.action) = 'system_settings:manage')`);
	return r.recordset.map((x) => x.id);
};

const fmt = (s) => `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

/**
 * Job hằng tuần: công tắc TRAINING_HOLIDAYS_SYNC bật ⇒ tải lịch, có gợi ý MỚI (khác lần đã báo) thì
 * gửi thông báo cho quản trị cấu hình. Mỗi bộ gợi ý chỉ báo 1 lần (job_execution_log).
 * Nằm ở jobs/ (không ở modules/settings) để module lõi settings không phụ thuộc notifications.
 */
const runJob = async () => {
	if ((await systemSettingService.getValue('TRAINING_HOLIDAYS_SYNC', 'false')) !== 'true') return;
	const data = await holidaySync.sync();
	if (data.error) {
		logger.warn(`[holiday-sync] ${data.error}`);
		return;
	}
	const year = +todayKeyVN().slice(0, 4);
	const sug = holidaySync.suggestionsFor(data, await holidaySync.currentSettings(), [
		year,
		year + 1,
	]);
	if (!sug.length) return;
	const sig = crypto
		.createHash('sha1')
		.update(sug.map((s) => `${s.action}${s.date}`).join(','))
		.digest('hex');
	if (!(await dedupe.markOnce('holiday_sync', sig))) return;
	const lines = sug
		.slice(0, 8)
		.map((s) => `${s.action === 'add' ? 'Thêm' : 'Bỏ'} ${fmt(s.date)} — ${s.name}`);
	await notificationService.push(
		'holiday_sync',
		`Lịch nghỉ lễ có ${sug.length} điểm khác cần xem lại`,
		await settingAdmins(),
		{
			message: `${lines.join('\n')}${sug.length > 8 ? `\n… và ${sug.length - 8} ngày khác` : ''}\nXem và chấp nhận ở Cấu hình hệ thống → Đào tạo → Ngày nghỉ lễ.`,
			refType: 'system_settings',
		},
	);
};

module.exports = { runJob };
