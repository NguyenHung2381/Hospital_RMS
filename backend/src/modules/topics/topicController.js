const topicApprovalService = require('./topicApprovalService');
const topicPolicy = require('./topicPolicy');
const topicService = require('./topicService');
const topicMemberService = require('./topicMemberService');
const topicAuthorService = require('./topicAuthorService');
const workflowEngineService = require('./workflowEngineService');
const { success, created, notFound } = require('../../utils/response');
const { createCrudController } = require('../../shared/crudController');
const { httpError } = require('../../utils/httpError');
const { assertTopicActionWindow, assertRegistrationOpen } = require('./deadlineGuard');
const { isDeadlineBound, scopeOf, hasPermission } = require('../../permissions/authz');
const topicImportService = require('./topicImportService');
const { sendWorkbook } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

const base = createCrudController(topicService);

// Tài khoản khoa phòng (phạm vi 'own') chỉ đăng ký được đề tài khi mốc
// "Đăng ký đề tài" của đợt đang mở. Đơn vị/superuser không bị chặn.
const createOne = asyncHandler(async (req, res) => {
	if (isDeadlineBound(req.user)) {
		await assertRegistrationOpen(req.body.round_id);
		await topicService.assertLevelForRound(
			req.body.round_id,
			req.body.level_id,
			req.body.article_type,
		);
	}
	const item = await topicService.create(req.body, req.user.id);
	return created(res, item);
});

// Tài khoản thành viên (chủ nhiệm/thư ký) chỉ được sửa thành viên khi có mốc
// "Sửa" hoặc "Bổ sung" (bật mục Thành viên) đang mở. Đơn vị/superuser không bị chặn.
async function guardMemberEdit(req) {
	if (isDeadlineBound(req.user)) {
		await assertTopicActionWindow(req.params.id, req.user.id, 'edit-members');
	}
}

const getAll = asyncHandler(async (req, res) => {
	const result = await topicService.getAll(req.query, req.user);
	return success(res, result);
});

const getById = asyncHandler(async (req, res) => {
	const item = await topicService.getById(req.params.id, req.user);
	if (!item) return notFound(res);
	return success(res, item);
});

const getMembers = asyncHandler(async (req, res) => {
	const members = await topicMemberService.getMembers(req.params.id);
	return success(res, members);
});

const addMember = asyncHandler(async (req, res) => {
	await guardMemberEdit(req);
	const member = await topicMemberService.addMember(req.params.id, req.body, req.user.id);
	return created(res, member, 'Thêm thành viên thành công');
});

const updateMember = asyncHandler(async (req, res) => {
	await guardMemberEdit(req);
	const member = await topicMemberService.updateMember(
		req.params.id,
		req.params.member_id,
		req.body,
		req.user.id,
	);
	if (!member) return notFound(res);
	return success(res, member, 'Cập nhật thành viên thành công');
});

const deleteMember = asyncHandler(async (req, res) => {
	await guardMemberEdit(req);
	await topicMemberService.deleteMember(req.params.id, req.params.member_id, req.user.id);
	return success(res, null, 'Xóa thành viên thành công');
});

const grantAccounts = asyncHandler(async (req, res) => {
	const result = await topicMemberService.grantAccounts(
		req.params.id,
		req.body.member_ids,
		req.user.id,
	);
	return success(res, result, 'Cấp tài khoản thành công');
});

const submit = asyncHandler(async (req, res) => {
	const result = await topicApprovalService.submit(req.params.id, req.user.id);
	return success(res, result, 'Nộp đề tài thành công');
});

// Nếu có workflow_definitions đang active cho resource 'topics' (admin phải
// chủ động tạo + bật, xem 2026-10-06_workflow_engine.sql) → đi qua engine mới
// (nhiều bước, gán theo vai trò). Mặc định KHÔNG có định nghĩa nào active nên
// luôn rơi vào nhánh cũ (sp_approve_topic) — không đổi hành vi hiện tại.
const approve = asyncHandler(async (req, res) => {
	const useWorkflow = await workflowEngineService.hasActiveDefinition('topics');
	if (useWorkflow) {
		// Engine mới chỉ xử lý approved/rejected — 'supplement' (yêu cầu bổ
		// sung) vẫn đi đường cũ vì workflow_tasks không có trạng thái tương ứng.
		if (req.body.status === 'supplement') {
			const result = await topicApprovalService.approve(
				req.params.id,
				req.body.status,
				req.body.comment,
				req.user.id,
			);
			return success(res, result, 'Xử lý phê duyệt thành công');
		}
		const outcome = await workflowEngineService.advance(
			'topics',
			req.params.id,
			req.body.status,
			req.user,
			req.body.comment,
		);
		return success(res, outcome, 'Đã cập nhật bước duyệt');
	}
	const result = await topicApprovalService.approve(
		req.params.id,
		req.body.status,
		req.body.comment,
		req.user.id,
	);
	return success(res, result, 'Xử lý phê duyệt thành công');
});

const getApprovals = asyncHandler(async (req, res) => {
	const approvals = await topicApprovalService.getApprovals(req.params.id);
	return success(res, approvals);
});

const exportData = asyncHandler(async (req, res) => {
	const { ids } = req.body;
	if (!Array.isArray(ids) || ids.length === 0) return success(res, []);
	// Chỉ xuất đề tài trong phạm vi người gọi (danh sách mã do client gửi lên)
	const data = await topicService.getForExport(await topicPolicy.idsInScope(ids, req.user));
	return success(res, data);
});

const updateOne = asyncHandler(async (req, res) => {
	const item = await topicService.update(req.params.id, req.body, req.user.id, req.user);
	if (!item) return notFound(res);
	return success(res, item, 'Cập nhật thành công');
});

const getAuthors = asyncHandler(async (req, res) => {
	return success(res, await topicAuthorService.listAuthors(req.params.id));
});

const setAuthors = asyncHandler(async (req, res) => {
	const authors = await topicAuthorService.setAuthors(req.params.id, req.body.authors, req.user.id);
	return success(res, authors, 'Đã cập nhật danh sách đồng tác giả');
});

// Nhập Excel tạo đề tài cho mọi khoa → chỉ phạm vi 'all'
const assertImportScope = (user) => {
	if (scopeOf(user, 'topics') !== 'all') {
		throw httpError(403, 'Chỉ tài khoản quản lý toàn viện được nhập đề tài từ Excel.');
	}
};

const importTemplate = asyncHandler(async (req, res) => {
	assertImportScope(req.user);
	return sendWorkbook(res, await topicImportService.templateWorkbook(), 'mau-nhap-de-tai.xlsx');
});

const IMPORT_STATUSES = ['submitted', 'approved', 'rejected', 'cancelled'];

const importExcel = asyncHandler(async (req, res) => {
	assertImportScope(req.user);
	if (!req.file) return res.status(400).json({ success: false, message: 'Chưa chọn file Excel.' });
	const status = IMPORT_STATUSES.includes(req.body.status) ? req.body.status : 'submitted';
	if (status !== 'submitted' && !hasPermission(req.user, 'topics', 'approve')) {
		return res.status(403).json({
			success: false,
			message: 'Cần quyền phê duyệt đề tài để nhập với trạng thái khác "Chờ duyệt".',
		});
	}
	const out = await topicImportService.importExcel(
		{
			buffer: req.file.buffer,
			dry_run: req.body.dry_run === '1' || req.body.dry_run === 'true',
			defaults: {
				round_id: req.body.round_id || null,
				category_id: req.body.category_id || null,
				level_id: req.body.level_id || null,
				article_type: req.body.article_type === 'bai_bao' ? 'bai_bao' : 'de_tai',
				status,
			},
		},
		req.user.id,
	);
	return success(
		res,
		out,
		out.dry_run ? 'Đã đọc file — kiểm tra trước khi nhập' : `Đã nhập ${out.inserted} đề tài`,
	);
});

module.exports = {
	...base,
	importTemplate,
	importExcel,
	getAll,
	getById,
	createOne,
	updateOne,
	getMembers,
	addMember,
	updateMember,
	deleteMember,
	grantAccounts,
	submit,
	approve,
	getApprovals,
	exportData,
	getAuthors,
	setAuthors,
};
