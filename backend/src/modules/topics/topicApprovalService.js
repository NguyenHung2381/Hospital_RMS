const { getPool, sql } = require('../../config/db');
const notifSvc = require('../notifications/notificationService');
const { broadcast } = require('../events/eventService');
const { scopeOf, hasPermission } = require('../../permissions/authz');
const { findActiveUserIdsWhere } = require('../access/permissionService');
const { getById } = require('./topicService');

const approve = async (topicId, status, comment, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('topic_id', sql.VarChar(15), topicId)
		.input('decision', sql.VarChar(15), status)
		.input('comment', sql.NVarChar(sql.MAX), comment || null)
		.execute('sp_approve_topic');

	// Notify topic creator + all members who have accounts
	const userRes = await pool.request().input('topic_id', sql.VarChar(15), topicId).query(`
      SELECT DISTINCT uid FROM (
        SELECT created_by AS uid FROM topics WHERE id = @topic_id
        UNION
        SELECT user_id FROM topic_members WHERE topic_id = @topic_id AND user_id IS NOT NULL
      ) x
    `);
	const ids = userRes.recordset.map((r) => r.uid).filter(Boolean);
	const type =
		status === 'approved'
			? 'topic_approved'
			: status === 'supplement'
				? 'topic_supplement_requested'
				: 'topic_rejected';
	const title =
		status === 'approved'
			? 'Đề tài của bạn đã được phê duyệt'
			: status === 'supplement'
				? 'Đề tài của bạn cần bổ sung thông tin'
				: 'Đề tài của bạn bị từ chối';
	await notifSvc.pushWithEmail(type, title, ids, {
		message: comment || null,
		refId: topicId,
		refType: 'topic',
		mailEvent: 'TOPIC_RESULT',
	});

	broadcast('update', { entity: 'topic' });
	return result.recordset[0];
};

const submit = async (topicId, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      EXEC sp_set_actor @actor_id;
      UPDATE topics SET status = 'submitted', updated_at = GETDATE(), updated_by = @actor_id
      WHERE id = @topic_id AND status = 'supplement';
      -- Nộp lại: reset verdict cũ, nếu không getApprovals vẫn trả kết quả duyệt lần trước
      IF @@ROWCOUNT > 0
        UPDATE approvals SET status = 'pending', comment = NULL,
          updated_at = GETDATE(), updated_by = @actor_id
        WHERE topic_id = @topic_id;
    `);

	// Thông báo cho các tài khoản có quyền duyệt / xem toàn bộ đề tài
	const ids = await findActiveUserIdsWhere(
		(u) => hasPermission(u, 'topics', 'approve') || scopeOf(u, 'topics') === 'all',
	);
	await notifSvc.pushWithEmail('topic_submitted', 'Có đề tài mới cần xét duyệt', ids, {
		refId: topicId,
		refType: 'topic',
		mailEvent: 'TOPIC_SUBMITTED',
	});

	const topic = await getById(topicId);
	broadcast('update', { entity: 'topic' });
	return topic;
};

const getApprovals = async (topicId) => {
	const pool = await getPool();
	const result = await pool.request().input('topic_id', sql.VarChar(15), topicId).query(`
      SELECT a.*, u.full_name AS approver_name
      FROM approvals a
      LEFT JOIN users u ON u.id = a.created_by
      WHERE a.topic_id = @topic_id
      ORDER BY a.created_at DESC
    `);
	return result.recordset;
};

module.exports = {
	submit,
	approve,
	getApprovals,
};
