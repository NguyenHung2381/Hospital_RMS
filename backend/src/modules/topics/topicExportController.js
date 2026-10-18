const topicService = require('./topicService');
const { sendWorkbook } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');
const { buildDefenseScheduleWorkbook } = require('./exports/topicDefenseScheduleWorkbook');
const { buildTopicReportWorkbook } = require('./exports/topicReportWorkbook');

// Xuất Excel danh sách đề tài: đọc body, lấy dữ liệu (chỉ đề tài trong phạm vi
// người gọi — danh sách mã do client gửi lên), dựng workbook ở exports/, gửi file.

const safeFileName = (name, fallback) =>
	(name || fallback).replace(/[/\\?%*:|"<>]/g, '').trim() || fallback;

const loadTopics = async (ids, user) => {
	if (!Array.isArray(ids) || ids.length === 0) throw httpError(400, 'Danh sách đề tài trống');
	return topicService.getForExport(await topicService.idsInScope(ids, user));
};

// POST /topics/export-excel — lịch bảo vệ đề cương (1 sheet)
const exportExcel = asyncHandler(async (req, res) => {
	const {
		ids,
		fileName = 'lich-bao-ve-de-tai',
		customTitle = 'LỊCH BẢO VỆ ĐỀ CƯƠNG SÁNG KIẾN, ĐỀ TÀI NGHIÊN CỨU KHOA HỌC CẤP CƠ SỞ',
		customSubtitle = '',
		refNumber = '',
		refDate = '',
	} = req.body;
	const data = await loadTopics(ids, req.user);
	const wb = buildDefenseScheduleWorkbook(data, {
		customTitle,
		customSubtitle,
		refNumber,
		refDate,
	});
	await sendWorkbook(res, wb, safeFileName(fileName, 'lich-bao-ve-de-tai') + '.xlsx');
});

// POST /topics/export-report — báo cáo tổng hợp nhiều sheet (xem exports/topicReportWorkbook.js)
const exportReport = asyncHandler(async (req, res) => {
	const {
		ids,
		fileName = 'bao-cao-nckh',
		title = 'BÁO CÁO TỔNG KẾT NGHIÊN CỨU KHOA HỌC',
		subtitle = '',
		refNumber = '',
		refDate = '',
		sections = ['overview', 'topics', 'members', 'by_category'],
	} = req.body;
	const data = await loadTopics(ids, req.user);
	if (!data.length) throw httpError(404, 'Không tìm thấy đề tài');
	const wb = buildTopicReportWorkbook(data, { title, subtitle, refNumber, refDate, sections });
	await sendWorkbook(res, wb, safeFileName(fileName, 'bao-cao-nckh') + '.xlsx');
});

module.exports = { exportExcel, exportReport };
