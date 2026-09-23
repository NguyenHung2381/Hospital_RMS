const surveyService = require('../services/surveyService');
const { success, created, notFound } = require('../utils/response');

const getAll = async (req, res, next) => {
	try {
		return success(res, await surveyService.getAll(req.query));
	} catch (err) {
		next(err);
	}
};

const getById = async (req, res, next) => {
	try {
		const item = await surveyService.getById(req.params.id);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
};

const createOne = async (req, res, next) => {
	try {
		return created(res, await surveyService.create(req.body, req.user.id));
	} catch (err) {
		next(err);
	}
};

const updateOne = async (req, res, next) => {
	try {
		const item = await surveyService.update(req.params.id, req.body, req.user.id);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật thành công');
	} catch (err) {
		next(err);
	}
};

const removeOne = async (req, res, next) => {
	try {
		await surveyService.remove(req.params.id);
		return success(res, null, 'Xóa thành công');
	} catch (err) {
		next(err);
	}
};

const getResults = async (req, res, next) => {
	try {
		const results = await surveyService.getResults(req.params.id);
		if (!results) return notFound(res);
		return success(res, results);
	} catch (err) {
		next(err);
	}
};

const listActiveForUser = async (req, res, next) => {
	try {
		return success(res, await surveyService.listActiveForUser(req.user));
	} catch (err) {
		next(err);
	}
};

const getForRespond = async (req, res, next) => {
	try {
		const item = await surveyService.getForRespond(req.params.id, req.user);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
};

const submitResponse = async (req, res, next) => {
	try {
		const result = await surveyService.submitResponse(req.params.id, req.body.answers, req.user);
		return created(res, result, 'Đã nộp khảo sát, cảm ơn bạn đã phản hồi.');
	} catch (err) {
		next(err);
	}
};

module.exports = {
	getAll,
	getById,
	createOne,
	updateOne,
	removeOne,
	getResults,
	listActiveForUser,
	getForRespond,
	submitResponse,
};
