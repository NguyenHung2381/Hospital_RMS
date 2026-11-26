const lecturerService = require('./lecturerService');
const { createCustomFormCrud } = require('../customFormCrud');
const { created } = require('../../../utils/response');
const { asyncHandler } = require('../../../utils/asyncHandler');

const { getAll, getById, createOne, updateOne, removeOne } = createCustomFormCrud(
	'lecturer',
	lecturerService,
);

const createFromStaff = asyncHandler(async (req, res) => {
	return created(res, await lecturerService.createFromStaff(req.body.user_ids, req.user.id));
});

module.exports = { getAll, getById, createOne, createFromStaff, updateOne, removeOne };
