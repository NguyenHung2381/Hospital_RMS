const lecturerService = require('./lecturerService');
const { success, created, notFound } = require('../../../utils/response');
const { asyncHandler } = require('../../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
	return success(res, await lecturerService.getAll(req.query));
});

const getById = asyncHandler(async (req, res) => {
	const item = await lecturerService.getById(req.params.id);
	if (!item) return notFound(res);
	return success(res, item);
});

const createOne = asyncHandler(async (req, res) => {
	return created(res, await lecturerService.create(req.body, req.user.id));
});

const updateOne = asyncHandler(async (req, res) => {
	const item = await lecturerService.update(req.params.id, req.body, req.user.id);
	if (!item) return notFound(res);
	return success(res, item, 'Cập nhật thành công');
});

const removeOne = asyncHandler(async (req, res) => {
	await lecturerService.remove(req.params.id, req.user.id);
	return success(res, null, 'Xóa thành công');
});

module.exports = { getAll, getById, createOne, updateOne, removeOne };
