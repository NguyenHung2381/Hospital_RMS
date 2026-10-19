/**
 * trainingReportWorkbook.js — file Excel cho POST /api/v1/dashboard/training-report-export
 * Mỗi báo cáo 1 file 1 sheet (letterhead bệnh viện + bảng), cùng kiểu với các file
 * xuất Hội thảo/CME (utils/excelTemplate).
 */
const ExcelJS = require('exceljs');
const xl = require('../../../../utils/excelTemplate');

const STATUS_LABELS = {
	upcoming: 'Sắp khai giảng',
	enrolling: 'Đang mở đăng ký',
	in_progress: 'Đang học',
	completed: 'Hoàn thành',
	cancelled: 'Đã huỷ',
};
const RESULT_LABELS = { pass: 'Đạt', fail: 'Không đạt' };

/** @param {Date|string|null} d */
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '');
/** @param {number|null} n */
const round2 = (n) => (n == null ? '' : Math.round(n * 100) / 100);

/**
 * @param {'courses'|'trainees'} report
 * @param {any[]} rows
 * @param {number|null} year
 */
const buildTrainingReportWorkbook = (report, rows, year) => {
	const wb = new ExcelJS.Workbook();
	wb.creator = 'RMS Hospital';
	wb.created = new Date();
	const yearText = year ? `NĂM ${year}` : 'TẤT CẢ CÁC NĂM';
	const subtitle = `Xuất ngày ${fmtDate(new Date())}`;

	if (report === 'courses') {
		const ws = xl.buildSheet(wb, {
			sheetName: 'Khóa học',
			title: `TỔNG HỢP KHÓA ĐÀO TẠO ${yearText}`,
			subtitle: `${rows.length} khóa học · ${subtitle}`,
			letterhead: true,
			columns: [
				{ key: 'stt', header: 'STT', width: 6 },
				{ key: 'name', header: 'Khóa học', width: 40 },
				{ key: 'programs', header: 'Chương trình', width: 28 },
				{ key: 'time', header: 'Thời gian', width: 24 },
				{ key: 'status', header: 'Trạng thái', width: 16 },
				{ key: 'enrollments', header: 'Đăng ký', width: 10 },
				{ key: 'approved', header: 'Đã duyệt', width: 10 },
				{ key: 'passed', header: 'Đạt', width: 8 },
				{ key: 'avg_score', header: 'Điểm TB', width: 10 },
				{ key: 'certificates', header: 'Chứng chỉ', width: 11 },
			],
		});
		rows.forEach((c, i) =>
			ws.addRow({
				stt: i + 1,
				name: c.name,
				programs: c.program_names ?? '',
				time: [fmtDate(c.start_date), fmtDate(c.end_date)].filter(Boolean).join(' – '),
				status: STATUS_LABELS[c.status] ?? c.status,
				enrollments: c.enrollments,
				approved: c.approved,
				passed: c.passed,
				avg_score: round2(c.avg_score),
				certificates: c.certificates,
			}),
		);
		xl.styleBody(ws);
		return wb;
	}

	const ws = xl.buildSheet(wb, {
		sheetName: 'Kết quả học viên',
		title: `KẾT QUẢ HỌC TẬP CỦA HỌC VIÊN ${yearText}`,
		subtitle: `${rows.length} lượt học viên · ${subtitle}`,
		letterhead: true,
		columns: [
			{ key: 'stt', header: 'STT', width: 6 },
			{ key: 'trainee', header: 'Học viên', width: 28 },
			{ key: 'department', header: 'Khoa/Phòng', width: 26 },
			{ key: 'course', header: 'Khóa học', width: 36 },
			{ key: 'score', header: 'Điểm tổng kết', width: 12 },
			{ key: 'classification', header: 'Xếp loại', width: 12 },
			{ key: 'result', header: 'Kết quả', width: 12 },
			{ key: 'attendance', header: 'Chuyên cần', width: 12 },
		],
	});
	rows.forEach((t, i) =>
		ws.addRow({
			stt: i + 1,
			trainee: t.trainee_name,
			department: t.department_name ?? '',
			course: t.course_name,
			score: t.score ?? '',
			classification: t.classification ?? '',
			result: RESULT_LABELS[t.result] ?? '',
			attendance: t.total_sessions ? `${t.attended || 0}/${t.total_sessions}` : '',
		}),
	);
	xl.styleBody(ws);
	return wb;
};

module.exports = { buildTrainingReportWorkbook };
