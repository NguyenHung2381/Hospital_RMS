const trainingReportService = require('./trainingReportService');
const { sendWorkbook } = require('../../../utils/response');
const { asyncHandler } = require('../../../utils/asyncHandler');
const { reportYear } = require('../../../utils/reportYear');
const { buildTrainingReportWorkbook } = require('./exports/trainingReportWorkbook');

// POST /dashboard/training-report-export — Body: { year?, report: 'courses' | 'trainees' }
const exportTrainingReport = asyncHandler(async (req, res) => {
	const year = reportYear(req.body?.year);
	const report = req.body?.report === 'trainees' ? 'trainees' : 'courses';
	const rows = await trainingReportService[report](year);
	const wb = buildTrainingReportWorkbook(report, rows, year);
	const name = report === 'courses' ? 'tong-hop-khoa-hoc' : 'ket-qua-hoc-vien';
	await sendWorkbook(res, wb, `${name}${year ? `-${year}` : ''}.xlsx`);
});

module.exports = { exportTrainingReport };
