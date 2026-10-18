const dashboardService = require('./dashboardService');
const { sendWorkbook } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');
const { buildDashboardStatsWorkbook, ALL_SECTIONS } = require('./exports/dashboardStatsWorkbook');

// POST /dashboard/export-stats — Body: { year?, sections? } (xem exports/dashboardStatsWorkbook.js)
const exportStats = asyncHandler(async (req, res) => {
	const year = req.body?.year || String(new Date().getFullYear());
	const sections =
		Array.isArray(req.body?.sections) && req.body.sections.length > 0
			? req.body.sections
			: ALL_SECTIONS;
	const stats = await dashboardService.getStats();
	const wb = buildDashboardStatsWorkbook(stats, { year, sections });
	await sendWorkbook(res, wb, `thong-ke-de-tai-${year}.xlsx`);
});

module.exports = { exportStats };
