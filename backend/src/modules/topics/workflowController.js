const workflowEngineService = require('./workflowEngineService');
const topicService = require('./topicService');
const { success, created, notFound } = require('../../utils/response');

const listDefinitions = async (req, res, next) => {
	try {
		return success(res, await workflowEngineService.listDefinitions(req.query.resource));
	} catch (err) {
		next(err);
	}
};

const getDefinition = async (req, res, next) => {
	try {
		const item = await workflowEngineService.getDefinition(req.params.id);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
};

const createDefinition = async (req, res, next) => {
	try {
		return created(res, await workflowEngineService.createDefinition(req.body, req.user.id));
	} catch (err) {
		next(err);
	}
};

const updateDefinition = async (req, res, next) => {
	try {
		const item = await workflowEngineService.updateDefinition(req.params.id, req.body, req.user.id);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật thành công');
	} catch (err) {
		next(err);
	}
};

const removeDefinition = async (req, res, next) => {
	try {
		await workflowEngineService.removeDefinition(req.params.id);
		return success(res, null, 'Xóa thành công');
	} catch (err) {
		next(err);
	}
};

// Tiến trình duyệt của 1 bản ghi: chỉ xem được khi bản ghi nằm trong phạm vi
// của người gọi (trước đây ai đăng nhập cũng xem được tiến trình của mọi đề
// tài theo mã). Engine v1 chỉ hỗ trợ đề tài — resource khác chưa có quy tắc
// phạm vi thì từ chối, không mặc định cho xem.
const getStatus = async (req, res, next) => {
	try {
		const resource = req.query.resource || 'topics';
		if (resource !== 'topics') {
			return res.status(400).json({ success: false, message: 'Loại dữ liệu không hỗ trợ quy trình duyệt' });
		}
		await topicService.assertTopicInScope(req.params.entityId, req.user);
		return success(res, await workflowEngineService.getStatusForEntity(resource, req.params.entityId));
	} catch (err) {
		next(err);
	}
};

module.exports = { listDefinitions, getDefinition, createDefinition, updateDefinition, removeDefinition, getStatus };
