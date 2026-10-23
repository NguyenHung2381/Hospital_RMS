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
const ExcelJS = require('exceljs');
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

// ── Các sheet ────────────────────────────────────────────────────────────────
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

const sheetOverview = (wb, data, head) => {
	const { people, groups, activities, hasRequirement, years } = data;
	const multi = years.length > 1;
	const s = summarize(people);
	const cols = [
		{ key: 'a', header: 'Chỉ tiêu', width: 52 },
		{ key: 'b', header: 'Số lượng', width: 16 },
		{ key: 'c', header: 'Tỷ lệ', width: 16 },
		{ key: 'd', header: 'Ghi chú', width: 34 },
	];
	const ws = xl.buildSheet(wb, {
		sheetName: 'Tổng quan',
		letterhead: true,
		...head,
		columns: cols,
	});
	const rows = [
		['Năm báo cáo', periodText(data)],
		['Tổng số nhân sự trong báo cáo', s.n, null, 'Không gồm tài khoản dùng chung của khoa/phòng'],
		['Nhân sự đã có tín chỉ CME', s.withCredits, s.n ? s.withCredits / s.n : null],
		['Nhân sự chưa có tín chỉ (0 tiết)', s.zero, s.n ? s.zero / s.n : null],
		['Tổng số tiết CME', s.total],
		['Bình quân số tiết / nhân sự', s.avg, null, multi ? 'Cộng dồn cả giai đoạn' : null],
		...(multi ? [['Bình quân số tiết / nhân sự / năm', round2(s.avg / years.length)]] : []),
		['Số tiết cao nhất của một nhân sự', s.max],
		['Tổng số lượt hoạt động được tính tín chỉ', activities.length],
		...(hasRequirement
			? [
					[
						'Nhân sự được đánh giá theo ngưỡng',
						s.evaluated,
						null,
						multi
							? 'Ngưỡng = cộng dồn ngưỡng các năm có cấu hình trong giai đoạn'
							: 'Nhân sự đang làm việc, khoa có ngưỡng áp dụng',
					],
					['Đạt ngưỡng tín chỉ', s.passed, s.evaluated ? s.passed / s.evaluated : null],
					[
						'Chưa đạt ngưỡng tín chỉ',
						s.failed,
						s.evaluated ? s.failed / s.evaluated : null,
						'Xem sheet "Chưa đạt"',
					],
				]
			: []),
	];
	rows.forEach(([a, b, c, d]) => {
		const row = ws.addRow({ a, b, c, d });
		borderRow(row, 4);
		row.getCell('b').alignment = { horizontal: 'right', vertical: 'top' };
		if (typeof b === 'number' && !Number.isInteger(b)) row.getCell('b').numFmt = NUM;
		if (c != null) setNum(row.getCell('c'), PCT);
		row.getCell('d').font = { italic: true, color: { argb: GREY } };
	});

	// Cơ cấu theo hình thức CME
	ws.addRow([]);
	addSectionTitle(ws, 4, 'Cơ cấu theo hình thức CME');
	addHeadRow(ws, ['Hình thức', 'Số lượt', 'Số tiết', 'Tỷ lệ số tiết']);
	const actTotal = round2(activities.reduce((t, a) => t + a.credits, 0));
	for (const g of groups) {
		const list = activities.filter((a) => a.group_id === g.id);
		const credits = round2(list.reduce((t, a) => t + a.credits, 0));
		const row = ws.addRow([g.name, list.length, credits, actTotal ? credits / actTotal : 0]);
		borderRow(row, 4);
		row.getCell(2).alignment = { horizontal: 'right', vertical: 'top' };
		setNum(row.getCell(3));
		setNum(row.getCell(4), PCT);
	}
	const tot = addTotalRow(ws, 1, ['', activities.length, actTotal, actTotal ? 1 : 0]);
	tot.getCell(3).numFmt = NUM;
	tot.getCell(4).numFmt = PCT;

	// Diễn biến theo năm (báo cáo nhiều năm) — chi tiết theo hình thức ở sheet "Theo năm"
	if (multi) {
		ws.addRow([]);
		addSectionTitle(ws, 4, 'Diễn biến theo năm');
		addHeadRow(ws, ['Năm', 'Số lượt', 'Số tiết', 'Tỷ lệ số tiết']);
		for (const y of years) {
			const list = activities.filter((a) => a.year === y);
			const credits = round2(list.reduce((t, a) => t + a.credits, 0));
			const row = ws.addRow([`Năm ${y}`, list.length, credits, actTotal ? credits / actTotal : 0]);
			borderRow(row, 4);
			row.getCell(2).alignment = { horizontal: 'right', vertical: 'top' };
			setNum(row.getCell(3));
			setNum(row.getCell(4), PCT);
		}
		const yt = addTotalRow(
			ws,
			1,
			['', activities.length, actTotal, actTotal ? 1 : 0],
			'Cả giai đoạn',
		);
		yt.getCell(3).numFmt = NUM;
		yt.getCell(4).numFmt = PCT;
	}
	setupPrint(ws);
};

const sheetSummary = (wb, data, head) => {
	const { people, hasRequirement, years } = data;
	// Nhiều năm: TT | MNV | Họ tên | Khoa | Năm 1..n | Tổng (| Ngưỡng cộng dồn | Số năm đạt | Đánh giá)
	const multi = years.length > 1;
	const yearCols = multi ? yearColsOf(years) : [];
	const cols = [
		...ident,
		...yearCols,
		{ key: 'total', header: multi ? 'Tổng số tiết cả giai đoạn' : 'Tổng số tiết', width: 14 },
		...(hasRequirement
			? [
					{ key: 'required', header: multi ? 'Ngưỡng cộng dồn' : 'Ngưỡng', width: 11 },
					...(multi ? [{ key: 'yearsPassed', header: 'Số năm đạt ngưỡng', width: 11 }] : []),
					{ key: 'result', header: 'Đánh giá', width: 12 },
				]
			: []),
	];
	const ws = xl.buildSheet(wb, { sheetName: 'BC tổng', letterhead: true, ...head, columns: cols });
	const first = ws.headRow + 1;
	const y1 = xl.colLetter(ident.length + 1);
	const yN = xl.colLetter(ident.length + yearCols.length);
	people.forEach((p, i) => {
		const row = ws.addRow({
			...identOf(p, i),
			...(multi && yearValuesOf(years, (y) => p.by_year[y] ?? 0)),
			...(hasRequirement && {
				required: p.required ?? '',
				...(multi && { yearsPassed: yearsPassedOf(p) }),
				result: p.required == null ? '' : p.total >= p.required ? 'Đạt' : 'Chưa đạt',
			}),
		});
		// Tổng nhiều năm là công thức cộng các cột năm (như BC chi tiết), kèm sẵn kết quả
		row.getCell('total').value = multi
			? { formula: `SUM(${y1}${row.number}:${yN}${row.number})`, result: p.total }
			: p.total;
		if (p.total === 0) row.getCell('total').fill = WARN_FILL;
		// Năm chưa đủ ngưỡng của riêng năm đó → chữ đỏ
		if (multi)
			for (const y of years) {
				const req = p.required_by_year[y];
				if (req != null && (p.by_year[y] ?? 0) < req)
					row.getCell(yearKey(y)).font = { color: { argb: RED } };
			}
		if (hasRequirement && p.required != null) {
			row.getCell('result').font = {
				bold: true,
				color: { argb: p.total >= p.required ? GREEN : RED },
			};
		}
	});
	xl.styleBody(ws);
	alignCols(ws, first, {
		tt: { h: 'center' },
		mnv: { h: 'center' },
		...Object.fromEntries(yearCols.map((c) => [c.key, { h: 'right', numFmt: NUM_DASH }])),
		total: { h: 'right', numFmt: NUM },
		...(hasRequirement && {
			required: { h: 'right', numFmt: NUM },
			...(multi && { yearsPassed: { h: 'center' } }),
			result: { h: 'center' },
		}),
	});
	if (multi)
		for (let r = first; r <= ws.rowCount; r++) ws.getRow(r).getCell('total').font = { bold: true };
	const last = ws.rowCount;
	addFilter(ws, last);
	const sumCol = (idx, result) => subtotal(idx, first, last, result);
	const tot = addTotalRow(ws, ident.length, {
		...(multi &&
			Object.fromEntries(
				years.map((y, i) => [
					yearKey(y),
					sumCol(ident.length + 1 + i, summarizeYear(people, y).total),
				]),
			)),
		total: sumCol(ident.length + yearCols.length + 1, summarize(people).total),
	});
	for (let c = ident.length + 1; c <= ident.length + yearCols.length + 1; c++)
		tot.getCell(c).numFmt = NUM;
	addSignature(ws, cols.length);
	setupPrint(ws, multi && years.length > 3);
};

/**
 * BC chi tiết: TT | MNV | Họ tên | Khoa | <từng hình thức CME> | Tổng — cộng cả khoảng năm.
 * year: sheet riêng "Năm <year>" — chỉ số tiết của năm đó, thêm Ngưỡng / Đánh giá nếu năm có ngưỡng.
 */
const sheetDetail = (wb, data, head, year = null) => {
	const { people, groups } = data;
	const byGroup = (p) => (year == null ? p.by_group : (p.by_year_group[year] ?? {}));
	const totalOf = (p) => (year == null ? p.total : (p.by_year[year] ?? 0));
	const requiredOf = (p) => (year == null ? null : (p.required_by_year[year] ?? null));
	const hasReq = year != null && people.some((p) => requiredOf(p) != null);
	const groupCols = groupColsOf(groups);
	const cols = [
		...ident,
		...groupCols,
		{ key: 'total', header: year == null ? 'Tổng' : `Tổng năm ${year}`, width: 13 },
		...(hasReq
			? [
					{ key: 'required', header: 'Ngưỡng', width: 10 },
					{ key: 'result', header: 'Đánh giá', width: 12 },
				]
			: []),
	];
	const ws = xl.buildSheet(wb, {
		sheetName: year == null ? 'BC chi tiết' : `Năm ${year}`,
		letterhead: true,
		...head,
		columns: cols,
	});
	const first = ws.headRow + 1;
	const g1 = xl.colLetter(ident.length + 1);
	const g2 = xl.colLetter(ident.length + groupCols.length);
	people.forEach((p, i) => {
		const total = totalOf(p);
		const req = requiredOf(p);
		const row = ws.addRow({
			...identOf(p, i),
			...Object.fromEntries(groups.map((g) => [g.id, byGroup(p)[g.id] ?? 0])),
			...(hasReq && {
				required: req ?? '',
				result: req == null ? '' : total >= req ? 'Đạt' : 'Chưa đạt',
			}),
		});
		// Tổng là công thức như mẫu (sửa số từng hình thức thì tự cộng lại), kèm sẵn kết quả
		row.getCell('total').value = groups.length
			? { formula: `SUM(${g1}${row.number}:${g2}${row.number})`, result: total }
			: total;
		if (year != null && total === 0) row.getCell('total').fill = WARN_FILL;
		if (req != null)
			row.getCell('result').font = { bold: true, color: { argb: total >= req ? GREEN : RED } };
	});
	xl.styleBody(ws);
	alignCols(ws, first, {
		tt: { h: 'center' },
		mnv: { h: 'center' },
		...Object.fromEntries(groups.map((g) => [g.id, { h: 'right', numFmt: NUM_DASH }])),
		total: { h: 'right', numFmt: NUM },
		...(hasReq && { required: { h: 'right', numFmt: NUM }, result: { h: 'center' } }),
	});
	for (let r = first; r <= ws.rowCount; r++) ws.getRow(r).getCell('total').font = { bold: true };

	const last = ws.rowCount;
	addFilter(ws, last);
	const tot = addTotalRow(ws, ident.length, {
		...Object.fromEntries(
			groups.map((g, i) => [
				g.id,
				subtotal(
					ident.length + 1 + i,
					first,
					last,
					round2(people.reduce((t, p) => t + (byGroup(p)[g.id] ?? 0), 0)),
				),
			]),
		),
		total: subtotal(
			ident.length + groupCols.length + 1,
			first,
			last,
			round2(people.reduce((t, p) => t + totalOf(p), 0)),
		),
	});
	for (let c = ident.length + 1; c <= ident.length + groupCols.length + 1; c++)
		tot.getCell(c).numFmt = NUM;
	addSignature(ws, cols.length);
	setupPrint(ws, true);
};

const sheetDepartments = (wb, data, head) => {
	const { people, hasRequirement, years } = data;
	const multi = years.length > 1;
	const yearCols = multi ? yearColsOf(years) : [];
	const cols = [
		{ key: 'tt', header: 'TT', width: 6 },
		{ key: 'name', header: 'Khoa/Phòng', width: 36 },
		{ key: 'n', header: 'Số nhân sự', width: 11 },
		{ key: 'with', header: 'Đã có tín chỉ', width: 11 },
		{ key: 'zero', header: 'Chưa có tín chỉ', width: 11 },
		...yearCols,
		{ key: 'total', header: multi ? 'Tổng số tiết cả giai đoạn' : 'Tổng số tiết', width: 13 },
		{ key: 'avg', header: 'Bình quân tiết/người', width: 13 },
		...(hasRequirement
			? [
					{ key: 'passed', header: 'Đạt ngưỡng', width: 11 },
					{ key: 'failed', header: 'Chưa đạt', width: 11 },
					{ key: 'rate', header: 'Tỷ lệ đạt', width: 11 },
				]
			: []),
	];
	const ws = xl.buildSheet(wb, {
		sheetName: 'Theo khoa',
		letterhead: true,
		...head,
		columns: cols,
	});
	const first = ws.headRow + 1;
	const valuesOf = (d, list) => ({
		n: d.n,
		with: d.withCredits,
		zero: d.zero,
		...(multi && yearValuesOf(years, (y) => summarizeYear(list, y).total)),
		total: d.total,
		avg: d.avg,
		...(hasRequirement && {
			passed: d.passed,
			failed: d.failed,
			rate: d.evaluated ? d.passed / d.evaluated : '',
		}),
	});
	byDepartment(people).forEach((d, i) => {
		const row = ws.addRow({ tt: i + 1, name: d.name, ...valuesOf(d, d.list) });
		if (hasRequirement && d.failed > 0)
			row.getCell('failed').font = { bold: true, color: { argb: RED } };
	});
	xl.styleBody(ws);
	const numeric = {
		n: { h: 'right' },
		with: { h: 'right' },
		zero: { h: 'right' },
		...Object.fromEntries(yearCols.map((c) => [c.key, { h: 'right', numFmt: NUM }])),
		total: { h: 'right', numFmt: NUM },
		avg: { h: 'right', numFmt: NUM },
		...(hasRequirement && {
			passed: { h: 'right' },
			failed: { h: 'right' },
			rate: { h: 'right', numFmt: PCT },
		}),
	};
	alignCols(ws, first, { tt: { h: 'center' }, ...numeric });
	addFilter(ws, ws.rowCount, 2);
	const tot = addTotalRow(ws, 2, valuesOf(summarize(people), people), 'Toàn viện');
	for (const [k, o] of Object.entries(numeric)) if (o.numFmt) tot.getCell(k).numFmt = o.numFmt;
	addSignature(ws, cols.length);
	setupPrint(ws, hasRequirement || multi);
};

const sheetFailed = (wb, data, head) => {
	const { years } = data;
	const multi = years.length > 1;
	const yearCols = multi ? yearColsOf(years) : [];
	const evaluated = data.people.filter((p) => p.required != null);
	const failed = evaluated.filter((p) => p.total < p.required);
	const cols = [
		...ident,
		...yearCols,
		{ key: 'required', header: multi ? 'Ngưỡng cộng dồn' : 'Ngưỡng', width: 11 },
		{ key: 'total', header: 'Đã đạt', width: 10 },
		{ key: 'missing', header: 'Còn thiếu', width: 11 },
	];
	const ws = xl.buildSheet(wb, {
		sheetName: 'Chưa đạt',
		letterhead: true,
		title: `DANH SÁCH NHÂN SỰ CHƯA ĐẠT NGƯỠNG TÍN CHỈ CME ${data.rangeLabel}`,
		subtitle: `${failed.length}/${evaluated.length} nhân sự được đánh giá chưa đạt · ${head.subtitle.replace(/^.*?(?=Xuất ngày)/, '')}`,
		columns: cols,
	});
	const first = ws.headRow + 1;
	if (!failed.length) {
		const row = ws.addRow(['Tất cả nhân sự được đánh giá đều đã đạt ngưỡng tín chỉ.']);
		ws.mergeCells(row.number, 1, row.number, cols.length);
		row.getCell(1).font = { italic: true, color: { argb: GREEN } };
		row.getCell(1).alignment = { horizontal: 'center' };
	}
	failed.forEach((p, i) => {
		const row = ws.addRow({
			...identOf(p, i),
			...(multi && yearValuesOf(years, (y) => p.by_year[y] ?? 0)),
			required: p.required,
			total: p.total,
			missing: round2(p.required - p.total),
		});
		row.getCell('missing').font = { bold: true, color: { argb: RED } };
		if (multi)
			for (const y of years) {
				const req = p.required_by_year[y];
				if (req != null && (p.by_year[y] ?? 0) < req)
					row.getCell(yearKey(y)).font = { color: { argb: RED } };
			}
	});
	if (failed.length) {
		xl.styleBody(ws);
		alignCols(ws, first, {
			tt: { h: 'center' },
			mnv: { h: 'center' },
			...Object.fromEntries(yearCols.map((c) => [c.key, { h: 'right', numFmt: NUM_DASH }])),
			required: { h: 'right', numFmt: NUM },
			total: { h: 'right', numFmt: NUM },
			missing: { h: 'right', numFmt: NUM },
		});
	}
	if (failed.length) addFilter(ws, ws.rowCount);
	addSignature(ws, cols.length);
	setupPrint(ws, multi && years.length > 3);
};

/** Diễn biến từng năm (báo cáo nhiều năm): Năm | NS có tín chỉ | Số lượt | <hình thức> | Tổng | Bình quân (| đánh giá theo ngưỡng năm). */
const sheetYears = (wb, data, head) => {
	const { people, groups, activities, years, hasRequirement } = data;
	const groupCols = groupColsOf(groups);
	const cols = [
		{ key: 'year', header: 'Năm', width: 12 },
		{ key: 'with', header: 'Nhân sự có tín chỉ', width: 11 },
		{ key: 'count', header: 'Số lượt', width: 9 },
		...groupCols,
		{ key: 'total', header: 'Tổng số tiết', width: 12 },
		{ key: 'avg', header: 'Bình quân tiết/người', width: 12 },
		...(hasRequirement
			? [
					{ key: 'evaluated', header: 'Được đánh giá', width: 10 },
					{ key: 'passed', header: 'Đạt ngưỡng năm', width: 10 },
					{ key: 'failed', header: 'Chưa đạt', width: 10 },
					{ key: 'rate', header: 'Tỷ lệ đạt', width: 10 },
				]
			: []),
	];
	const ws = xl.buildSheet(wb, { sheetName: 'Theo năm', letterhead: true, ...head, columns: cols });
	fitHeadRow(ws);
	const first = ws.headRow + 1;
	const creditsOf = (list) => round2(list.reduce((t, a) => t + a.credits, 0));
	for (const y of years) {
		const acts = activities.filter((a) => a.year === y);
		const s = summarizeYear(people, y);
		const hasReq = s.evaluated > 0;
		const row = ws.addRow({
			year: `Năm ${y}`,
			with: s.withCredits,
			count: acts.length,
			...Object.fromEntries(
				groups.map((g) => [g.id, creditsOf(acts.filter((a) => a.group_id === g.id))]),
			),
			total: s.total,
			avg: s.avg,
			// Năm chưa cấu hình ngưỡng → để trống phần đánh giá
			...(hasRequirement && {
				evaluated: hasReq ? s.evaluated : '',
				passed: hasReq ? s.passed : '',
				failed: hasReq ? s.failed : '',
				rate: hasReq ? s.passed / s.evaluated : '',
			}),
		});
		if (hasRequirement && s.failed > 0)
			row.getCell('failed').font = { bold: true, color: { argb: RED } };
	}
	xl.styleBody(ws);
	const numeric = {
		with: { h: 'right' },
		count: { h: 'right' },
		...Object.fromEntries(groups.map((g) => [g.id, { h: 'right', numFmt: NUM_DASH }])),
		total: { h: 'right', numFmt: NUM },
		avg: { h: 'right', numFmt: NUM },
		...(hasRequirement && {
			evaluated: { h: 'right' },
			passed: { h: 'right' },
			failed: { h: 'right' },
			rate: { h: 'right', numFmt: PCT },
		}),
	};
	alignCols(ws, first, { year: { h: 'center' }, ...numeric });
	for (let r = first; r <= ws.rowCount; r++) ws.getRow(r).getCell('total').font = { bold: true };

	// Dòng cả giai đoạn: nhân sự có tín chỉ / đánh giá tính theo tổng cộng dồn (như BC tổng)
	const s = summarize(people);
	const tot = addTotalRow(
		ws,
		1,
		{
			with: s.withCredits,
			count: activities.length,
			...Object.fromEntries(
				groups.map((g) => [g.id, creditsOf(activities.filter((a) => a.group_id === g.id))]),
			),
			total: s.total,
			avg: s.avg,
			...(hasRequirement && {
				evaluated: s.evaluated,
				passed: s.passed,
				failed: s.failed,
				rate: s.evaluated ? s.passed / s.evaluated : '',
			}),
		},
		'Cả giai đoạn',
	);
	for (const [k, o] of Object.entries(numeric)) if (o.numFmt) tot.getCell(k).numFmt = o.numFmt;
	if (hasRequirement) {
		const note = ws.addRow([
			'Dòng "Cả giai đoạn": đánh giá theo tổng số tiết so với ngưỡng cộng dồn các năm; các dòng năm đánh giá theo ngưỡng riêng của năm đó.',
		]);
		ws.mergeCells(note.number, 1, note.number, cols.length);
		note.getCell(1).font = { italic: true, size: 9, color: { argb: GREY } };
		note.getCell(1).alignment = { wrapText: true, vertical: 'top' };
		note.height = 28;
	}
	addSignature(ws, cols.length);
	setupPrint(ws, true);
};

const sheetActivities = (wb, data, head) => {
	const { activities, groups } = data;
	const groupName = new Map(groups.map((g) => [g.id, g.name]));
	const cols = [
		...ident,
		{ key: 'source', header: 'Nguồn', width: 16 },
		{ key: 'group', header: 'Hình thức CME', width: 24 },
		{ key: 'category', header: 'Danh mục', width: 22 },
		{ key: 'title', header: 'Tên hoạt động', width: 38 },
		{ key: 'role', header: 'Vai trò', width: 14 },
		{ key: 'time', header: 'Thời gian', width: 22 },
		{ key: 'year', header: 'Năm', width: 8 },
		{ key: 'credits', header: 'Số tiết', width: 10 },
		{ key: 'cert', header: 'Số GCN', width: 10 },
	];
	const total = round2(activities.reduce((t, a) => t + a.credits, 0));
	const ws = xl.buildSheet(wb, {
		sheetName: 'DS hoạt động',
		letterhead: true,
		title: 'DANH SÁCH HOẠT ĐỘNG ĐƯỢC TÍNH TÍN CHỈ CME',
		subtitle: `${activities.length} lượt · ${total} tiết · ${head.subtitle}`,
		columns: cols,
	});
	const first = ws.headRow + 1;
	activities.forEach((a, i) => {
		ws.addRow({
			...identOf(a.person, i),
			source: a.source,
			group: groupName.get(a.group_id) ?? '',
			category: a.category_name ?? '',
			title: a.title,
			role: PARTICIPATION_LABELS[a.role] ?? a.role ?? '',
			time: fmtRange(a.from_date, a.to_date),
			year: a.year,
			credits: a.credits,
			cert: a.cert_no ?? '',
		});
	});
	xl.styleBody(ws);
	alignCols(ws, first, {
		tt: { h: 'center' },
		mnv: { h: 'center' },
		time: { h: 'center' },
		year: { h: 'center' },
		credits: { h: 'right', numFmt: NUM },
		cert: { h: 'center' },
	});
	// Không có dòng tổng (tổng ở dòng mô tả) để lọc/sắp xếp bằng AutoFilter không lẫn dòng tổng
	if (activities.length) addFilter(ws, ws.rowCount);
	setupPrint(ws, true);
};

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
