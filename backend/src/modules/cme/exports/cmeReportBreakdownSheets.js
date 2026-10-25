// Sheet phân tích của báo cáo CME: Theo khoa, Chưa đạt, Theo năm, DS hoạt động (cmeReportWorkbook.js).
const xl = require('../../../utils/excelTemplate');
const { round2 } = require('../cmeReportService');
const {
	PARTICIPATION_LABELS,
	NUM,
	NUM_DASH,
	PCT,
	GREEN,
	RED,
	GREY,
	fmtRange,
	alignCols,
	addTotalRow,
	addSignature,
	fitHeadRow,
	groupColsOf,
	addFilter,
	setupPrint,
	summarize,
	summarizeYear,
	yearKey,
	yearColsOf,
	yearValuesOf,
	byDepartment,
	ident,
	identOf,
} = require('./cmeReportLayout');

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

module.exports = {
	sheetDepartments,
	sheetFailed,
	sheetYears,
	sheetActivities,
};
