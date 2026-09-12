const trainingRoundService = require('../services/trainingRoundService');
const { success, created, notFound } = require('../utils/response');

const getAll = async (req, res, next) => {
	try {
		return success(res, await trainingRoundService.getAll(req.query));
	} catch (err) {
		next(err);
	}
};

const getById = async (req, res, next) => {
	try {
		const item = await trainingRoundService.getById(req.params.id);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
};

const createOne = async (req, res, next) => {
	try {
		return created(res, await trainingRoundService.create(req.body, req.user.id), 'Tạo đợt đào tạo thành công');
	} catch (err) {
		next(err);
	}
};

const updateOne = async (req, res, next) => {
	try {
		const item = await trainingRoundService.update(req.params.id, req.body, req.user.id);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật đợt đào tạo thành công');
	} catch (err) {
		next(err);
	}
};

const removeOne = async (req, res, next) => {
	try {
		await trainingRoundService.remove(req.params.id, req.user.id);
		return success(res, null, 'Xóa đợt đào tạo thành công');
	} catch (err) {
		next(err);
	}
};

module.exports = { getAll, getById, createOne, updateOne, removeOne };
