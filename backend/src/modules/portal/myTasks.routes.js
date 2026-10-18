const router = require('express').Router();
const myTasksService = require('./myTasksService');
const { authenticate } = require('../../middlewares/auth');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

router.get(
	'/',
	authenticate,
	asyncHandler(async (req, res) => {
		return success(res, await myTasksService.getMyTasks(req.user));
	}),
);

module.exports = router;
