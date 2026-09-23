const router = require('express').Router();
const myTasksService = require('../services/myTasksService');
const { authenticate } = require('../middlewares/auth');
const { success } = require('../utils/response');

/**
 * @swagger
 * tags:
 *   name: MyTasks
 *   description: Hộp thư "Việc của tôi" — đề tài chờ tôi duyệt + chờ tôi chấm tiến độ
 */

router.get('/', authenticate, async (req, res, next) => {
	try {
		return success(res, await myTasksService.getMyTasks(req.user));
	} catch (err) {
		next(err);
	}
});

module.exports = router;
