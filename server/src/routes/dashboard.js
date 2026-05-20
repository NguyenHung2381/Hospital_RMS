const router = require('express').Router();
const { authenticate } = require('../middlewares/auth');
const dashboardService = require('../services/dashboardService');
const { success, error } = require('../utils/response');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Thống kê tổng quan dashboard
 */

/**
 * @swagger
 * /dashboard/stats:
 *   get:
 *     summary: Lấy thống kê tổng quan cho dashboard
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/stats', async (req, res, next) => {
	try {
		const data = await dashboardService.getStats();
		success(res, data);
	} catch (err) {
		next(err);
	}
});

module.exports = router;
