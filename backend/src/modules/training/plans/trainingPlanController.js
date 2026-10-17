const trainingPlanService = require('./trainingPlanService');
const { success, created, notFound } = require('../../../utils/response');

const getAll = async (req, res, next) => {
	try {
		return success(res, await trainingPlanService.getAll(req.query));
	} catch (err) {
		next(err);
	}
};

const listItemOptions = async (req, res, next) => {
	try {
		return success(res, await trainingPlanService.listItemOptions());
	} catch (err) {
		next(err);
	}
};

const getById = async (req, res, next) => {
	try {
		const item = await trainingPlanService.getById(req.params.id);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
};

const createOne = async (req, res, next) => {
	try {
		return created(res, await trainingPlanService.create(req.body, req.user.id));
	} catch (err) {
		next(err);
	}
};

const updateOne = async (req, res, next) => {
	try {
		const item = await trainingPlanService.update(req.params.id, req.body, req.user.id);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật thành công');
	} catch (err) {
		next(err);
	}
};

const removeOne = async (req, res, next) => {
	try {
		await trainingPlanService.remove(req.params.id);
		return success(res, null, 'Xóa thành công');
	} catch (err) {
		next(err);
	}
};

const setItems = async (req, res, next) => {
	try {
		const items = await trainingPlanService.setItems(req.params.id, req.body.items, req.user.id);
		return success(res, items, 'Đã cập nhật hạng mục kế hoạch');
	} catch (err) {
		next(err);
	}
};

module.exports = { getAll, getById, listItemOptions, createOne, updateOne, removeOne, setItems };
