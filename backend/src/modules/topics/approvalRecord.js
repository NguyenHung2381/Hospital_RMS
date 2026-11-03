/**
 * approvalRecord.js — phiếu duyệt (bảng approvals) của đề tài.
 *
 * Đề tài vào trạng thái 'submitted' mà chưa có phiếu ⇒ tạo phiếu 'pending'
 * mã 'PD' + mã đề tài. Trước đây trigger trg_topic_auto_approval làm việc này
 * ngầm trong DB; giờ code gọi rõ ở topicService (tạo đề tài, đổi trạng thái).
 * Trigger còn trong DB tới bản phát hành sau (bản backend cũ vẫn cần nó khi
 * deploy cuốn chiếu) ⇒ câu này chỉ thêm khi chưa có, chạy sau trigger vẫn đúng.
 *
 * Tham số: @id (mã đề tài), @apv_id ('PD' + mã đề tài), @actor_id (người thao
 * tác; NULL thì lấy người tạo đề tài, như trigger cũ).
 */
const { sql } = require('../../config/db');

// CAST trong danh sách SELECT: PG không tự suy kiểu cho tham số vừa ở SELECT vừa ở WHERE
const ENSURE_APPROVAL_SQL = `
  INSERT INTO approvals (id, topic_id, status, created_by)
  SELECT CAST(@apv_id AS VARCHAR(20)), CAST(@id AS VARCHAR(15)), 'pending', COALESCE(@actor_id, (SELECT created_by FROM topics WHERE id = @id))
  WHERE NOT EXISTS (SELECT 1 FROM approvals WHERE topic_id = @id)`;

const approvalIdOf = (topicId) => `PD${topicId}`;

/** Tạo phiếu duyệt 'pending' nếu đề tài chưa có (gọi trong transaction ghi đề tài). */
const ensureApproval = (tx, topicId, actorId) =>
	tx
		.request()
		.input('id', sql.VarChar(15), topicId)
		.input('apv_id', sql.VarChar(20), approvalIdOf(topicId))
		.input('actor_id', sql.VarChar(20), actorId ?? null)
		.query(ENSURE_APPROVAL_SQL);

// Trạng thái đề tài → trạng thái phiếu duyệt. Chỉ map trạng thái có ở approvals
// (CHK: pending|approved|rejected|supplement); cancelled/completed giữ nguyên phiếu.
const APV_STATUS_BY_TOPIC = {
	submitted: 'pending',
	approved: 'approved',
	rejected: 'rejected',
	supplement: 'supplement',
};

/**
 * Đổi trạng thái đề tài qua đường sửa chung (không phải topicApprovalService.approve)
 * thì đồng bộ luôn phiếu duyệt, nếu không approvals kẹt ở giá trị cũ và các chỗ đọc
 * nó (vd card "Phê duyệt gần đây" ở Dashboard) hiển thị sai. Sang 'submitted' mà
 * chưa có phiếu thì tạo phiếu. updated_at/updated_by của approvals do trigger audit
 * ghi (request đã ghi người thao tác trong cùng transaction).
 * Thêm tham số vào `req` (cần sẵn @id, @actor_id); trả danh sách câu, `updateSql`
 * đứng đầu — chạy lần lượt trong cùng transaction (actorRequest().query(mảng)).
 * @param {{ input: (...args: any[]) => any }} req
 * @param {string} updateSql
 * @param {string} topicId
 * @param {string | undefined} status
 */
const withApprovalSync = (req, updateSql, topicId, status) => {
	const stmts = [updateSql];
	if (status === 'submitted') {
		req.input('apv_id', sql.VarChar(20), approvalIdOf(topicId));
		stmts.push(ENSURE_APPROVAL_SQL);
	}
	const apvStatus = status !== undefined ? APV_STATUS_BY_TOPIC[status] : undefined;
	if (apvStatus) {
		req.input('apv_status', sql.VarChar(15), apvStatus);
		stmts.push(
			'UPDATE approvals SET status = @apv_status WHERE topic_id = @id AND status <> @apv_status',
		);
	}
	return stmts;
};

module.exports = { ENSURE_APPROVAL_SQL, approvalIdOf, ensureApproval, withApprovalSync };
