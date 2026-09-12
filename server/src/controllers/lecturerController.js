const lecturerService = require('../services/lecturerService');
const { success, created, notFound } = require('../utils/response');

const getAll = async (req, res, next) => {
	try {
		return success(res, await lecturerService.getAll(req.query));
	} catch (err) {
		next(err);
	}
};

const getById = async (req, res, next) => {
	try {
		const item = await lecturerService.getById(req.params.id);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
};

const createOne = async (req, res, next) => {
	try {
		return created(res, await lecturerService.create(req.body, req.user.id));
	} catch (err) {
		next(err);
	}
};

const updateOne = async (req, res, next) => {
	try {
		const item = await lecturerService.update(req.params.id, req.body, req.user.id);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật thành công');
	} catch (err) {
		next(err);
	}
};

const removeOne = async (req, res, next) => {
	try {
		await lecturerService.remove(req.params.id, req.user.id);
		return success(res, null, 'Xóa thành công');
	} catch (err) {
		next(err);
	}
};

module.exports = { getAll, getById, createOne, updateOne, removeOne };
