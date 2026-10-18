const workflowEngineService = require('./workflowEngineService');
const topicService = require('./topicService');
const { success, created, notFound } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

const listDefinitions = asyncHandler(async (req, res) => {
	return success(res, await workflowEngineService.listDefinitions(req.query.resource));
});

const getDefinition = asyncHandler(async (req, res) => {
	const item = await workflowEngineService.getDefinition(req.params.id);
	if (!item) return notFound(res);
	return success(res, item);
});

const createDefinition = asyncHandler(async (req, res) => {
	return created(res, await workflowEngineService.createDefinition(req.body, req.user.id));
});

const updateDefinition = asyncHandler(async (req, res) => {
	const item = await workflowEngineService.updateDefinition(req.params.id, req.body, req.user.id);
	if (!item) return notFound(res);
	return success(res, item, 'Cập nhật thành công');
});

const removeDefinition = asyncHandler(async (req, res) => {
	await workflowEngineService.removeDefinition(req.params.id);
	return success(res, null, 'Xóa thành công');
});

// Tiến trình duyệt của 1 bản ghi: chỉ xem được khi bản ghi nằm trong phạm vi
// của người gọi (trước đây ai đăng nhập cũng xem được tiến trình của mọi đề
// tài theo mã). Engine v1 chỉ hỗ trợ đề tài — resource khác chưa có quy tắc
// phạm vi thì từ chối, không mặc định cho xem.
const getStatus = asyncHandler(async (req, res) => {
	const resource = req.query.resource || 'topics';
	if (resource !== 'topics') {
		return res
			.status(400)
			.json({ success: false, message: 'Loại dữ liệu không hỗ trợ quy trình duyệt' });
	}
	await topicService.assertTopicInScope(req.params.entityId, req.user);
	return success(
		res,
		await workflowEngineService.getStatusForEntity(resource, req.params.entityId),
	);
});

module.exports = {
	listDefinitions,
	getDefinition,
	createDefinition,
	updateDefinition,
	removeDefinition,
	getStatus,
};
