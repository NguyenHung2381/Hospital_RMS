const { getPool, sql } = require('../../config/db');
const mailService = require('./mailService');

const getForUser = async (
	userId,
	{ page = 1, limit = 20, unread_only = false } = {},
) => {
	const pool = await getPool();
	const offset = (page - 1) * limit;
	const filter = unread_only ? 'AND is_read = 0' : '';

	const result = await pool
		.request()
		.input('user_id', sql.VarChar(20), userId)
		.input('offset', sql.Int, offset)
		.input('limit', sql.Int, limit).query(`
      SELECT id, type, title, message, ref_id, ref_type, is_read, created_at
      FROM   notifications
      WHERE  user_id = @user_id ${filter}
      ORDER  BY created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      SELECT COUNT(*) AS total
      FROM   notifications
      WHERE  user_id = @user_id ${filter};
    `);

	return {
		data: result.recordsets[0],
		pagination: { page, limit, total: result.recordsets[1][0].total },
	};
};

const getUnreadCount = async (userId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('user_id', sql.VarChar(20), userId)
		.query(
			'SELECT COUNT(*) AS count FROM notifications WHERE user_id = @user_id AND is_read = 0',
		);
	return result.recordset[0].count;
};

const markRead = async (notifId, userId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(30), notifId)
		.input('user_id', sql.VarChar(20), userId)
		.query(
			'UPDATE notifications SET is_read = 1 WHERE id = @id AND user_id = @user_id',
		);
	return result.rowsAffected[0] > 0;
};

const markAllRead = async (userId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('user_id', sql.VarChar(20), userId)
		.query(
			'UPDATE notifications SET is_read = 1 WHERE user_id = @user_id AND is_read = 0',
		);
};

/**
 * Push a notification to a list of user IDs via sp_push_notification.
 * Errors are swallowed so callers are never broken by notification failures.
 */
const push = async (
	type,
	title,
	userIds,
	{ message = null, refId = null, refType = null } = {},
) => {
	if (!userIds?.length) return;
	try {
		const pool = await getPool();
		await pool
			.request()
			.input('type', sql.VarChar(50), type)
			.input('title', sql.NVarChar(255), title)
			.input('message', sql.NVarChar(sql.MAX), message)
			.input('ref_id', sql.VarChar(30), refId)
			.input('ref_type', sql.VarChar(20), refType)
			.input('user_ids', sql.NVarChar(sql.MAX), JSON.stringify(userIds))
			.execute('sp_push_notification');
	} catch (err) {
		console.error('[notification] push failed:', err.message);
	}
};

/**
 * Giống push(), nhưng gửi thêm email cho những người nhận có địa chỉ email
 * nếu email bật cho chức năng `mailEvent` (xem mailService.EVENT_DEFAULTS —
 * admin chọn ở Cấu hình hệ thống). Dùng cho các sự kiện quan trọng thay vì
 * mọi loại notification để tránh spam hộp thư cho các thông báo vặt.
 */
const pushWithEmail = async (
	type,
	title,
	userIds,
	{ message = null, refId = null, refType = null, mailEvent } = {},
) => {
	await push(type, title, userIds, { message, refId, refType });
	if (!userIds?.length || !(await mailService.isEnabled(mailEvent))) return;

	// Không chờ SMTP — gửi tuần tự ở nền: thông báo chung có thể tới hàng trăm
	// người, mở song song từng ấy kết nối sẽ bị Gmail chặn.
	// ponytail: Gmail giới hạn ~500 thư/ngày/tài khoản, cần hàng đợi + SMTP riêng nếu vượt.
	(async () => {
		const pool = await getPool();
		const res = await pool
			.request()
			.input('user_ids', sql.NVarChar(sql.MAX), JSON.stringify(userIds))
			.query(`
				SELECT id, email, full_name FROM users
				WHERE id IN (SELECT [value] FROM OPENJSON(@user_ids))
				  AND email IS NOT NULL AND email <> ''
			`);
		for (const u of res.recordset) {
			await mailService.send({
				to: u.email,
				subject: title,
				html: mailService.renderNotificationEmail({ fullName: u.full_name, title, message }),
			});
		}
	})().catch((err) => console.error('[notification] pushWithEmail failed:', err.message));
};

const getUsersByTarget = async (targetType, targetIds = []) => {
	const pool = await getPool();
	if (targetType === 'all') {
		const res = await pool.request().query(
			"SELECT id FROM users WHERE is_active = 1",
		);
		return res.recordset.map((r) => r.id);
	}
	if (targetType === 'department') {
		if (!targetIds.length) return [];
		const res = await pool
			.request()
			.input('dept_ids', sql.NVarChar(sql.MAX), JSON.stringify(targetIds))
			.query(
				`SELECT id FROM users WHERE is_active = 1
         AND department_id IN (SELECT value FROM OPENJSON(@dept_ids))`,
			);
		return res.recordset.map((r) => r.id);
	}
	return targetIds;
};

const sendBroadcast = async ({
	type,
	title,
	message,
	refId,
	refType,
	targetType,
	targetIds,
}) => {
	const userIds = await getUsersByTarget(targetType, targetIds ?? []);
	if (!userIds.length) return { sent: 0 };
	await pushWithEmail(type, title, userIds, { message, refId, refType, mailEvent: 'BROADCAST' });
	return { sent: userIds.length };
};

/**
 * Gộp các dòng cùng 1 lượt gửi (cùng batch_id, hoặc cùng id nếu là dòng cũ
 * trước khi có batch_id) thành 1 hàng, kèm số người nhận và số người đã đọc.
 */
const adminGetAll = async ({ page = 1, limit = 20, type, search } = {}) => {
	const pool = await getPool();
	const offset = (page - 1) * limit;
	const conditions = [];
	const req = pool
		.request()
		.input('offset', sql.Int, offset)
		.input('limit', sql.Int, limit);
	if (type) {
		conditions.push('n.type = @type');
		req.input('type', sql.VarChar(50), type);
	}
	if (search) {
		conditions.push('(n.title LIKE @search OR n.message LIKE @search)');
		req.input('search', sql.NVarChar(255), `%${search}%`);
	}
	const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
	const result = await req.query(`
    SELECT
           COALESCE(n.batch_id, n.id) AS batch_key,
           MIN(n.type)                AS type,
           MIN(n.title)               AS title,
           MIN(n.message)             AS message,
           MIN(n.ref_id)              AS ref_id,
           MIN(n.ref_type)            AS ref_type,
           MIN(n.created_at)          AS created_at,
           COUNT(*)                   AS recipient_count,
           SUM(CASE WHEN n.is_read = 1 THEN 1 ELSE 0 END) AS read_count
    FROM   notifications n
    ${where}
    GROUP  BY COALESCE(n.batch_id, n.id)
    ORDER  BY created_at DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

    SELECT COUNT(DISTINCT COALESCE(n.batch_id, n.id)) AS total
    FROM   notifications n
    ${where};
  `);
	return {
		data: result.recordsets[0],
		pagination: { page, limit, total: result.recordsets[1][0].total },
	};
};

const getBatchRecipients = async (batchKey) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('batch_key', sql.VarChar(30), batchKey)
		.query(`
      SELECT u.id AS user_id, u.full_name, u.username, n.is_read
      FROM   notifications n
      JOIN   users u ON u.id = n.user_id
      WHERE  COALESCE(n.batch_id, n.id) = @batch_key
      ORDER  BY u.full_name
    `);
	return result.recordset;
};

const deleteBatch = async (batchKey) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('batch_key', sql.VarChar(30), batchKey)
		.query('DELETE FROM notifications WHERE COALESCE(batch_id, id) = @batch_key');
	return result.rowsAffected[0] > 0;
};

const deleteNotif = async (id) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(30), id)
		.query('DELETE FROM notifications WHERE id = @id');
	return result.rowsAffected[0] > 0;
};

module.exports = {
	getForUser,
	getUnreadCount,
	markRead,
	markAllRead,
	push,
	pushWithEmail,
	getUsersByTarget,
	sendBroadcast,
	adminGetAll,
	getBatchRecipients,
	deleteBatch,
	deleteNotif,
};
