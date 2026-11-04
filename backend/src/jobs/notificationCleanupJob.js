const { getPool, sql, nowSql } = require('../config/db');
const { markOnce } = require('./dedupe');
const { todayKeyVN } = require('../utils/vnDate');
const logger = require('../config/logger');

// Xóa thông báo cũ: đã đọc sau 90 ngày, chưa đọc sau 180 ngày (quyết định
// 18/10/2026). Thay sp_cleanup_old_notifications — proc đó chỉ chạy nếu có SQL
// Agent job, và sp_process_daily_deadlines gọi nó sai tên tham số nên bước dọn
// luôn lỗi (xem database/README.md). Xóa theo lô nhỏ, nghỉ giữa các lô để không
// khóa bảng lâu. Mỗi ngày chạy 1 lần dù nhiều worker (markOnce).

const JOB = 'notification_cleanup';
const READ_RETENTION_DAYS = 90;
const UNREAD_RETENTION_DAYS = 180;
const BATCH_SIZE = 2000;
const PAUSE_MS = 1000;

const deleteBatch = async () => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('batch', sql.Int, BATCH_SIZE)
		.input('read_days', sql.Int, READ_RETENTION_DAYS)
		.input('unread_days', sql.Int, UNREAD_RETENTION_DAYS).query(`
      DELETE FROM notifications WHERE id IN (
        SELECT id FROM notifications
        WHERE (is_read = 'true' AND created_at < DATEADD(DAY, -@read_days, ${nowSql}))
           OR (is_read = 'false' AND created_at < DATEADD(DAY, -@unread_days, ${nowSql}))
        ORDER BY id OFFSET 0 ROWS FETCH NEXT @batch ROWS ONLY)
    `);
	return r.rowsAffected[0] ?? 0;
};

const run = async ({ pauseMs = PAUSE_MS } = {}) => {
	if (!(await markOnce(JOB, todayKeyVN()))) return { deleted: 0, skipped: true };
	let total = 0;
	for (;;) {
		const n = await module.exports.deleteBatch();
		total += n;
		if (n < BATCH_SIZE) break;
		await new Promise((r) => setTimeout(r, pauseMs));
	}
	if (total) logger.info(`[job:${JOB}] Đã xóa ${total} thông báo cũ.`);
	return { deleted: total, skipped: false };
};

module.exports = { run, deleteBatch, BATCH_SIZE, READ_RETENTION_DAYS, UNREAD_RETENTION_DAYS };
