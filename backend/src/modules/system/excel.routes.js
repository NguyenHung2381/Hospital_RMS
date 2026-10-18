// Nhập/xuất Excel dùng chung cho các trang danh sách chưa có endpoint riêng.
// Không đụng DB: /build chỉ định dạng dữ liệu client đã có quyền xem, /parse chỉ
// đọc file thành bảng chữ — việc ghi dữ liệu vẫn đi qua API tạo mới của từng
// module nên quyền & validate giữ nguyên.
const router = require('express').Router();
const ExcelJS = require('exceljs');
const { authenticate } = require('../../middlewares/auth');
const uploadExcel = require('../../middlewares/uploadExcel');
const { sendWorkbook, success } = require('../../utils/response');
const { headerRow, dataRow } = require('../../utils/excelStyle');
const { badRequest, cellText, loadWorkbook, parseDateCell } = require('../../utils/excelImport');
const { asyncHandler } = require('../../utils/asyncHandler');

const MAX_COLS = 60;
const MAX_ROWS = 50000;

router.use(authenticate);

router.post(
	'/build',
	asyncHandler(async (req, res) => {
		const { fileName, sheetName, headers, rows = [] } = req.body || {};
		if (!Array.isArray(headers) || !headers.length || headers.length > MAX_COLS)
			throw badRequest('Danh sách cột không hợp lệ');
		if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw badRequest(`Tối đa ${MAX_ROWS} dòng`);

		const wb = new ExcelJS.Workbook();
		// Tên sheet Excel: ≤31 ký tự, không chứa : \ / ? * [ ]
		const ws = wb.addWorksheet(
			String(sheetName || 'Dữ liệu')
				.replace(/[:\\/?*[\]]/g, ' ')
				.slice(0, 31),
		);
		headerRow(ws, 1, headers.map(String));
		rows.forEach((r, i) => {
			const vals = (Array.isArray(r) ? r : [])
				.slice(0, headers.length)
				.map((v) => (typeof v === 'number' ? v : v == null ? '' : String(v)));
			dataRow(ws, i + 2, vals);
		});
		headers.forEach((h, i) => {
			const longest = Math.max(
				String(h).length,
				...rows.slice(0, 500).map((r) => String(r?.[i] ?? '').length),
			);
			ws.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 10), 60);
		});
		ws.views = [{ state: 'frozen', ySplit: 1 }];

		const safeName = String(fileName || 'du-lieu')
			.replace(/[^\p{L}\p{N}_.-]+/gu, '-')
			.slice(0, 80);
		await sendWorkbook(res, wb, `${safeName}.xlsx`);
	}),
);

// Sheet đầu tiên → mảng dòng chữ (ô ngày đổi về dd/mm/yyyy). Client tự dò dòng tiêu đề.
router.post(
	'/parse',
	uploadExcel.single('file'),
	asyncHandler(async (req, res) => {
		if (!req.file) throw badRequest('Chưa chọn file');
		const wb = await loadWorkbook(req.file.buffer);
		const ws = wb.worksheets[0];
		if (!ws) throw badRequest('File không có sheet nào');
		const rows = [];
		const maxRow = Math.min(ws.rowCount || 0, MAX_ROWS + 30);
		const maxCol = Math.min(ws.columnCount || 0, MAX_COLS);
		for (let r = 1; r <= maxRow; r++) {
			const row = ws.getRow(r);
			const vals = [];
			for (let c = 1; c <= maxCol; c++) {
				const cell = row.getCell(c);
				const iso = cell.value instanceof Date ? parseDateCell(cell) : null;
				vals.push(iso ? iso.split('-').reverse().join('/') : cellText(cell));
			}
			rows.push(vals);
		}
		success(res, { rows });
	}),
);

module.exports = router;
