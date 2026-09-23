/**
 * trainingReportExportController.js — POST /api/v1/dashboard/training-report-export
 * Xuất 3 báo cáo Đào tạo thành 1 file Excel nhiều sheet, mirror cấu trúc
 * dashboardExportController.js (letterhead + bảng màu).
 */
const ExcelJS = require('exceljs');
const trainingReportService = require('../services/trainingReportService');
const { fnt, al, sf, bAll } = require('../utils/excelStyle');

const C = { hdrBlue: 'FF1F4E79', rowA: 'FFEBF3FB', rowB: 'FFF7FBFF', totalBg: 'FFD9E1F2' };
const CONTENT_START = 4;

function sheetTitle(ws, title, lastCol) {
	ws.mergeCells(`A1:${lastCol}1`);
	Object.assign(ws.getCell('A1'), {
		value: title,
		font: fnt({ bold: true, size: 13 }),
		alignment: al('center', true),
	});
	ws.getRow(1).height = 28;
	ws.getRow(2).height = 6;
}

function headerRow(ws, row, labels) {
	labels.forEach((label, i) => {
		Object.assign(ws.getCell(row, i + 1), {
			value: label,
			font: fnt({ bold: true, size: 10, color: 'FFFFFF' }),
			fill: sf(C.hdrBlue),
			alignment: al('center', true),
			border: bAll,
		});
	});
	ws.getRow(row).height = 22;
}

function dataRow(ws, row, values) {
	values.forEach((v, i) => {
		Object.assign(ws.getCell(row, i + 1), {
			value: v ?? '',
			font: fnt({ size: 10 }),
			fill: sf(row % 2 === 0 ? C.rowA : C.rowB),
			alignment: al(typeof v === 'number' ? 'center' : 'left', true),
			border: bAll,
		});
	});
}

async function exportTrainingReport(req, res, next) {
	try {
		const { from, to, course_id } = req.body || {};
		const [byCourseProgram, traineeResults, summaryRow] = await Promise.all([
			trainingReportService.byCourseProgram(),
			trainingReportService.traineeResults({ course_id }),
			trainingReportService.summary({ from, to }),
		]);

		const wb = new ExcelJS.Workbook();
		wb.creator = 'RMS Hospital';
		wb.created = new Date();

		// Sheet 1: theo khóa + chương trình
		const ws1 = wb.addWorksheet('Theo khóa - chương trình');
		sheetTitle(ws1, 'BÁO CÁO ĐÀO TẠO THEO KHÓA HỌC & CHƯƠNG TRÌNH', 'F');
		let cur = CONTENT_START;
		headerRow(ws1, cur, ['Khóa học', 'Chương trình', 'Tổng đăng ký', 'Đã duyệt', 'Điểm TB', 'Số chứng chỉ']);
		cur++;
		for (const row of byCourseProgram) {
			dataRow(ws1, cur, [
				row.course_name,
				row.program_name,
				row.total_enrollments,
				row.approved_count,
				row.avg_score != null ? Math.round(row.avg_score * 100) / 100 : '',
				row.certificate_count,
			]);
			cur++;
		}
		[30, 22, 14, 12, 10, 14].forEach((w, i) => (ws1.getColumn(i + 1).width = w));

		// Sheet 2: DS học viên + kết quả
		const ws2 = wb.addWorksheet('DS học viên - kết quả');
		sheetTitle(ws2, 'DANH SÁCH HỌC VIÊN & KẾT QUẢ HỌC TẬP', 'F');
		cur = CONTENT_START;
		headerRow(ws2, cur, ['Học viên', 'Khóa học', 'Điểm tổng kết', 'Xếp loại', 'Kết quả', 'Buổi học tham dự']);
		cur++;
		for (const row of traineeResults) {
			dataRow(ws2, cur, [
				row.trainee_name,
				row.course_name,
				row.score ?? '',
				row.classification ?? '',
				row.result === 'pass' ? 'Đạt' : row.result === 'fail' ? 'Không đạt' : '',
				row.total_sessions ? `${row.attended || 0}/${row.total_sessions}` : '',
			]);
			cur++;
		}
		[26, 26, 14, 14, 14, 16].forEach((w, i) => (ws2.getColumn(i + 1).width = w));

		// Sheet 3: thống kê tổng
		const ws3 = wb.addWorksheet('Thống kê tổng');
		sheetTitle(ws3, 'THỐNG KÊ TỔNG HỢP ĐÀO TẠO', 'B');
		cur = CONTENT_START;
		headerRow(ws3, cur, ['Chỉ tiêu', 'Giá trị']);
		cur++;
		[
			['Số khóa học', summaryRow.course_count],
			['Tổng lượt đăng ký', summaryRow.enrollment_count],
			['Đã duyệt', summaryRow.approved_count],
			['Số chứng chỉ đã cấp', summaryRow.certificate_count],
		].forEach((row) => {
			dataRow(ws3, cur, row);
			cur++;
		});
		ws3.getColumn(1).width = 28;
		ws3.getColumn(2).width = 14;

		res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		res.setHeader(
			'Content-Disposition',
			`attachment; filename*=UTF-8''${encodeURIComponent('bao-cao-dao-tao.xlsx')}`,
		);
		await wb.xlsx.write(res);
		res.end();
	} catch (err) {
		next(err);
	}
}

module.exports = { exportTrainingReport };
