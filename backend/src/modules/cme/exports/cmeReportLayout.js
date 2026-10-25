// Định dạng ô / bố cục sheet + tổng hợp số liệu dùng chung cho các sheet báo cáo CME (cmeReportWorkbook.js).
const xl = require('../../../utils/excelTemplate');
const { NO_DEPT, round2 } = require('../cmeReportService');

const PARTICIPATION_LABELS = {
	attendee: 'Đại biểu',
	speaker: 'Báo cáo viên',
	chair: 'Chủ tọa',
	organizer: 'Ban tổ chức',
	trainee: 'Học viên',
};

// ── Định dạng ────────────────────────────────────────────────────────────────
const NUM = '#,##0.0#';
const NUM_DASH = '#,##0.0#;-#,##0.0#;"–"'; // 0 hiện "–" cho bảng chi tiết dễ nhìn
const PCT = '0.0%';
const thin = { style: 'thin', color: { argb: 'FFB0B7C3' } };
const border = { top: thin, bottom: thin, left: thin, right: thin };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const HEAD_FILL = fill('FF0A9B4A');
const TOTAL_FILL = fill('FFE6F4EC');
const WARN_FILL = fill('FFFFF4E5');
const GREEN = 'FF0A7A3B';
const RED = 'FFC00000';
const GREY = 'FF6B7280';

const fmtDate = (d) => {
	if (!d) return '';
	const x = d instanceof Date ? d : new Date(d);
	if (Number.isNaN(x.getTime())) return '';
	const p = (n) => String(n).padStart(2, '0');
	return `${p(x.getUTCDate())}/${p(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`;
};
const fmtRange = (a, b) => {
	const from = fmtDate(a);
	const to = fmtDate(b);
	return to && to !== from ? `${from} – ${to}` : from;
};

const setNum = (cell, fmt = NUM) => {
	cell.numFmt = fmt;
	cell.alignment = { horizontal: 'right', vertical: 'top' };
};

/** Căn lề cột theo kiểu dữ liệu sau styleBody (styleBody đặt mọi ô wrap + top). */
const alignCols = (ws, from, cols) => {
	for (let r = from; r <= ws.rowCount; r++) {
		const row = ws.getRow(r);
		for (const [key, opt] of Object.entries(cols)) {
			const cell = row.getCell(key);
			if (opt.numFmt) cell.numFmt = opt.numFmt;
			cell.alignment = { vertical: 'top', wrapText: true, horizontal: opt.h };
		}
	}
};

/** Dòng tổng cộng: nhãn gộp các cột 1..labelSpan, tô nền, in đậm. */
const addTotalRow = (ws, labelSpan, values, label = 'Tổng cộng') => {
	const row = ws.addRow(values);
	if (labelSpan > 1) ws.mergeCells(row.number, 1, row.number, labelSpan);
	row.getCell(1).value = label;
	for (let col = 1; col <= ws.columns.length; col++) {
		const cell = row.getCell(col);
		cell.font = { bold: true };
		cell.fill = TOTAL_FILL;
		cell.border = border;
		cell.alignment = { vertical: 'middle', horizontal: col <= labelSpan ? 'center' : 'right' };
	}
	row.height = 20;
	return row;
};

/** Khối ký tên cuối bảng: "Người lập biểu" bên trái, "Thủ trưởng đơn vị" bên phải. */
const addSignature = (ws, nCols) => {
	const d = new Date();
	const start = ws.rowCount + 2;
	const mid = Math.max(1, Math.floor(nCols / 2));
	const block = (row, c1, c2, text, font) => {
		if (c2 > c1) ws.mergeCells(row, c1, row, c2);
		const cell = ws.getCell(row, c1);
		cell.value = text;
		cell.font = font;
		cell.alignment = { horizontal: 'center' };
	};
	block(
		start,
		mid + 1,
		nCols,
		`Nghệ An, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`,
		{
			italic: true,
		},
	);
	block(start + 1, 1, mid, 'NGƯỜI LẬP BIỂU', { bold: true });
	block(start + 1, mid + 1, nCols, 'THỦ TRƯỞNG ĐƠN VỊ', { bold: true });
	block(start + 2, 1, mid, '(Ký, ghi rõ họ tên)', { italic: true, color: { argb: GREY } });
	block(start + 2, mid + 1, nCols, '(Ký, đóng dấu)', { italic: true, color: { argb: GREY } });
};

// ── Bố cục hàng tiêu đề cột ─────────────────────────────────────────────────
const LINE_PT = 15; // chiều cao 1 dòng chữ đậm cỡ 11
const FILTER_ROOM = 2.5; // độ rộng nút lọc ▾ ở góc phải ô tiêu đề

/** Số dòng khi xuống dòng theo từ trong ô rộng `width` (≈ 1 ký tự / đơn vị độ rộng). */
const wrapLines = (text, width) => {
	const cpl = Math.max(4, Math.floor(width * 0.95));
	let lines = 1;
	let len = 0;
	for (const w of String(text ?? '')
		.split(/\s+/)
		.filter(Boolean)) {
		if (len && len + 1 + w.length > cpl) {
			lines++;
			len = w.length;
		} else len += (len ? 1 : 0) + w.length;
	}
	return lines;
};

/**
 * Chiều cao hàng tiêu đề vừa đủ cho tiêu đề dài nhất (không tràn chữ, không đè nút lọc),
 * chữ căn giữa cả 2 chiều. filtered: chừa chỗ cho nút lọc ở mỗi ô.
 */
const fitHeadRow = (ws, filtered = false) => {
	const head = ws.getRow(ws.headRow);
	let lines = 1;
	ws.columns.forEach((col, i) => {
		const cell = head.getCell(i + 1);
		const width = (col.width ?? 10) - (filtered ? FILTER_ROOM : 0) - 1;
		lines = Math.max(lines, wrapLines(cell.value, width));
		cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
	});
	// Có nút lọc: thêm nửa dòng đệm dưới để dòng chữ cuối không chạm nút
	head.height = Math.max(30, lines * LINE_PT + (filtered ? 14 : 8));
};

/**
 * Cột hình thức CME: cùng một độ rộng cho mọi cột (bảng cân đối) — độ rộng nhỏ nhất
 * (16 – 28) mà mọi tiêu đề đều gói trong ≤ 4 dòng, kể cả chỗ cho nút lọc.
 */
const groupColsOf = (groups) => {
	const fits = (w) => groups.every((g) => wrapLines(g.name, w - FILTER_ROOM - 1) <= 4);
	let width = 16;
	while (width < 28 && !fits(width)) width++;
	return groups.map((g) => ({ key: g.id, header: g.name, width }));
};

/**
 * Bộ lọc (AutoFilter) cho vùng tiêu đề cột → dòng dữ liệu cuối (không gồm dòng tổng / ký tên),
 * cố định hàng tiêu đề + cột TT/MNV/Họ tên khi cuộn danh sách dài.
 */
const addFilter = (ws, lastRow, xSplit = 3) => {
	if (lastRow > ws.headRow)
		ws.autoFilter = {
			from: { row: ws.headRow, column: 1 },
			to: { row: lastRow, column: ws.columns.length },
		};
	ws.views = [{ state: 'frozen', xSplit, ySplit: ws.headRow }];
	fitHeadRow(ws, lastRow > ws.headRow);
};

/** Tổng 1 cột cho dòng tổng: SUBTOTAL(109) → lọc bằng AutoFilter thì tổng chỉ cộng các dòng đang hiện. */
const subtotal = (idx, first, last, result) => {
	const c = xl.colLetter(idx);
	return last >= first ? { formula: `SUBTOTAL(109,${c}${first}:${c}${last})`, result } : 0;
};

/** In A4, vừa 1 trang ngang, lặp lại hàng tiêu đề cột ở mỗi trang. */
const setupPrint = (ws, landscape = false) => {
	ws.pageSetup = {
		paperSize: 9,
		orientation: landscape ? 'landscape' : 'portrait',
		fitToPage: true,
		fitToWidth: 1,
		fitToHeight: 0,
		horizontalCentered: true,
		margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
		printTitlesRow: `${ws.headRow}:${ws.headRow}`,
	};
	ws.headerFooter = { oddFooter: '&C&9Trang &P / &N' };
};

/** Hàng tiêu đề cho bảng phụ trong cùng sheet (cùng kiểu với xl.buildSheet). */
const addHeadRow = (ws, headers) => {
	const row = ws.addRow(headers);
	row.eachCell((cell) => {
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.fill = HEAD_FILL;
		cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
		cell.border = border;
	});
	row.height = 28;
	return row;
};

const addSectionTitle = (ws, nCols, text) => {
	const row = ws.addRow([text]);
	ws.mergeCells(row.number, 1, row.number, nCols);
	row.getCell(1).font = { bold: true, size: 12, color: { argb: GREEN } };
	row.height = 22;
};

const borderRow = (row, nCols) => {
	for (let c = 1; c <= nCols; c++) {
		const cell = row.getCell(c);
		cell.border = border;
		cell.alignment = { vertical: 'top', wrapText: true, ...cell.alignment };
	}
};

// ── Tổng hợp số liệu ─────────────────────────────────────────────────────────
const summarize = (people) => {
	const n = people.length;
	const withCredits = people.filter((p) => p.total > 0).length;
	const total = round2(people.reduce((s, p) => s + p.total, 0));
	const evaluated = people.filter((p) => p.required != null);
	const passed = evaluated.filter((p) => p.total >= p.required).length;
	return {
		n,
		withCredits,
		zero: n - withCredits,
		total,
		avg: n ? round2(total / n) : 0,
		max: people.reduce((m, p) => Math.max(m, p.total), 0),
		evaluated: evaluated.length,
		passed,
		failed: evaluated.length - passed,
	};
};

/** Số liệu của riêng một năm trong báo cáo nhiều năm (đánh giá theo ngưỡng của năm đó). */
const summarizeYear = (people, y) => {
	const withCredits = people.filter((p) => (p.by_year[y] ?? 0) > 0).length;
	const total = round2(people.reduce((s, p) => s + (p.by_year[y] ?? 0), 0));
	const evaluated = people.filter((p) => p.required_by_year[y] != null);
	const passed = evaluated.filter((p) => (p.by_year[y] ?? 0) >= p.required_by_year[y]).length;
	return {
		withCredits,
		total,
		avg: people.length ? round2(total / people.length) : 0,
		evaluated: evaluated.length,
		passed,
		failed: evaluated.length - passed,
	};
};

/** "x/y": số năm đạt ngưỡng riêng của năm / số năm có ngưỡng áp dụng ('' nếu không đánh giá). */
const yearsPassedOf = (p) => {
	const ys = Object.keys(p.required_by_year);
	if (!ys.length) return '';
	const ok = ys.filter((y) => (p.by_year[y] ?? 0) >= p.required_by_year[y]).length;
	return `${ok}/${ys.length}`;
};

// Cột số tiết từng năm (báo cáo nhiều năm)
const yearKey = (y) => `y${y}`;
const yearColsOf = (years) =>
	years.map((y) => ({ key: yearKey(y), header: `Năm ${y}`, width: 11 }));
const yearValuesOf = (years, valueOf) =>
	Object.fromEntries(years.map((y) => [yearKey(y), valueOf(y)]));

/** Dòng "Năm báo cáo" ở Tổng quan: "2025" / "2021 – 2025 (5 năm)" / "Tất cả các năm (2019 – 2026)". */
const periodText = ({ fromYear, toYear, years }) => {
	const first = years[0];
	const last = years[years.length - 1];
	if (fromYear === null && toYear === null)
		return years.length ? `Tất cả các năm (${first} – ${last})` : 'Tất cả các năm';
	if (fromYear === toYear) return String(fromYear);
	const span = `${fromYear ?? first ?? '…'} – ${toYear ?? last ?? '…'}`;
	return years.length > 1 ? `${span} (${years.length} năm)` : span;
};

const byDepartment = (people) => {
	const map = new Map();
	for (const p of people) {
		const k = p.department_name ?? NO_DEPT;
		if (!map.has(k)) map.set(k, []);
		map.get(k).push(p);
	}
	return [...map.entries()]
		.sort(([a], [b]) => Number(a === NO_DEPT) - Number(b === NO_DEPT) || a.localeCompare(b, 'vi'))
		.map(([name, list]) => ({ name, list, ...summarize(list) }));
};

const ident = [
	{ key: 'tt', header: 'TT', width: 6 },
	{ key: 'mnv', header: 'MNV', width: 10 },
	{ key: 'name', header: 'Họ và tên', width: 28 },
	{ key: 'dept', header: 'Khoa/Phòng', width: 30 },
];
const identOf = (p, i) => ({
	tt: i + 1,
	mnv: p.staff_number ?? '',
	name: p.is_active ? p.full_name : `${p.full_name} (đã nghỉ)`,
	dept: p.department_name ?? '',
});

module.exports = {
	NUM,
	NUM_DASH,
	PCT,
	WARN_FILL,
	GREEN,
	RED,
	GREY,
	setNum,
	alignCols,
	addTotalRow,
	addSignature,
	groupColsOf,
	addFilter,
	subtotal,
	setupPrint,
	addHeadRow,
	addSectionTitle,
	borderRow,
	summarize,
	summarizeYear,
	yearsPassedOf,
	yearKey,
	yearColsOf,
	yearValuesOf,
	periodText,
	ident,
	identOf,
	PARTICIPATION_LABELS,
	fmtRange,
	fitHeadRow,
	byDepartment,
};
