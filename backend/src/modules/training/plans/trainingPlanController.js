const trainingPlanService = require('./trainingPlanService');
const { success, created, notFound } = require('../../../utils/response');
const { asyncHandler } = require('../../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
	return success(res, await trainingPlanService.getAll(req.query));
});

const listItemOptions = asyncHandler(async (req, res) => {
	return success(res, await trainingPlanService.listItemOptions());
});

const getById = asyncHandler(async (req, res) => {
	const item = await trainingPlanService.getById(req.params.id);
	if (!item) return notFound(res);
	return success(res, item);
});

const createOne = asyncHandler(async (req, res) => {
	return created(res, await trainingPlanService.create(req.body, req.user.id));
});

const updateOne = asyncHandler(async (req, res) => {
	const item = await trainingPlanService.update(req.params.id, req.body, req.user.id);
	if (!item) return notFound(res);
	return success(res, item, 'Cập nhật thành công');
});

const removeOne = asyncHandler(async (req, res) => {
	await trainingPlanService.remove(req.params.id);
	return success(res, null, 'Xóa thành công');
});

const setItems = asyncHandler(async (req, res) => {
	const items = await trainingPlanService.setItems(req.params.id, req.body.items, req.user.id);
	return success(res, items, 'Đã cập nhật hạng mục kế hoạch');
});

module.exports = { getAll, getById, listItemOptions, createOne, updateOne, removeOne, setItems };
