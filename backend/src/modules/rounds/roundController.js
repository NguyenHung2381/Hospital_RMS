const roundService = require('./roundService');
const { success, created, notFound } = require('../../utils/response');

const getAll = async (req, res, next) => {
	try {
		const result = await roundService.getAll(req.query);
		return success(res, result);
	} catch (err) {
		next(err);
	}
};

const getById = async (req, res, next) => {
	try {
		const item = await roundService.getById(req.params.id);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
};

const createOne = async (req, res, next) => {
	try {
		const item = await roundService.create(req.body, req.user.id);
		return created(res, item, 'Tạo đợt nghiên cứu thành công');
	} catch (err) {
		next(err);
	}
};

const updateOne = async (req, res, next) => {
	try {
		const item = await roundService.update(
			req.params.id,
			req.body,
			req.user.id,
		);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật đợt nghiên cứu thành công');
	} catch (err) {
		next(err);
	}
};

const removeOne = async (req, res, next) => {
	try {
		await roundService.remove(req.params.id, req.user.id);
		return success(res, null, 'Xóa đợt nghiên cứu thành công');
	} catch (err) {
		next(err);
	}
};

module.exports = { getAll, getById, createOne, updateOne, removeOne };
