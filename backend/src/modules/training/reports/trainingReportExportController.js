const trainingReportService = require('./trainingReportService');
const { sendWorkbook } = require('../../../utils/response');
const { asyncHandler } = require('../../../utils/asyncHandler');
const { buildTrainingReportWorkbook } = require('./exports/trainingReportWorkbook');

// POST /dashboard/training-report-export — Body: { from?, to?, course_id? }
// 3 báo cáo Đào tạo trong 1 file (xem exports/trainingReportWorkbook.js).
const exportTrainingReport = asyncHandler(async (req, res) => {
	const { from, to, course_id } = req.body || {};
	const [byCourseProgram, traineeResults, summaryRow] = await Promise.all([
		trainingReportService.byCourseProgram(),
		trainingReportService.traineeResults({ course_id }),
		trainingReportService.summary({ from, to }),
	]);
	const wb = buildTrainingReportWorkbook({ byCourseProgram, traineeResults, summaryRow });
	await sendWorkbook(res, wb, 'bao-cao-dao-tao.xlsx');
});

module.exports = { exportTrainingReport };
