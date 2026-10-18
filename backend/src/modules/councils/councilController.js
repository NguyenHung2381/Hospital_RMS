const councilService = require('./councilService');
const councilAssignmentService = require('./councilAssignmentService');
const councilAutoAssignService = require('./councilAutoAssignService');
const councilImportService = require('./councilImportService');
const { success, created, notFound } = require('../../utils/response');
const { createCrudController } = require('../../shared/crudController');
const { asyncHandler } = require('../../utils/asyncHandler');

const base = createCrudController(councilService);

const autoAssign = asyncHandler(async (req, res) => {
	const result = await councilAutoAssignService.autoAssign(req.body, req.user.id);
	return success(res, result, `Đã tạo ${result.councils_created} hội đồng nháp`);
});

const importExcel = asyncHandler(async (req, res) => {
	if (!req.file) {
		return res.status(400).json({ success: false, message: 'Chưa chọn file Excel.' });
	}
	if (!req.body.round_id) {
		return res.status(400).json({ success: false, message: 'Đợt nghiên cứu không được để trống.' });
	}
	const result = await councilImportService.importExcel(
		{
			buffer: req.file.buffer,
			round_id: req.body.round_id,
			dry_run: req.body.dry_run === '1' || req.body.dry_run === 'true',
		},
		req.user.id,
	);
	return success(
		res,
		result,
		result.dry_run
			? 'Đã đọc file — kiểm tra trước khi nhập'
			: `Đã nhập ${result.councils_created} hội đồng, gán ${result.topics_assigned} đề tài`,
	);
});

const getMembers = asyncHandler(async (req, res) => {
	return success(res, await councilService.getMembers(req.params.id));
});

const addMember = asyncHandler(async (req, res) => {
	const member = await councilService.addMember(req.params.id, req.body, req.user.id);
	return created(res, member, 'Thêm thành viên hội đồng thành công');
});

const updateMember = asyncHandler(async (req, res) => {
	const member = await councilService.updateMember(
		req.params.id,
		req.params.member_id,
		req.body,
		req.user.id,
	);
	if (!member) return notFound(res);
	return success(res, member, 'Cập nhật thành viên hội đồng thành công');
});

const removeMember = asyncHandler(async (req, res) => {
	await councilService.removeMember(req.params.id, req.params.member_id, req.user.id);
	return success(res, null, 'Xóa thành viên hội đồng thành công');
});

const getEligibleUsers = asyncHandler(async (req, res) => {
	return success(
		res,
		await councilService.getEligibleUsers(
			req.params.id,
			req.query.search || '',
			req.query.type || 'internal',
		),
	);
});

const getUnassignedTopics = asyncHandler(async (req, res) => {
	return success(res, await councilAssignmentService.getUnassignedTopics(req.query.round_id));
});

const getTopics = asyncHandler(async (req, res) => {
	return success(res, await councilAssignmentService.getTopics(req.params.id));
});

const assignTopics = asyncHandler(async (req, res) => {
	const result = await councilAssignmentService.assignTopics(
		req.params.id,
		req.body.topic_ids,
		req.user.id,
	);
	return success(res, result, 'Gán đề tài vào hội đồng thành công');
});

const unassignTopic = asyncHandler(async (req, res) => {
	await councilAssignmentService.unassignTopic(req.params.id, req.params.topic_id, req.user.id);
	return success(res, null, 'Bỏ gán đề tài khỏi hội đồng thành công');
});

const setTopicSession = asyncHandler(async (req, res) => {
	await councilAssignmentService.setTopicSession(
		req.params.id,
		req.params.topic_id,
		req.body.session,
		req.user.id,
	);
	return success(res, null, 'Cập nhật buổi bảo vệ thành công');
});

const setSeatSubstitute = asyncHandler(async (req, res) => {
	await councilAssignmentService.setSeatSubstitute(
		req.params.id,
		req.params.topic_id,
		req.body.role,
		req.body.user_id,
		req.user.id,
	);
	return success(res, null, 'Cập nhật ghế thay thế thành công');
});

const removeSeatSubstitute = asyncHandler(async (req, res) => {
	await councilAssignmentService.removeSeatSubstitute(
		req.params.id,
		req.params.topic_id,
		req.params.role,
		req.user.id,
	);
	return success(res, null, 'Xóa ghế thay thế thành công');
});

module.exports = {
	...base,
	autoAssign,
	importExcel,
	getMembers,
	addMember,
	updateMember,
	removeMember,
	getEligibleUsers,
	getUnassignedTopics,
	getTopics,
	assignTopics,
	unassignTopic,
	setTopicSession,
	setSeatSubstitute,
	removeSeatSubstitute,
};
