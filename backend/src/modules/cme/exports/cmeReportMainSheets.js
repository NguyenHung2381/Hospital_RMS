// Sheet chính của báo cáo CME: Tổng quan, BC tổng, BC chi tiết / Năm <yyyy> (cmeReportWorkbook.js).
const xl = require('../../../utils/excelTemplate');
const { round2 } = require('../cmeReportService');
const {
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
} = require('./cmeReportLayout');

// ── Các sheet ────────────────────────────────────────────────────────────────

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

module.exports = {
	sheetOverview,
	sheetSummary,
	sheetDetail,
};
