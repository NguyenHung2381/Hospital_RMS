const { sendWorkbook } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');
const councilExportService = require('./councilExportService');
const { buildCouncilScheduleWorkbook } = require('./exports/councilScheduleWorkbook');

// POST /councils/export-excel — lịch bảo vệ đề cương của 1 đợt.
// Body: { round_id, fileName?, title?, subtitle? }
const exportExcel = asyncHandler(async (req, res) => {
	const { round_id, fileName, title, subtitle = '' } = req.body;
	const data = await councilExportService.getDefenseSchedule(round_id);
	const wb = buildCouncilScheduleWorkbook(data, { title, subtitle });
	const safeName =
		(fileName || `lich-bao-ve-${round_id}`).replace(/[/\\?%*:|"<>]/g, '').trim() || 'lich-bao-ve';
	await sendWorkbook(res, wb, safeName + '.xlsx');
});

module.exports = { exportExcel };
