const { getPool, sql } = require('../../config/db');
const { scopeOf, hasPermission } = require('../../permissions/authz');
const { httpError } = require('../../utils/httpError');

// Phạm vi xem đề tài: không có quyền topics nào ⇒ chỉ đề tài mình tham gia.
const topicScope = (actor) => scopeOf(actor, 'topics') ?? 'own';

// ─── Kiểm tra theo bản ghi (chống IDOR) ─────────────────────────────────────
// authorizePermission ở route chỉ biết actor CÓ quyền topics:xxx, không biết
// đề tài cụ thể có nằm trong phạm vi của họ không: 'department' = cùng khoa,
// 'own' = là thành viên, 'all' = mọi đề tài. Mọi API thao tác theo mã đề tài
// phải qua 1 trong 2 hàm dưới (modules/topics/topics.routes.js gắn qua router.param).
const assertTopicInScope = async (topicId, actor) => {
	const scope = topicScope(actor);
	if (scope === 'all') return;
	const pool = await getPool();
	const row = (
		await pool
			.request()
			.input('id', sql.VarChar(15), String(topicId))
			.input('uid', sql.VarChar(20), actor.id).query(`
				SELECT t.department_id,
				       CASE WHEN EXISTS (SELECT 1 FROM topic_members
				                         WHERE topic_id = t.id AND user_id = @uid)
				            THEN 1 ELSE 0 END AS is_member
				FROM topics t WHERE t.id = @id
			`)
	).recordset[0];
	if (!row) throw httpError(404, 'Đề tài không tồn tại.');
	const allowed =
		scope === 'department' ? row.department_id === actor.department_id : row.is_member === 1;
	if (!allowed) {
		throw httpError(403, 'Không có quyền thao tác trên đề tài này');
	}
};

// Lọc danh sách mã đề tài (xuất dữ liệu theo lô) — chỉ giữ đề tài trong phạm vi.
const idsInScope = async (ids, actor) => {
	const list = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, 2000);
	if (!list.length || topicScope(actor) === 'all') return list;
	const allowed = [];
	for (const id of list) {
		try {
			await assertTopicInScope(id, actor);
			allowed.push(id);
		} catch {
			// ngoài phạm vi / không tồn tại — bỏ qua, không báo lỗi cho cả lô
		}
	}
	return allowed;
};

// Danh sách hành động hợp lệ cho đề tài theo status + quyền của actor — nguồn
// chân lý duy nhất để frontend ẩn/hiện nút phê duyệt/từ chối/bổ sung/nộp lại/
// cấp tài khoản, thay vì tự suy luận theo topic.status rải rác ở nhiều nơi
// (ApprovalDetailPanel.tsx, useTopicDrawer.ts...). Khớp ĐÚNG điều kiện mà mỗi
// route thật sự kiểm tra (vd 'submit' không đòi phải là leader/secretary vì
// backend /submit cũng không kiểm tra điều đó) — allowedActions không được
// lỏng/chặt hơn quyền thật ở route.
const computeAllowedActions = (topic, actor) => {
	if (!actor) return [];
	const actions = [];
	if (topic.status === 'submitted' && hasPermission(actor, 'topics', 'approve')) {
		actions.push('approve', 'reject', 'request_supplement');
	}
	if (topic.status === 'supplement' && hasPermission(actor, 'topics', 'update')) {
		actions.push('submit');
	}
	if (topic.status === 'approved' && hasPermission(actor, 'topics', 'update')) {
		actions.push('grant_accounts');
	}
	return actions;
};

module.exports = {
	assertTopicInScope,
	idsInScope,
	topicScope,
	computeAllowedActions,
};
