const cron = require('node-cron');
const deadlineReminderJob = require('./deadlineReminderJob');
const accountMaintenanceJob = require('./accountMaintenanceJob');
const personLinkJob = require('./personLinkJob');
const logger = require('../config/logger');

const TZ = process.env.CRON_TZ || 'Asia/Ho_Chi_Minh';

const runSafely = (name, fn) => async () => {
	try {
		await fn();
	} catch (err) {
		logger.error(`[job:${name}] lỗi:`, err.message);
	}
};

// Đặt JOBS_ENABLED=false để tắt hẳn cron job nền (vd môi trường test, hoặc
// khi chạy nhiều instance server và chỉ muốn 1 instance làm job — set
// JOBS_ENABLED=false trên các instance còn lại).
const start = () => {
	if (process.env.JOBS_ENABLED === 'false') {
		logger.info('[jobs] JOBS_ENABLED=false — không chạy cron job nền.');
		return;
	}

	// 01:00 sáng: bảo trì tài khoản (vô hiệu hoá TK hết hạn, cảnh báo mật khẩu cũ)
	cron.schedule('0 1 * * *', runSafely('account_maintenance', accountMaintenanceJob.run), {
		timezone: TZ,
	});

	// 02:00 sáng: nhắc deadline sắp tới / đã quá hạn
	cron.schedule('0 2 * * *', runSafely('deadline_reminder', deadlineReminderJob.run), {
		timezone: TZ,
	});

	// 03:00 sáng: gắn nốt person_id cho bản ghi nguồn còn thiếu (dual-write danh tính)
	cron.schedule('0 3 * * *', runSafely('person_link', personLinkJob.run), {
		timezone: TZ,
	});

	logger.info(`[jobs] Đã lên lịch cron job nền (timezone ${TZ}).`);
};

module.exports = { start };
