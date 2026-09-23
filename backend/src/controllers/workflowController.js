const workflowEngineService = require('../services/workflowEngineService');
const { success, created, notFound } = require('../utils/response');

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

const getStatus = async (req, res, next) => {
	try {
		return success(res, await workflowEngineService.getStatusForEntity(req.query.resource, req.params.entityId));
	} catch (err) {
		next(err);
	}
};

module.exports = { listDefinitions, getDefinition, createDefinition, updateDefinition, removeDefinition, getStatus };
