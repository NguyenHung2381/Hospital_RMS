/**
 * topicLegacyService.js — Nhập bổ sung đề tài ĐÃ HOÀN THÀNH ở cổng nhân viên
 * (/user/nhap-de-tai): đợt đã làm xong trước khi có hệ thống nên không có hồ sơ.
 *
 * - Chỉ chọn đợt có sẵn (quản lý NCKH tạo đợt cũ trước ở trang Đợt nghiên cứu),
 *   không xét mốc "Đăng ký đề tài" của đợt.
 * - Đề tài vào hàng "Chờ duyệt" (trigger trg_topic_auto_approval tạo approvals)
 *   với is_legacy = 1 để người duyệt biết đây là đề tài đã hoàn thành.
 * - File đính kèm tải lên sau qua POST /topics/:id/files — deadlineGuard cho chủ
 *   nhiệm/thư ký thao tác với đề tài is_legacy đang chờ duyệt/bổ sung.
 */
const { getPool, sql } = require('../../config/db');
const notifSvc = require('../notifications/notificationService');
const { findActiveUserIdsWhere } = require('../access/permissionService');
const { scopeOf, hasPermission } = require('../../permissions/authz');
const { norm } = require('../../utils/vietnameseText');
const { httpError } = require('../../utils/httpError');
const topicService = require('./topicService');
const topicMemberService = require('./topicMemberService');
const { topicScope } = require('./topicPolicy');

const ACCEPTANCE_RATINGS = ['xuat_sac', 'tot', 'kha', 'dat', 'khong_dat'];

const toStaffNumber = (v) => {
	if (v == null || v === '') return null;
	const n = parseInt(String(v), 10);
	return Number.isNaN(n) ? null : n;
};

const loadContext = async (roundId, actorId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('rid', sql.VarChar(10), roundId)
		.input('uid', sql.VarChar(20), actorId).query(`
      SELECT id, name, status FROM research_rounds WHERE id = @rid;
      SELECT title FROM topics WHERE round_id = @rid;
      SELECT staff_number FROM users WHERE id = @uid;
    `);
	const [rounds, titles, users] = r.recordsets;
	return {
		round: rounds[0] ?? null,
		titles: new Set(titles.map((t) => norm(t.title))),
		actorStaffNumber: users[0]?.staff_number != null ? Number(users[0].staff_number) : null,
	};
};

// Thành viên là chính người nhập: chọn từ gợi ý (user_id) hoặc trùng mã nhân viên.
const isActorMember = (m, actorId, actorStaffNumber) =>
	m.user_id === actorId ||
	(actorStaffNumber != null && toStaffNumber(m.staff_number) === actorStaffNumber);

const create = async (data, actor) => {
	const members = Array.isArray(data.members) ? data.members : [];
	const ctx = await loadContext(data.round_id, actor.id);

	if (!ctx.round) throw httpError(400, 'Đợt nghiên cứu không tồn tại.');
	if (String(ctx.round.status).trim().toLowerCase() === 'cancelled')
		throw httpError(400, `Đợt "${ctx.round.name}" đã bị hủy — chọn đợt khác.`);
	if (ctx.titles.has(norm(data.title)))
		throw httpError(409, `Đợt "${ctx.round.name}" đã có đề tài cùng tên.`);

	const scope = topicScope(actor);
	// Phạm vi khoa chỉ nhập đề tài của khoa mình (như topicService.update)
	if (scope === 'department' && data.department_id !== actor.department_id)
		throw httpError(403, 'Chỉ nhập được đề tài của khoa/phòng mình.');
	if (!members.some((m) => m.role === 'leader')) throw httpError(400, 'Đề tài cần có chủ nhiệm.');
	// Phạm vi 'own' chỉ thấy đề tài mình tham gia — không có tên trong đề tài thì
	// nhập xong sẽ không xem / bổ sung file được nữa.
	const self = members.find((m) => isActorMember(m, actor.id, ctx.actorStaffNumber));
	if (scope === 'own' && !(self && (self.role === 'leader' || self.role === 'secretary'))) {
		throw httpError(
			400,
			'Bạn cần có tên trong danh sách thành viên với vai trò Chủ nhiệm hoặc Thư ký.',
		);
	}

	const topic = await topicService.create(
		{
			title: data.title,
			description: data.description,
			round_id: data.round_id,
			category_id: data.category_id,
			department_id: data.department_id,
			article_type: 'de_tai',
			is_legacy: true,
			acceptance_rating: data.acceptance_rating,
			acceptance_score:
				data.acceptance_score === '' || data.acceptance_score == null
					? null
					: Number(data.acceptance_score),
			acceptance_date: data.acceptance_date,
		},
		actor.id,
	);

	try {
		const pool = await getPool();
		for (const m of members) {
			const { id } = await topicMemberService.addMember(
				topic.id,
				{
					ho_ten: m.ho_ten,
					email: m.email,
					so_dien_thoai: m.so_dien_thoai,
					chuc_vu: m.chuc_vu,
					staff_number: m.staff_number,
					department_id: m.department_id || data.department_id,
					role: m.role,
				},
				actor.id,
			);
			// Gắn tài khoản người nhập vào dòng thành viên của chính họ — phạm vi
			// 'own' dựa vào topic_members.user_id để thấy đề tài.
			if (m === self) {
				await pool
					.request()
					.input('id', sql.VarChar(22), id)
					.input('uid', sql.VarChar(20), actor.id)
					.query('UPDATE topic_members SET user_id = @uid WHERE id = @id AND user_id IS NULL');
			}
		}
	} catch (err) {
		// Không để lại đề tài thiếu thành viên — người dùng nhập lại từ đầu
		await topicService.remove(topic.id, actor.id).catch(() => {});
		throw err;
	}

	const approvers = await findActiveUserIdsWhere(
		(u) => hasPermission(u, 'topics', 'approve') || scopeOf(u, 'topics') === 'all',
	);
	await notifSvc
		.pushWithEmail('topic_submitted', 'Có đề tài đã hoàn thành cần xác nhận', approvers, {
			message: `${topic.title} — ${ctx.round.name}`,
			refId: topic.id,
			refType: 'topic',
			mailEvent: 'TOPIC_SUBMITTED',
		})
		.catch(() => {}); // lỗi gửi thông báo không làm hỏng việc nhập

	return topicService.getById(topic.id);
};

module.exports = { create, ACCEPTANCE_RATINGS };
