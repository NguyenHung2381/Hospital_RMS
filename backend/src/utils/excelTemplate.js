/**
 * excelTemplate.js — Tiện ích dựng file Excel mẫu / file xuất dạng bảng:
 * tiêu đề + dòng mô tả + hàng header màu, viền ô, và danh sách chọn (dropdown).
 * Dùng chung cho các mẫu nhập của module Hội thảo & CME.
 */

const thin = { style: 'thin', color: { argb: 'FFB0B7C3' } };
const border = { top: thin, bottom: thin, left: thin, right: thin };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A9B4A' } };

// Số dòng trống bên dưới dữ liệu vẫn có dropdown — để người dùng thêm dòng mới
const DROPDOWN_EXTRA_ROWS = 1000;

const colLetter = (n) => {
	let s = '';
	for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
	return s;
};

/**
 * Tạo sheet: dòng 1 tiêu đề, dòng 2 mô tả, dòng 3 header. Dữ liệu bắt đầu từ dòng 4.
 * columns: [{ key, header, width }]
 */
const buildSheet = (wb, { sheetName, title, subtitle, columns, letterhead = false }) => {
	// letterhead: thêm 3 dòng đầu (tên bệnh viện + quốc hiệu) — dòng tiêu đề/header/dữ liệu dịch xuống
	const top = letterhead ? 3 : 0;
	const headRow = top + 3;
	const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: headRow }] });
	ws.headRow = headRow;
	ws.columns = columns.map((c) => ({ key: c.key, width: c.width }));

	if (letterhead) {
		// Đơn vị chủ quản căn giữa bên trái; quốc hiệu ở khoảng giữa-phải bảng.
		// Bảng hẹp (< 8 cột) không đủ chỗ cho quốc hiệu → chỉ in tên đơn vị.
		const n = columns.length;
		const block = (c1, c2, row, text, font) => {
			if (c2 > c1) ws.mergeCells(row, c1, row, c2);
			const cell = ws.getCell(row, c1);
			cell.value = text;
			cell.font = font;
			cell.alignment = { horizontal: 'center', vertical: 'middle' };
		};
		const lEnd = n >= 8 ? 4 : Math.max(1, n - 1);
		block(1, lEnd, 1, 'SỞ Y TẾ NGHỆ AN', { size: 11 });
		block(1, lEnd, 2, 'BỆNH VIỆN HỮU NGHỊ ĐA KHOA NGHỆ AN', { bold: true, size: 11 });
		if (n >= 8) {
			const rEnd = n >= 10 ? n - 4 : n;
			const rStart = n >= 10 ? Math.max(6, rEnd - 3) : 5;
			block(rStart, rEnd, 1, 'CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true, size: 11 });
			block(rStart, rEnd, 2, 'Độc lập - Tự do - Hạnh phúc', {
				bold: true,
				size: 11,
				underline: true,
			});
		}
		[1, 2, 3].forEach((r) => (ws.getRow(r).height = 22));
	}

	ws.mergeCells(top + 1, 1, top + 1, columns.length);
	ws.getCell(top + 1, 1).value = title;
	ws.getCell(top + 1, 1).font = { bold: true, size: 14 };
	ws.getCell(top + 1, 1).alignment = letterhead
		? { horizontal: 'center', vertical: 'middle' }
		: undefined;
	ws.mergeCells(top + 2, 1, top + 2, columns.length);
	ws.getCell(top + 2, 1).value = subtitle;
	ws.getCell(top + 2, 1).font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
	ws.getCell(top + 2, 1).alignment = {
		wrapText: true,
		vertical: 'top',
		...(letterhead && { horizontal: 'center' }),
	};

	const head = ws.getRow(headRow);
	columns.forEach((c, i) => {
		const cell = head.getCell(i + 1);
		cell.value = c.header;
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.fill = HEADER_FILL;
		cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
		cell.border = border;
	});
	head.height = 32;
	return ws;
};

const styleBody = (ws, fromRow = (ws.headRow || 3) + 1) => {
	for (let r = fromRow; r <= ws.rowCount; r++) {
		ws.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
			cell.border = border;
			cell.alignment = { vertical: 'top', wrapText: true };
		});
	}
};

/**
 * Gắn dropdown cho các cột: dropdowns = { [columnKey]: string[] | { range, freeText } }.
 * - string[]: danh sách cố định ngắn; errorStyle 'warning' → gõ giá trị khác thì
 *   Excel hỏi lại nhưng vẫn cho giữ (service nhập tự quy đổi gần đúng).
 * - { range }: danh sách dài lấy từ sheet khác (xem addLookupSheet). freeText=true
 *   → tắt hẳn cảnh báo: vừa chọn được từ danh sách, vừa gõ tự do (VD người ngoài viện).
 */
const addDropdowns = (ws, columns, dropdowns, fromRow = (ws.headRow || 3) + 1) => {
	const toRow = Math.max(ws.rowCount, fromRow) + DROPDOWN_EXTRA_ROWS;
	for (const [key, spec] of Object.entries(dropdowns)) {
		const idx = columns.findIndex((c) => c.key === key);
		if (idx < 0 || !spec) continue;
		const col = colLetter(idx + 1);
		const isList = Array.isArray(spec);
		if (isList && spec.length === 0) continue;
		ws.dataValidations.add(`${col}${fromRow}:${col}${toRow}`, {
			type: 'list',
			allowBlank: true,
			formulae: [isList ? `"${spec.join(',')}"` : spec.range],
			...(isList || !spec.freeText
				? {
						showErrorMessage: true,
						errorStyle: 'warning',
						errorTitle: 'Giá trị không có trong danh sách',
						error: isList ? `Nên chọn một trong: ${spec.join(', ')}` : 'Nên chọn từ danh sách',
					}
				: { showErrorMessage: false }),
		});
	}
};

/**
 * Tạo sheet ẩn chứa danh sách tra cứu (VD cán bộ trong viện) để làm nguồn dropdown
 * dài — danh sách dạng "a,b,c" trong ô bị Excel giới hạn 255 ký tự nên không dùng được.
 * Trả về chuỗi vùng tham chiếu dùng cho addDropdowns ({ range }), hoặc null nếu rỗng.
 */
const addLookupSheet = (wb, sheetName, header, values) => {
	if (!values.length) return null;
	const ws = wb.addWorksheet(sheetName, { state: 'hidden' });
	ws.getColumn(1).width = 40;
	ws.getCell(1, 1).value = header;
	ws.getCell(1, 1).font = { bold: true };
	values.forEach((v, i) => {
		ws.getCell(i + 2, 1).value = v;
	});
	return `'${sheetName}'!$A$2:$A$${values.length + 1}`;
};

module.exports = { buildSheet, styleBody, addDropdowns, addLookupSheet, colLetter, border };
