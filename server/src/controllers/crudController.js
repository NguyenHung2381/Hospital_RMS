const { success, created, notFound } = require('../utils/response');

const createCrudController = (service) => {
	const getAll = async (req, res, next) => {
		try {
			const result = await service.getAll(req.query);
			return success(res, result);
		} catch (err) {
			next(err);
		}
	};

	const getById = async (req, res, next) => {
		try {
			const item = await service.getById(req.params.id);
			if (!item) return notFound(res);
			return success(res, item);
		} catch (err) {
			next(err);
		}
	};

	const createOne = async (req, res, next) => {
		try {
			const item = await service.create(req.body, req.user.id);
			return created(res, item);
		} catch (err) {
			next(err);
		}
	};

	const updateOne = async (req, res, next) => {
		try {
			const item = await service.update(req.params.id, req.body, req.user.id);
			if (!item) return notFound(res);
			return success(res, item, 'Cập nhật thành công');
		} catch (err) {
			next(err);
		}
	};

	const removeOne = async (req, res, next) => {
		try {
			await service.remove(req.params.id, req.user.id);
			return success(res, null, 'Xóa thành công');
		} catch (err) {
			next(err);
		}
	};

	return { getAll, getById, createOne, updateOne, removeOne };
};

module.exports = { createCrudController };
