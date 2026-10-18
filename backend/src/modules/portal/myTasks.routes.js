const router = require('express').Router();
const myTasksService = require('./myTasksService');
const { authenticate } = require('../../middlewares/auth');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

/**
 * @swagger
 * tags:
 *   name: MyTasks
 *   description: Hộp thư "Việc của tôi" — đề tài chờ tôi duyệt + chờ tôi chấm tiến độ
 */

router.get(
	'/',
	authenticate,
	asyncHandler(async (req, res) => {
		return success(res, await myTasksService.getMyTasks(req.user));
	}),
);

module.exports = router;
