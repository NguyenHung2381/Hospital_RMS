// @ts-nocheck — còn lỗi kiểu khi bật checkJs; sửa xong thì xoá dòng này (xem README, Kiểm tra chất lượng)
const { getPool, sql } = require('../../config/db');
const logger = require('../../config/logger');

// Ghi 1 sự kiện bảo mật (khoá tài khoản, xoay refresh token, xem dữ liệu
// nhạy cảm...). Không bao giờ throw ra ngoài — lỗi ghi log không được phép
// làm hỏng luồng chính (giống middlewares/activityLogger.js).
const log = async ({
	eventType,
	actorId = null,
	targetType = null,
	targetId = null,
	ip = null,
	userAgent = null,
	detail = null,
}) => {
	try {
		const pool = await getPool();
		await pool
			.request()
			.input('event_type', sql.VarChar(50), eventType)
			.input('actor_id', sql.VarChar(20), actorId)
			.input('target_type', sql.VarChar(50), targetType)
			.input('target_id', sql.VarChar(50), targetId)
			.input('ip_address', sql.VarChar(64), ip)
			.input('user_agent', sql.NVarChar(255), userAgent ? String(userAgent).slice(0, 255) : null)
			.input('detail', sql.NVarChar(1000), detail).query(`
				INSERT INTO security_events
					(event_type, actor_id, target_type, target_id, ip_address, user_agent, detail)
				VALUES
					(@event_type, @actor_id, @target_type, @target_id, @ip_address, @user_agent, @detail)
			`);
	} catch (err) {
		logger.error('❌ security_events insert failed:', err.message);
	}
	// Email cảnh báo cho sự kiện quan trọng — chạy nền, không chờ (không làm chậm
	// luồng đăng nhập / upload). require trễ để tránh vòng phụ thuộc lúc nạp module.
	require('./securityAlertService')
		.notify({ eventType, actorId, targetType, targetId, ip, detail })
		.catch(() => {});
};

// Keyset pagination theo id giảm dần — cùng kiểu với activityLogService.
const getAll = async ({ limit = 50, cursor, event_type, actor_id } = {}) => {
	const pool = await getPool();
	const req = pool.request().input('limit', sql.Int, Math.min(Number(limit) || 50, 200));

	const where = ['1 = 1'];
	if (cursor) {
		req.input('cursor', sql.BigInt, cursor);
		where.push('id < @cursor');
	}
	if (event_type) {
		req.input('event_type', sql.VarChar(50), event_type);
		where.push('event_type = @event_type');
	}
	if (actor_id) {
		req.input('actor_id', sql.VarChar(20), actor_id);
		where.push('actor_id = @actor_id');
	}

	const result = await req.query(`
		SELECT TOP (@limit) *
		FROM security_events
		WHERE ${where.join(' AND ')}
		ORDER BY id DESC
	`);

	const data = result.recordset;
	const nextCursor = data.length === Number(limit) ? String(data[data.length - 1].id) : null;
	return { data, next_cursor: nextCursor };
};

module.exports = { log, getAll };
