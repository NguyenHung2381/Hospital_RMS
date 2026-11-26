/**
 * teachingPlanTemplate.js — File "Kế hoạch giảng dạy" của 1 lớp (tab Bài học & lịch học):
 * mỗi bài 1 khối dòng (STT, mã bài, nội dung gộp ô), mỗi dòng 1 phần LT / TH với số tiết,
 * giảng viên chính, trợ giảng (kèm mã nhân viên) và thời gian giảng. Một phần có nhiều
 * đợt / nhiều người thì nhiều dòng cùng LT (hoặc TH). Đọc lại bằng sessionLecturerImportService.
 */
const { lazyRequire } = require('../../../../utils/lazyRequire');
/** @type {typeof import('exceljs')} */
const ExcelJS = lazyRequire('exceljs');
const { addLecturerTotals } = require('../../../../utils/excelLecturerTotals');

// Cột người đứng lớp ghi "Giảng viên"; file cũ ghi "Giảng viên chính" vẫn đọc được
const HEADERS = [
	'STT',
	'Mã bài',
	'Nội dung bài giảng',
	'Số tiết',
	'',
	'Mã NV giảng viên',
	'Giảng viên',
	'Mã NV trợ giảng',
	'Trợ giảng',
	'Thời gian giảng (ngày/tháng/năm)',
];
const WIDTHS = [6, 14, 40, 6, 7, 12, 26, 14, 30, 34];
const KIND_LABEL = { theory: 'LT', practice: 'TH' };

const GUIDE = [
	'Mỗi bài học là 1 khối dòng; mỗi dòng 1 phần LT (lý thuyết) hoặc TH (thực hành). Không đổi Mã bài.',
	'Giảng viên trong viện: ghi Mã NV và Họ tên — hệ thống tìm theo mã rồi đối chiếu họ tên (khác tên ⇒ dòng bị bỏ qua). Chuyên gia ngoài viện không có mã: để trống Mã NV, chỉ ghi họ tên (có thể kèm học vị "ThS.BS ...").',
	'Mỗi dòng 1 giảng viên (người đứng lớp). Nhiều trợ giảng cách nhau dấu ; — Mã NV trợ giảng ghi cùng thứ tự với họ tên, người không có mã ghi dấu - (vd. "1329; -" ứng với "Bành Thị Hồng Vinh; ThS. Nguyễn Văn A").',
	'Thời gian giảng: "Từ ngày 27/11/2026 đến ngày 05/12/2026" hoặc 1 ngày "27/11/2026". Hệ thống gán giảng viên cho các buổi LT / TH ĐÃ XẾP của bài trong khoảng đó (tab Bài học & lịch học) — không tự tạo buổi. Để trống = mọi buổi của phần đó. Cùng ngày có 2 buổi do 2 người dạy thì ghi kèm giờ bắt đầu: "25/11/2026 (07:30)".',
	'Một phần do nhiều người dạy ở các đợt khác nhau: thêm dòng LT (hoặc TH) trong cùng khối bài, mỗi dòng 1 khoảng ngày. Dòng để trống cả giảng viên lẫn trợ giảng thì giữ nguyên.',
	'Giảng viên đứng lớp; trợ giảng cùng dạy buổi đó (đồng giảng) — điểm danh vẫn 1 lần mỗi buổi.',
	'Cột Số tiết là số tiết của dòng đó: một phần chia nhiều dòng (nhiều đợt) thì số tiết đã chia theo số buổi của từng đợt. Tự thêm dòng / đổi đợt thì sửa lại số tiết các dòng cho đúng.',
	'Dưới bảng là "Tổng số tiết theo giảng viên" — TỰ TÍNH bằng công thức: gõ / sửa họ tên ở cột Giảng viên, Trợ giảng hoặc số tiết thì tổng cập nhật ngay (danh sách người tự lấy từ bảng, mỗi ô trợ giảng tối đa 5 người cách nhau dấu ;). Tổng số tiết tính riêng từng người: mỗi người được đủ số tiết của dòng mình dạy (giảng viên lẫn trợ giảng).',
	'Giờ tín chỉ CME dự kiến = số tiết × hệ số quy đổi, tính như khi khóa điểm nếu dạy đủ các buổi trong bảng: số tiết mỗi dòng chia đều cho số người dạy dòng đó (giảng viên + trợ giảng). Số ghi thật tính lúc khóa điểm theo các buổi đã dạy (và số tiết nhập ở phân công nếu có); chỉ giảng viên có tài khoản mới được ghi CME.',
	'Khi nhập lại file, hệ thống bỏ qua khối tổng và sheet ẩn TinhTiet (dùng để gom tên).',
];

/** @type {Partial<import('exceljs').Border>} */
const thin = { style: 'thin', color: { argb: 'FF000000' } };
/** @type {Partial<import('exceljs').Borders>} */
const box = { top: thin, left: thin, bottom: thin, right: thin };

/**
 * @param {{ title: string, period: string,
 *   lessons: { code?: string|null, title: string,
 *     rows: { kind: 'theory'|'practice', hours?: number|null, main_code?: string, main?: string,
 *       asst_codes?: string, assts?: string, time?: string }[] }[],
 *   cme?: { factor: number } | null }} input
 *   rows[].hours: số tiết CỦA DÒNG (phần chia nhiều đợt thì đã chia); cme: khóa thuộc loại tự
 *   cộng CME ⇒ khối tổng có cột giờ tín chỉ CME dự kiến × factor (hệ số DT_KHOAHOC)
 */
const buildTeachingPlanTemplate = ({ title, period, lessons, cme = null }) => {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Kế hoạch giảng dạy');
	ws.columns = WIDTHS.map((width) => ({ width }));
	const last = String.fromCharCode(64 + HEADERS.length);

	ws.getCell('A1').value = title;
	ws.getCell('A1').font = { bold: true, size: 13 };
	ws.getCell('A2').value = period;
	ws.getCell('A2').font = { italic: true, size: 12 };
	for (const r of [1, 2]) {
		ws.mergeCells(`A${r}:${last}${r}`);
		ws.getCell(`A${r}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
		ws.getCell(`A${r}`).border = box;
		ws.getRow(r).height = 22;
	}
	const header = ws.getRow(3);
	header.values = HEADERS;
	ws.mergeCells('D3:E3');
	header.height = 32;
	header.eachCell({ includeEmpty: true }, (cell) => {
		cell.font = { bold: true };
		cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
		cell.border = box;
	});
	// Mã NV để dạng chữ (giữ số 0 đầu); mã NV tô xám nhạt cho dễ phân biệt cột
	for (const col of [6, 8]) ws.getColumn(col).numFmt = '@';

	let r = 4;
	lessons.forEach((lesson, i) => {
		const first = r;
		for (const x of lesson.rows) {
			const row = ws.getRow(r);
			row.values = [
				i + 1,
				lesson.code || '',
				lesson.title,
				KIND_LABEL[x.kind],
				// Ô trống thật (không phải chuỗi rỗng) để công thức cộng số tiết không lỗi
				x.hours ?? null,
				x.main_code || '',
				x.main || '',
				x.asst_codes || '',
				x.assts || '',
				x.time || '',
			];
			row.eachCell({ includeEmpty: true }, (cell, col) => {
				if (col > HEADERS.length) return;
				cell.border = box;
				cell.alignment = { vertical: 'middle', wrapText: true };
			});
			r++;
		}
		const lastRow = r - 1;
		for (const col of ['A', 'B', 'C']) {
			if (lastRow > first) ws.mergeCells(`${col}${first}:${col}${lastRow}`);
			ws.getCell(`${col}${first}`).alignment = {
				vertical: 'middle',
				horizontal: col === 'C' ? 'left' : 'center',
				wrapText: true,
			};
		}
		ws.getCell(`B${first}`).font = { color: { argb: 'FF6B7B88' } };
	});
	ws.views = [{ state: 'frozen', ySplit: 3 }];

	const guide = wb.addWorksheet('Hướng dẫn');
	guide.getColumn(1).width = 120;
	guide.addRow(['Cách điền kế hoạch giảng dạy']).font = { bold: true, size: 13 };
	for (const line of GUIDE) {
		const row = guide.addRow([`• ${line}`]);
		row.alignment = { wrapText: true, vertical: 'top' };
	}

	addLecturerTotals(wb, ws, {
		firstRow: 4,
		cols: { hours: 'E', main: 'G', assistants: 'I' },
		lastCol: last,
		block: { name: ['B', 'C'], hours: ['D', 'E'], credits: 'F' },
		cme: cme ? { mode: 'split', factor: cme.factor } : null,
		creditLabel: 'Giờ tín chỉ CME dự kiến',
		note: cme
			? `tự tính theo bảng trên: gõ / sửa tên ở cột Giảng viên, Trợ giảng thì tổng cập nhật ngay. Giờ tín chỉ CME dự kiến = số tiết dòng chia đều cho người dạy dòng đó × ${String(cme.factor).replace('.', ',')} (Thông tư 32/2023/TT-BYT) — xem sheet "Hướng dẫn".`
			: 'tự tính theo bảng trên: gõ / sửa tên ở cột Giảng viên, Trợ giảng thì tổng cập nhật ngay. Khóa này không thuộc loại tự cộng CME cho giảng viên nên không có giờ tín chỉ.',
	});
	return wb;
};

module.exports = { buildTeachingPlanTemplate };
