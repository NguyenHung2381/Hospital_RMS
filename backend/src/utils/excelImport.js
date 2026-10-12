/**
 * excelImport.js — helper đọc file Excel nhập liệu dùng chung cho các service
 * *ImportService (học viên, người tham dự hội thảo, ghi nhận CME, hội đồng).
 */
const ExcelJS = require('exceljs');
const { norm } = require('./vietnameseText');

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

// Text hiển thị của ô (cell.text xử lý sẵn richText/formula); gộp khoảng trắng.
const cellText = (cell) => {
	if (!cell) return '';
	try {
		return String(cell.text ?? '').replace(/\s+/g, ' ').trim();
	} catch {
		return '';
	}
};

const pad2 = (n) => String(n).padStart(2, '0');

// Ô ngày (Date thật hoặc chuỗi dd/mm/yyyy) → 'YYYY-MM-DD'; không nhận diện được → null.
// exceljs lưu ngày ở UTC — đọc theo UTC để giữ đúng ngày lịch.
const parseDateCell = (cell) => {
	if (!cell) return null;
	const v = cell.value;
	if (v instanceof Date && !Number.isNaN(v.getTime())) {
		return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}`;
	}
	// Excel hay chèn dấu ' đầu ô để ép kiểu chữ; bỏ trước khi parse.
	const raw = cellText(cell).replace(/^['"\s]+/, '');
	const m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
	if (m) {
		const [d, mo, y] = [+m[1], +m[2], +m[3]];
		if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return `${y}-${pad2(mo)}-${pad2(d)}`;
	}
	return null;
};

// Ngày sinh: { dob: 'YYYY-MM-DD'|null, dob_text } — nguồn tạp ("1989", "3/1990"…) thì giữ nguyên chữ.
const parseDob = (cell) => {
	const dob = parseDateCell(cell);
	if (dob) return { dob, dob_text: null };
	const raw = cellText(cell).replace(/^['"\s]+/, '');
	return { dob: null, dob_text: raw || null };
};

// "3,5" / "3.5" / "3" → number; rỗng → null
const parseCredits = (s) => {
	const t = String(s || '').replace(',', '.').trim();
	if (!t) return null;
	const n = parseFloat(t);
	return Number.isFinite(n) ? n : null;
};

// "NV-00123" → 123; không có chữ số → null
const parseStaffNumber = (s) => {
	const t = String(s || '').replace(/\D+/g, '');
	if (!t) return null;
	const n = parseInt(t, 10);
	return Number.isFinite(n) ? n : null;
};

const loadWorkbook = async (buffer) => {
	const workbook = new ExcelJS.Workbook();
	try {
		await workbook.xlsx.load(buffer);
	} catch {
		throw badRequest('File không đọc được — cần file .xlsx hợp lệ.');
	}
	return workbook;
};

/**
 * Dò dòng tiêu đề trong 30 dòng đầu mỗi sheet (file thật thường có vài dòng
 * tiêu đề văn bản phía trên). `matchers` = [[field, (normalizedHeader) => bool]].
 * `isValid(cols)` quyết định dòng đó đủ cột chưa. Trả { ws, headerRow, cols } | null.
 */
const findHeader = (workbook, matchers, isValid) => {
	for (const ws of workbook.worksheets) {
		const scanMax = Math.min(ws.actualRowCount || ws.rowCount || 0, 30);
		for (let r = 1; r <= scanMax; r++) {
			const cols = {};
			ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
				const h = norm(cellText(cell));
				if (!h) return;
				for (const [field, test] of matchers) {
					if (cols[field] == null && test(h)) {
						cols[field] = col;
						break;
					}
				}
			});
			if (isValid(cols)) return { ws, headerRow: r, cols };
		}
	}
	return null;
};

/**
 * Mở file + tìm header + duyệt từng dòng dữ liệu. `isEmpty(get, row)` đánh dấu
 * dòng trống; dừng sau 25 dòng trống liên tiếp. Trả { ws, cols, rows: [{ r, row, get }] }.
 */
const readSheet = async (buffer, { matchers, isValid, headerError, isEmpty }) => {
	const workbook = await loadWorkbook(buffer);
	const header = findHeader(workbook, matchers, isValid);
	if (!header) throw badRequest(headerError);
	const { ws, headerRow, cols } = header;
	const get = (row, field) => (cols[field] ? cellText(row.getCell(cols[field])) : '');
	const rows = [];
	let emptyStreak = 0;
	// rowCount = số thứ tự dòng cuối (actualRowCount chỉ đếm dòng có dữ liệu, sẽ hụt nếu có dòng trống xen giữa)
	const maxRow = ws.rowCount || headerRow;
	for (let r = headerRow + 1; r <= maxRow && emptyStreak < 25; r++) {
		const row = ws.getRow(r);
		if (isEmpty(get, row)) {
			emptyStreak++;
			continue;
		}
		emptyStreak = 0;
		rows.push({ r, row, get });
	}
	return { ws, cols, rows };
};

module.exports = {
	badRequest,
	pad2,
	cellText,
	parseDateCell,
	parseDob,
	parseCredits,
	parseStaffNumber,
	loadWorkbook,
	findHeader,
	readSheet,
};
