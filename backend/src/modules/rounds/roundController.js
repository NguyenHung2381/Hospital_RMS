const roundService = require('./roundService');
const { success, created, notFound } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
	const result = await roundService.getAll(req.query);
	return success(res, result);
});

const getById = asyncHandler(async (req, res) => {
	const item = await roundService.getById(req.params.id);
	if (!item) return notFound(res);
	return success(res, item);
});

const createOne = asyncHandler(async (req, res) => {
	const item = await roundService.create(req.body, req.user.id);
	return created(res, item, 'Tạo đợt nghiên cứu thành công');
});

const updateOne = asyncHandler(async (req, res) => {
	const item = await roundService.update(req.params.id, req.body, req.user.id);
	if (!item) return notFound(res);
	return success(res, item, 'Cập nhật đợt nghiên cứu thành công');
});

const removeOne = asyncHandler(async (req, res) => {
	await roundService.remove(req.params.id, req.user.id);
	return success(res, null, 'Xóa đợt nghiên cứu thành công');
});

module.exports = { getAll, getById, createOne, updateOne, removeOne };
