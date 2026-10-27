const lecturerService = require('./lecturerService');
const { success, created, notFound } = require('../../../utils/response');
const formCustomValueService = require('../../forms/formCustomValueService');
const { asyncHandler } = require('../../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
	return success(
		res,
		await formCustomValueService.attachResult('lecturer', await lecturerService.getAll(req.query)),
	);
});

const getById = asyncHandler(async (req, res) => {
	const item = await lecturerService.getById(req.params.id);
	if (!item) return notFound(res);
	item.custom = await formCustomValueService.get('lecturer', item.id);
	return success(res, item);
});

const createOne = asyncHandler(async (req, res) => {
	const item = await lecturerService.create(req.body, req.user.id);
	const custom = await formCustomValueService.save(
		'lecturer',
		item.id,
		req.formCustom,
		req.user.id,
	);
	return created(res, custom ? { ...item, custom } : item);
});

const createFromStaff = asyncHandler(async (req, res) => {
	return created(res, await lecturerService.createFromStaff(req.body.user_ids, req.user.id));
});

const updateOne = asyncHandler(async (req, res) => {
	const item = await lecturerService.update(req.params.id, req.body, req.user.id);
	if (!item) return notFound(res);
	const custom = await formCustomValueService.save(
		'lecturer',
		req.params.id,
		req.formCustom,
		req.user.id,
	);
	return success(res, custom ? { ...item, custom } : item, 'Cập nhật thành công');
});

const removeOne = asyncHandler(async (req, res) => {
	await lecturerService.remove(req.params.id, req.user.id);
	return success(res, null, 'Xóa thành công');
});

module.exports = { getAll, getById, createOne, createFromStaff, updateOne, removeOne };
