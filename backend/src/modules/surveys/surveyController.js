const surveyService = require('./surveyService');
const { success, created, notFound } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
	return success(res, await surveyService.getAll(req.query));
});

const getById = asyncHandler(async (req, res) => {
	const item = await surveyService.getById(req.params.id);
	if (!item) return notFound(res);
	return success(res, item);
});

const createOne = asyncHandler(async (req, res) => {
	return created(res, await surveyService.create(req.body, req.user.id));
});

const updateOne = asyncHandler(async (req, res) => {
	const item = await surveyService.update(req.params.id, req.body, req.user.id);
	if (!item) return notFound(res);
	return success(res, item, 'Cập nhật thành công');
});

const removeOne = asyncHandler(async (req, res) => {
	await surveyService.remove(req.params.id);
	return success(res, null, 'Xóa thành công');
});

const getResults = asyncHandler(async (req, res) => {
	const results = await surveyService.getResults(req.params.id);
	if (!results) return notFound(res);
	return success(res, results);
});

const listActiveForUser = asyncHandler(async (req, res) => {
	return success(res, await surveyService.listActiveForUser(req.user));
});

const getForRespond = asyncHandler(async (req, res) => {
	const item = await surveyService.getForRespond(req.params.id, req.user);
	if (!item) return notFound(res);
	return success(res, item);
});

const submitResponse = asyncHandler(async (req, res) => {
	const result = await surveyService.submitResponse(req.params.id, req.body.answers, req.user);
	return created(res, result, 'Đã nộp khảo sát, cảm ơn bạn đã phản hồi.');
});

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
