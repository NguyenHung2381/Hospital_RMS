const { getPool, sql, withActorTransaction } = require('../../config/db');
const notifSvc = require('../notifications/notificationService');
const { broadcast } = require('../events/eventService');
const { scopeOf, hasPermission } = require('../../permissions/authz');
const { findActiveUserIdsWhere } = require('../access/permissionService');
const { getById } = require('./topicService');
const { httpError } = require('../../utils/httpError');
const { genProgressId } = require('../../utils/idGenerator');

const DECISIONS = ['approved', 'rejected', 'supplement'];
// Dòng tiến độ ghi kèm mỗi quyết định
const PROGRESS_TEXT = {
	approved: 'Đề tài được phê duyệt',
	supplement: 'Đề tài cần bổ sung, chỉnh sửa',
	rejected: 'Đề tài bị từ chối',
};

// Ghi quyết định duyệt: phiếu duyệt + trạng thái đề tài + 1 dòng tiến độ, trong
// 1 transaction (trước là sp_approve_topic). Không tự cấp tài khoản thành viên
// nữa — việc đó làm ở "Cấp tài khoản" (topicMemberService.grantAccounts, có mật
// khẩu tạm thật). Thông báo gửi 1 lần ở dưới (thủ tục cũ gửi thêm 1 lần trong DB).
const approve = async (topicId, status, comment, actorId) => {
	if (!DECISIONS.includes(status)) throw httpError(400, 'Quyết định không hợp lệ');
	await withActorTransaction(actorId, async (tx) => {
		const req = () =>
			tx
				.request()
				.input('topic_id', sql.VarChar(15), topicId)
				.input('decision', sql.VarChar(15), status)
				.input('comment', sql.NVarChar(sql.MAX), comment || null)
				.input('actor_id', sql.VarChar(20), actorId);
		const found = await req().query('SELECT 1 AS x FROM approvals WHERE topic_id = @topic_id');
		if (!found.recordset.length) {
			throw httpError(404, `Không tìm thấy bản ghi phê duyệt cho đề tài ${topicId}`);
		}
		await req().query(
			'UPDATE approvals SET status = @decision, comment = @comment WHERE topic_id = @topic_id',
		);
		await req().query('UPDATE topics SET status = @decision WHERE id = @topic_id');
		await req()
			.input('id', sql.VarChar(22), await genProgressId(tx, topicId))
			.input('note_status', sql.NVarChar(255), PROGRESS_TEXT[status]).query(`
        INSERT INTO topic_progress (id, topic_id, status, note, created_by)
        VALUES (@id, @topic_id, @note_status, @comment, @actor_id)`);
	});
	const pool = await getPool();

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
	return { message: 'Thành công', topic_id: topicId, decision: status };
};

const submit = async (topicId, actorId) => {
	await withActorTransaction(actorId, (tx) =>
		tx
			.request()
			.input('topic_id', sql.VarChar(15), topicId)
			.input('actor_id', sql.VarChar(20), actorId).query(`
      UPDATE topics SET status = 'submitted', updated_at = GETDATE(), updated_by = @actor_id
      WHERE id = @topic_id AND status = 'supplement';
      -- Nộp lại: reset verdict cũ, nếu không getApprovals vẫn trả kết quả duyệt lần trước
      IF @@ROWCOUNT > 0
        UPDATE approvals SET status = 'pending', comment = NULL,
          updated_at = GETDATE(), updated_by = @actor_id
        WHERE topic_id = @topic_id;
    `),
	);

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
