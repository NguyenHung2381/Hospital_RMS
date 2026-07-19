const router = require('express').Router();
const { authenticate, authorizePermission } = require('../middlewares/auth');
const dashboardService = require('../services/dashboardService');
const dashboardExportCtrl = require('../controllers/dashboardExportController');
const { success } = require('../utils/response');

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
router.get('/stats', authorizePermission(['reports', 'read']), async (req, res, next) => {
	try {
		const data = await dashboardService.getStats();
		success(res, data);
	} catch (err) {
		next(err);
	}
});

/**
 * @swagger
 * /dashboard/export-stats:
 *   post:
 *     summary: Xuất Excel thống kê tổng quan (tổng quan, theo hệ, theo khoa, 1 sheet/khoa)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               year: { type: string, example: "2026" }
 *               sections:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [overview, by_specialty_group, by_department_table, by_department_detail]
 *     responses:
 *       200:
 *         description: File Excel .xlsx nhiều sheet
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 */
router.post(
	'/export-stats',
	authorizePermission(['reports', 'read']),
	dashboardExportCtrl.exportStats,
);

module.exports = router;
