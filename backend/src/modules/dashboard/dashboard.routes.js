const router = require('express').Router();
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const dashboardService = require('./dashboardService');
const dashboardExportCtrl = require('./dashboardExportController');
const trainingReportService = require('../training/reports/trainingReportService');
const trainingReportExportCtrl = require('../training/reports/trainingReportExportController');
const seminarService = require('../seminars/seminarService');
const seminarCtrl = require('../seminars/seminarController');
const cmeReportService = require('../cme/cmeReportService');
const cmeRecordCtrl = require('../cme/cmeRecordController');
const { requireModule } = require('../../middlewares/moduleGuard');
const { reportYear } = require('../../utils/reportYear');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

router.use(authenticate);

router.get(
	'/stats',
	authorizePermission(['reports', 'read']),
	asyncHandler(async (req, res) => {
		// ?year= — trang Báo cáo xem theo năm đợt nghiên cứu; Dashboard không truyền = mọi năm
		const data = await dashboardService.getStats(reportYear(req.query.year));
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

// ── Trang Báo cáo: dữ liệu theo năm (xem nhanh + in PDF) và xuất Excel ──
const canReport = authorizePermission(['reports', 'read']);

router.get(
	'/training-report',
	canReport,
	requireModule('TRAINING'),
	asyncHandler(async (req, res) => {
		const year = reportYear(req.query.year);
		const [courses, trainees] = await Promise.all([
			trainingReportService.courses(year),
			trainingReportService.trainees(year),
		]);
		success(res, { courses, trainees });
	}),
);

router.post(
	'/training-report-export',
	canReport,
	requireModule('TRAINING'),
	trainingReportExportCtrl.exportTrainingReport,
);

router.get(
	'/seminar-report',
	canReport,
	requireModule('SEMINAR'),
	asyncHandler(async (req, res) => {
		const year = reportYear(req.query.year);
		const [{ data: seminars }, cme] = await Promise.all([
			seminarService.getAll({ year: year ?? undefined, page: 1, limit: 0 }),
			cmeReportService.getData({ year: year ?? undefined }),
		]);
		success(res, {
			seminars,
			cme_people: cme.people.map((p) => ({
				staff_number: p.staff_number,
				full_name: p.full_name,
				department_name: p.department_name,
				is_active: p.is_active,
				total: p.total,
				required: p.required,
			})),
		});
	}),
);

// Tái dùng đúng file xuất của trang Hội thảo / Ghi nhận CME (body: { year })
router.post(
	'/seminar-report-export',
	canReport,
	requireModule('SEMINAR'),
	seminarCtrl.exportListExcel,
);
router.post('/cme-report-export', canReport, requireModule('SEMINAR'), cmeRecordCtrl.exportExcel);

module.exports = router;
