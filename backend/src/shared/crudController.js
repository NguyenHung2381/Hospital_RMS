const { success, created, notFound } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const createCrudController = (service) => {
	const getAll = asyncHandler(async (req, res) => {
		const result = await service.getAll(req.query);
		return success(res, result);
	});

	const getById = asyncHandler(async (req, res) => {
		const item = await service.getById(req.params.id);
		if (!item) return notFound(res);
		return success(res, item);
	});

	const createOne = asyncHandler(async (req, res) => {
		const item = await service.create(req.body, req.user.id);
		return created(res, item);
	});

	const updateOne = asyncHandler(async (req, res) => {
		const item = await service.update(req.params.id, req.body, req.user.id);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật thành công');
	});

	const removeOne = asyncHandler(async (req, res) => {
		await service.remove(req.params.id, req.user.id);
		return success(res, null, 'Xóa thành công');
	});

	return { getAll, getById, createOne, updateOne, removeOne };
};

module.exports = { createCrudController };
