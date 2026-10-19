const dashboardService = require('./dashboardService');
const { sendWorkbook } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');
const { reportYear } = require('../../utils/reportYear');
const { buildDashboardStatsWorkbook, ALL_SECTIONS } = require('./exports/dashboardStatsWorkbook');

// POST /dashboard/export-stats — Body: { year?, sections? } (xem exports/dashboardStatsWorkbook.js)
const exportStats = asyncHandler(async (req, res) => {
	// Số liệu và tiêu đề file cùng một năm (năm đợt nghiên cứu)
	const year = reportYear(req.body?.year) ?? new Date().getFullYear();
	const sections =
		Array.isArray(req.body?.sections) && req.body.sections.length > 0
			? req.body.sections
			: ALL_SECTIONS;
	const stats = await dashboardService.getStats(year);
	const wb = buildDashboardStatsWorkbook(stats, { year, sections });
	await sendWorkbook(res, wb, `thong-ke-de-tai-${year}.xlsx`);
});

module.exports = { exportStats };
