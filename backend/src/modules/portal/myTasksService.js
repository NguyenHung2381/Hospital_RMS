const topicService = require('../topics/topicService');
const councilProgressService = require('../councils/councilProgressService');
const signRequestService = require('../signing/requests/signRequestService');
const signingConfig = require('../signing/signingConfig');

// Hộp thư "Việc của tôi" — gộp 2 nguồn việc-cần-làm ĐÃ tính theo người dùng cụ
// thể (không chỉ theo quyền chung chung, vốn không nói lên "việc CỦA TÔI"):
//   1. Đề tài đang chờ duyệt mà actor có quyền duyệt (allowed_actions chứa
//      'approve', đã tính sẵn ở topicPolicy.computeAllowedActions).
//   2. Đề tài actor giữ ghế hội đồng nhưng CHƯA tự mình chấm tiến độ (không có
//      review nào trong council_progress_reviews mang user_id = actor), và đề
//      tài đó chưa có kết luận cuối (result = null — đã kết luận thì không
//      còn là "việc cần làm" nữa dù trước đó chưa chấm).
const getMyTasks = async (actor) => {
	const [topicResult, progressList, signTodo] = await Promise.all([
		topicService.getAll({ status: 'submitted', limit: 0 }, actor),
		councilProgressService.getMyProgress(actor.id).catch(() => []),
		// 3. Hồ sơ trình ký đang tới lượt actor ký (không tính khi quản trị tắt Trình ký văn bản)
		/** @type {Promise<{ items: any[] }>} */ (
			(async () =>
				(await signingConfig.isFeatureOn('sign_requests'))
					? signRequestService.list(actor, { box: 'todo' }, { offset: 0, limit: 50, page: 1 })
					: { items: [] })().catch(() => ({ items: [] }))
		),
	]);

	const approvals = topicResult.data.filter((t) => (t.allowed_actions || []).includes('approve'));

	const progressReviews = progressList.filter(
		(t) => !t.result && t.reviews.every((r) => r.user_id !== actor.id),
	);

	return {
		approvals: approvals.map((t) => ({
			id: t.id,
			title: t.title,
			status: t.status,
			department_name: t.department_name,
			round_name: t.round_name,
			created_at: t.created_at,
		})),
		progress_reviews: progressReviews.map((t) => ({
			id: t.id,
			title: t.title,
			my_role: t.my_role,
			council_id: t.council_id,
			council_name: t.council_name,
			defense_date: t.defense_date,
			department_name: t.department_name,
		})),
		sign_requests: signTodo.items.map((r) => ({
			id: r.id,
			title: r.title,
			creator_name: r.creator_name,
			doc_count: r.doc_count,
			due_date: r.due_date,
			created_at: r.created_at,
		})),
		total: approvals.length + progressReviews.length + signTodo.items.length,
	};
};

module.exports = { getMyTasks };
