const router = require('express').Router();
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const dashboardService = require('./dashboardService');
const dashboardExportCtrl = require('./dashboardExportController');
const trainingReportService = require('../training/reports/trainingReportService');
const trainingReportExportCtrl = require('../training/reports/trainingReportExportController');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

router.use(authenticate);

router.get(
	'/stats',
	authorizePermission(['reports', 'read']),
	asyncHandler(async (req, res) => {
		const data = await dashboardService.getStats();
		success(res, data);
	}),
);

router.get(
	'/overview',
	authorizePermission(['reports', 'read']),
	asyncHandler(async (req, res) => {
		success(res, await dashboardService.getOverviewStats());
	}),
);

router.post(
	'/export-stats',
	authorizePermission(['reports', 'read']),
	dashboardExportCtrl.exportStats,
);

router.get(
	'/training-stats',
	authorizePermission(['reports', 'read']),
	asyncHandler(async (req, res) => {
		success(res, await dashboardService.getTrainingStats());
	}),
);

router.get(
	'/seminar-stats',
	authorizePermission(['reports', 'read']),
	asyncHandler(async (req, res) => {
		success(res, await dashboardService.getSeminarStats());
	}),
);

router.get(
	'/training-report',
	authorizePermission(['reports', 'read']),
	asyncHandler(async (req, res) => {
		const { from, to, course_id } = req.query;
		const [byCourseProgram, traineeResults, summary] = await Promise.all([
			trainingReportService.byCourseProgram(),
			trainingReportService.traineeResults({ course_id }),
			trainingReportService.summary({ from, to }),
		]);
		success(res, { by_course_program: byCourseProgram, trainee_results: traineeResults, summary });
	}),
);

router.post(
	'/training-report-export',
	authorizePermission(['reports', 'read']),
	trainingReportExportCtrl.exportTrainingReport,
);

module.exports = router;
