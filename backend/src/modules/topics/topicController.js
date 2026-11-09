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
const topicLegacyService = require('./topicLegacyService');
const formCustomValueService = require('../forms/formCustomValueService');
const { sendWorkbook } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');
const { maskMembers, maskTopicMembers, maskExportTopics } = require('./memberEmailMask');

const base = createCrudController(topicService);

// Tài khoản khoa/phòng (phạm vi 'own') chỉ đăng ký được đề tài khi mốc
// "Đăng ký đề tài" của đợt đang mở. Đơn vị/superuser không bị chặn.
const createOne = asyncHandler(async (req, res) => {
	// Phạm vi khoa chỉ tạo đề tài của khoa mình (như topicService.update và
	// topicLegacyService.create) — nếu không đề tài 'submitted' chui vào danh sách /
	// hàng chờ duyệt của khoa khác, rồi chính người tạo bị chặn xem lại.
	if (topicPolicy.topicScope(req.user) === 'department') {
		const ownDept = req.user.department_id;
		const requestedDept = req.body.department_id;
		if (!ownDept || (requestedDept && requestedDept !== ownDept))
			throw httpError(403, 'Chỉ tạo được đề tài của khoa/phòng mình.');
		req.body.department_id = ownDept;
	}
	if (isDeadlineBound(req.user)) await assertRegistrationOpen(req.body.round_id);
	// is_legacy chỉ đặt qua createLegacy — chặn tự gán để né mốc thời gian (deadlineGuard)
	const item = await topicService.create({ ...req.body, is_legacy: false }, req.user.id);
	await formCustomValueService.save('topic', item.id, req.formCustom, req.user.id);
	if (req.formCustom) item.custom = { ...item.custom, ...req.formCustom };
	return created(res, maskTopicMembers(item, req.user));
});

// Nhập bổ sung đề tài đã hoàn thành (đợt cũ) — không xét mốc đăng ký, vào hàng chờ duyệt
const createLegacy = asyncHandler(async (req, res) => {
	const item = await topicLegacyService.create(req.body, req.user);
	await formCustomValueService.save('topic', item.id, req.formCustom, req.user.id);
	if (req.formCustom) item.custom = { ...item.custom, ...req.formCustom };
	return created(
		res,
		maskTopicMembers(item, req.user),
		'Đã gửi đề tài — chờ quản lý NCKH xác nhận',
	);
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
	return success(res, maskTopicMembers(item, req.user));
});

const getMembers = asyncHandler(async (req, res) => {
	const members = await topicMemberService.getMembers(req.params.id);
	// Trường tùy chỉnh (Cấu hình form) của từng thành viên
	const custom = await formCustomValueService.getMany(
		'topic_member',
		members.map((m) => m.id),
	);
	return success(
		res,
		maskMembers(
			members.map((m) => ({ ...m, custom: custom.get(m.id) || {} })),
			req.user,
		),
	);
});

const addMember = asyncHandler(async (req, res) => {
	await guardMemberEdit(req);
	const member = await topicMemberService.addMember(req.params.id, req.body, req.user.id);
	if (member?.id && req.formCustom)
		member.custom = await formCustomValueService.save(
			'topic_member',
			member.id,
			req.formCustom,
			req.user.id,
		);
	return created(res, maskMembers([member], req.user)[0], 'Thêm thành viên thành công');
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
	if (req.formCustom)
		member.custom = await formCustomValueService.save(
			'topic_member',
			req.params.member_id,
			req.formCustom,
			req.user.id,
		);
	return success(res, maskMembers([member], req.user)[0], 'Cập nhật thành viên thành công');
});

const deleteMember = asyncHandler(async (req, res) => {
	await guardMemberEdit(req);
	const deleted = await topicMemberService.deleteMember(
		req.params.id,
		req.params.member_id,
		req.user.id,
	);
	// Thành viên không thuộc đề tài trên URL (quyền xét theo đề tài đó) ⇒ 404 và KHÔNG
	// xóa giá trị trường tùy chỉnh của member_id lạ (form_custom_values không ràng buộc theo đề tài).
	if (!deleted) return notFound(res);
	await formCustomValueService.remove('topic_member', req.params.member_id);
	return success(res, null, 'Xóa thành viên thành công');
});

const grantAccounts = asyncHandler(async (req, res) => {
	// Đề tài nhập bổ sung: hạn tài khoản theo ngày kết thúc đợt cũ (đã qua) — không cấp
	const topic = await topicService.getById(req.params.id);
	if (topic?.is_legacy)
		throw httpError(400, 'Đề tài nhập bổ sung (đã hoàn thành) không cấp tài khoản thành viên.');
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
// luôn rơi vào nhánh cũ (topicApprovalService.approve) — không đổi hành vi hiện tại.
const approve = asyncHandler(async (req, res) => {
	const useWorkflow = await workflowEngineService.hasActiveDefinition('topics');
	if (useWorkflow) {
		// Engine mới chỉ xử lý approved/rejected — 'supplement' (yêu cầu bổ
		// sung) vẫn đi đường cũ vì workflow_tasks không có trạng thái tương ứng.
		if (req.body.status === 'supplement') {
			// Không đi qua advance() nên phải kiểm đúng người được phân công bước hiện tại
			await workflowEngineService.assertActorMayDecide('topics', req.params.id, req.user);
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
	return success(res, maskExportTopics(data, req.user));
});

const updateOne = asyncHandler(async (req, res) => {
	const item = await topicService.update(req.params.id, req.body, req.user.id, req.user);
	if (!item) return notFound(res);
	// Sau update(): service đã kiểm phạm vi + mốc thời gian của người sửa
	await formCustomValueService.save('topic', req.params.id, req.formCustom, req.user.id);
	if (req.formCustom) item.custom = { ...item.custom, ...req.formCustom };
	return success(res, maskTopicMembers(item, req.user), 'Cập nhật thành công');
});

const getAuthors = asyncHandler(async (req, res) => {
	return success(res, await topicAuthorService.listAuthors(req.params.id));
});

// Đồng tác giả là nội dung đề tài như thành viên/tiêu đề: phạm vi 'own' phải là
// chủ nhiệm/thư ký và trong mốc sửa/bổ sung đang mở (guardMemberEdit); phạm vi khoa
// chỉ sửa khi đề tài đang chờ duyệt / bổ sung (như topicService.update).
const setAuthors = asyncHandler(async (req, res) => {
	await guardMemberEdit(req);
	if (scopeOf(req.user, 'topics') === 'department') {
		const topic = await topicService.getById(req.params.id, req.user);
		if (!topic) return notFound(res);
		if (topic.status !== 'submitted' && topic.status !== 'supplement')
			throw httpError(403, 'Chỉ có thể chỉnh sửa đề tài ở trạng thái "Chờ duyệt" hoặc "Bổ sung".');
	}
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
	createLegacy,
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
