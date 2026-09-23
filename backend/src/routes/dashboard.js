const router = require('express').Router();
const { authenticate, authorizePermission } = require('../middlewares/auth');
const dashboardService = require('../services/dashboardService');
const dashboardExportCtrl = require('../controllers/dashboardExportController');
const trainingReportService = require('../services/trainingReportService');
const trainingReportExportCtrl = require('../controllers/trainingReportExportController');
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

/**
 * @swagger
 * /dashboard/training-stats:
 *   get:
 *     summary: Thống kê tổng quan cho Dashboard Đào tạo (KPI, lịch sắp tới, xu hướng đăng ký...)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 */
router.get('/training-stats', authorizePermission(['reports', 'read']), async (req, res, next) => {
	try {
		success(res, await dashboardService.getTrainingStats());
	} catch (err) {
		next(err);
	}
});

/**
 * @swagger
 * /dashboard/training-report:
 *   get:
 *     summary: 3 báo cáo Đào tạo (theo khóa+chương trình, DS học viên+kết quả, thống kê tổng)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 */
router.get('/training-report', authorizePermission(['reports', 'read']), async (req, res, next) => {
	try {
		const { from, to, course_id } = req.query;
		const [byCourseProgram, traineeResults, summary] = await Promise.all([
			trainingReportService.byCourseProgram(),
			trainingReportService.traineeResults({ course_id }),
			trainingReportService.summary({ from, to }),
		]);
		success(res, { by_course_program: byCourseProgram, trainee_results: traineeResults, summary });
	} catch (err) {
		next(err);
	}
});

router.post(
	'/training-report-export',
	authorizePermission(['reports', 'read']),
	trainingReportExportCtrl.exportTrainingReport,
);

module.exports = router;
