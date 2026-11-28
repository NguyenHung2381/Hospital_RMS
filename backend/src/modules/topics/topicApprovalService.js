const { getPool, sql, withActorTransaction, nowSql } = require('../../config/db');
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

// Trạng thái đề tài được phép ra quyết định duyệt. Mặc định chỉ đề tài đang chờ duyệt
// (đúng như topicPolicy cho hiện nút) — trước đây server không kiểm, gọi thẳng API là
// đổi được đề tài đã từ chối / đã duyệt / đang nháp, kèm thông báo + dòng tiến độ sai.
// Job tự từ chối đề tài quá hạn bổ sung (jobs/supplementDeadlineJob) truyền ['supplement'].
// Sửa trạng thái trực tiếp (quản trị chỉnh dữ liệu) đi đường PUT /topics/:id, không qua đây.
const DECIDABLE_FROM = ['submitted', 'supplement'];
const STATUS_LABEL = {
	draft: 'Nháp',
	submitted: 'Chờ duyệt',
	supplement: 'Đang chờ bổ sung',
	approved: 'Đã duyệt',
	rejected: 'Đã từ chối',
	cancelled: 'Đã hủy',
	completed: 'Hoàn thành',
};
const notDecidable = (status) =>
	httpError(
		409,
		`Đề tài đang ở trạng thái "${STATUS_LABEL[status] ?? status}" — chỉ duyệt được đề tài đang chờ duyệt.`,
	);

// Kiểm trước (không khoá) — dùng trước bước tốn kém như ký số phiếu duyệt, để không ký
// phiếu cho quyết định chắc chắn bị từ chối. approve() vẫn kiểm lại trong transaction.
const assertDecidable = async (topicId, from = ['submitted']) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId)
		.query('SELECT status FROM topics WHERE id = @topic_id');
	const row = r.recordset[0];
	if (!row) throw httpError(404, 'Không tìm thấy đề tài');
	if (!from.includes(row.status)) throw notDecidable(row.status);
};

// Ghi quyết định duyệt: phiếu duyệt + trạng thái đề tài + 1 dòng tiến độ, trong
// 1 transaction (trước là sp_approve_topic). Không tự cấp tài khoản thành viên
// nữa — việc đó làm ở "Cấp tài khoản" (topicMemberService.grantAccounts, có mật
// khẩu tạm thật). Thông báo gửi 1 lần ở dưới (thủ tục cũ gửi thêm 1 lần trong DB).
// opts.from: trạng thái hiện tại được phép (mặc định ['submitted']).
const approve = async (topicId, status, comment, actorId, { from = ['submitted'] } = {}) => {
	if (!DECISIONS.includes(status)) throw httpError(400, 'Quyết định không hợp lệ');
	const allowed = from.filter((s) => DECIDABLE_FROM.includes(s));
	if (!allowed.length) throw new Error('approve(): opts.from không hợp lệ');
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
		// Đổi trạng thái có điều kiện: câu UPDATE khoá dòng đề tài, 2 người duyệt cùng lúc
		// thì người sau thấy trạng thái mới và bị chặn (không ghi đè quyết định người trước).
		// `allowed` đã lọc theo DECIDABLE_FROM (hằng trong code) nên ghép thẳng được.
		const moved = await req().query(
			`UPDATE topics SET status = @decision
			 WHERE id = @topic_id AND status IN (${allowed.map((s) => `'${s}'`).join(', ')})`,
		);
		if (!moved.rowsAffected[0]) {
			const cur = await req().query('SELECT status FROM topics WHERE id = @topic_id');
			throw notDecidable(cur.recordset[0]?.status);
		}
		await req().query(
			'UPDATE approvals SET status = @decision, comment = @comment WHERE topic_id = @topic_id',
		);
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
	await withActorTransaction(actorId, async (tx) => {
		const req = () =>
			tx
				.request()
				.input('topic_id', sql.VarChar(15), topicId)
				.input('actor_id', sql.VarChar(20), actorId);
		const r = await req().query(`
      UPDATE topics SET status = 'submitted', updated_at = ${nowSql}, updated_by = @actor_id
      WHERE id = @topic_id AND status = 'supplement'`);
		// Nộp lại: reset verdict cũ, nếu không getApprovals vẫn trả kết quả duyệt lần trước
		if (r.rowsAffected[0] > 0) {
			await req().query(`
        UPDATE approvals SET status = 'pending', comment = NULL,
          updated_at = ${nowSql}, updated_by = @actor_id
        WHERE topic_id = @topic_id`);
		}
	});

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

// Lịch sử duyệt, mới nhất trước: { id, topic_id, status, comment, created_at, created_by,
// approver_name } — created_at / created_by = LÚC / NGƯỜI ra quyết định.
// Phiếu approvals chỉ có 1 dòng / đề tài, bị ghi đè mỗi lần quyết định, và created_by của
// nó là người NỘP đề tài — trước đây trả thẳng phiếu nên lịch sử chỉ còn lần cuối, hiện
// người nộp làm "người duyệt" và giờ nộp làm "giờ duyệt". Mỗi quyết định đã ghi 1 dòng
// topic_progress (người thao tác, thời điểm, nhận xét) ⇒ dựng lịch sử từ đó. Phiếu đang
// chờ duyệt (nộp / nộp lại) đứng đầu với người nộp + lúc nộp; dữ liệu cũ chưa có dòng
// tiến độ quyết định thì dùng phiếu (người / lúc sửa cuối do trigger audit ghi).
const getApprovals = async (topicId) => {
	const pool = await getPool();
	const req = pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId)
		.input('l_approved', sql.NVarChar(255), PROGRESS_TEXT.approved)
		.input('l_supplement', sql.NVarChar(255), PROGRESS_TEXT.supplement)
		.input('l_rejected', sql.NVarChar(255), PROGRESS_TEXT.rejected);
	const result = await req.query(`
      SELECT h.id, h.topic_id, h.status, h.comment, h.created_at, h.created_by,
             u.full_name AS approver_name
      FROM (
        SELECT tp.id, tp.topic_id,
               CASE tp.status WHEN @l_approved THEN 'approved'
                              WHEN @l_supplement THEN 'supplement'
                              ELSE 'rejected' END AS status,
               tp.note AS comment, tp.created_at, tp.created_by
        FROM topic_progress tp
        WHERE tp.topic_id = @topic_id AND tp.status IN (@l_approved, @l_supplement, @l_rejected)
        UNION ALL
        SELECT a.id, a.topic_id, a.status, a.comment,
               COALESCE(a.updated_at, a.created_at), COALESCE(a.updated_by, a.created_by)
        FROM approvals a
        WHERE a.topic_id = @topic_id
          AND (a.status = 'pending' OR NOT EXISTS (
                SELECT 1 FROM topic_progress tp
                WHERE tp.topic_id = a.topic_id
                  AND tp.status IN (@l_approved, @l_supplement, @l_rejected)))
      ) h
      LEFT JOIN users u ON u.id = h.created_by
      ORDER BY h.created_at DESC, h.id DESC
    `);
	return result.recordset;
};

module.exports = {
	submit,
	approve,
	assertDecidable,
	getApprovals,
};
