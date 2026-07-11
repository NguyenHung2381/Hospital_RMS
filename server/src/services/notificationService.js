const { getPool, sql } = require('../config/db');

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
	await push(type, title, userIds, { message, refId, refType });
	return { sent: userIds.length };
};

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
    SELECT n.id, n.user_id, u.full_name, n.type, n.title, n.message,
           n.ref_id, n.ref_type, n.is_read, n.created_at
    FROM   notifications n
    JOIN   users u ON u.id = n.user_id
    ${where}
    ORDER  BY n.created_at DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

    SELECT COUNT(*) AS total
    FROM   notifications n
    JOIN   users u ON u.id = n.user_id
    ${where};
  `);
	return {
		data: result.recordsets[0],
		pagination: { page, limit, total: result.recordsets[1][0].total },
	};
};

const deleteNotif = async (id) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(30), id)
		.query('DELETE FROM notifications WHERE id = @id');
	return result.rowsAffected[0] > 0;
};

module.exports = { getForUser, getUnreadCount, markRead, markAllRead, push, getUsersByTarget, sendBroadcast, adminGetAll, deleteNotif };
