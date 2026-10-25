/**
 * cmeReportWorkbook.js — dựng file Excel báo cáo tín chỉ CME (dữ liệu: cmeReportService.getData), dựa theo mẫu "mẫu bc CME.xlsx":
 *   Sheet "Tổng quan"     : chỉ tiêu tổng hợp + cơ cấu theo hình thức CME
 *   Sheet "BC tổng"       : TT | MNV | Họ và tên | Khoa/Phòng | Tổng số tiết (| Ngưỡng | Đánh giá)
 *   Sheet "BC chi tiết"   : TT | MNV | Họ và tên | Khoa/Phòng | <từng nhóm hình thức CME> | Tổng
 *   Sheet "Theo khoa"     : tổng hợp theo khoa/phòng
 *   Sheet "Theo năm"      : diễn biến từng năm × hình thức CME (chỉ khi báo cáo nhiều năm)
 *   Sheet "Năm <yyyy>"    : mỗi năm 1 sheet — như BC chi tiết nhưng chỉ số tiết năm đó (+ Ngưỡng / Đánh giá)
 *   Sheet "Chưa đạt"      : nhân sự chưa đủ ngưỡng (khi trong khoảng năm có cấu hình ngưỡng)
 *   Sheet "DS hoạt động"  : từng hoạt động được tính tín chỉ
 * Báo cáo nhiều năm (từ năm – đến năm): BC tổng / Theo khoa / Chưa đạt thêm 1 cột
 * số tiết cho mỗi năm; ngưỡng = cộng dồn ngưỡng các năm có cấu hình, BC tổng thêm
 * cột "Số năm đạt" (đạt ngưỡng riêng của từng năm).
 * Các sheet danh sách có AutoFilter + cố định hàng tiêu đề; dòng tổng dùng SUBTOTAL nên
 * tự cộng theo kết quả lọc.
 * Phiếu CME cá nhân (personal) chỉ gồm BC tổng, BC chi tiết, DS hoạt động.
 * Cộng dồn 2 nguồn giống cmeRequirementService.getComplianceReport: tham dự hội
 * thảo đã cấp CME (seminar_participants.cme_year) + ghi nhận độc lập đã duyệt.
 * Dùng cho file xuất trang Ghi nhận CME (toàn viện) và phiếu CME cá nhân (userId).
 */
const { lazyRequire } = require('../../../utils/lazyRequire');
/** @type {typeof import('exceljs')} */
const ExcelJS = lazyRequire('exceljs');
const { summarizeYear } = require('./cmeReportLayout');
const { sheetOverview, sheetSummary, sheetDetail } = require('./cmeReportMainSheets');
const {
	sheetDepartments,
	sheetFailed,
	sheetYears,
	sheetActivities,
} = require('./cmeReportBreakdownSheets');

/**
 * opts.title / opts.subtitle: tiêu đề chung các sheet BC tổng / BC chi tiết / Tổng quan / Theo khoa.
 * opts.personal: phiếu cá nhân — bỏ các sheet tổng hợp theo khoa / tổng quan / chưa đạt.
 */
const buildWorkbook = (data, { title, subtitle, personal = false }) => {
	const wb = new ExcelJS.Workbook();
	wb.creator = 'RMS Hospital';
	wb.created = new Date();
	const head = { title, subtitle };

	if (!personal) sheetOverview(wb, data, head);
	sheetSummary(wb, data, head);
	sheetDetail(wb, data, head);
	if (data.years.length > 1) {
		sheetYears(wb, data, { ...head, title: `${title} THEO NĂM` });
		// Mỗi năm một sheet riêng "Năm <y>": số tiết từng hình thức của riêng năm đó
		const exported = subtitle.match(/Xuất ngày.*$/)?.[0];
		for (const y of data.years) {
			const s = summarizeYear(data.people, y);
			const acts = data.activities.filter((a) => a.year === y).length;
			sheetDetail(
				wb,
				data,
				{
					title: `BÁO CÁO TÍN CHỈ CME NĂM ${y}`,
					subtitle: [
						`${s.withCredits}/${data.people.length} nhân sự có tín chỉ`,
						`${acts} lượt · ${s.total} tiết`,
						s.evaluated && `${s.passed}/${s.evaluated} đạt ngưỡng năm`,
						exported,
					]
						.filter(Boolean)
						.join(' · '),
				},
				y,
			);
		}
	}
	if (!personal) {
		sheetDepartments(wb, data, { ...head, title: `${title} THEO KHOA/PHÒNG` });
		if (data.hasRequirement) sheetFailed(wb, data, head);
	}
	sheetActivities(wb, data, head);
	return wb;
};

module.exports = {
	buildWorkbook,
};
