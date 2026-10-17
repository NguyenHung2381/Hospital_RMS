/**
 * cmeReportService.js — Báo cáo tín chỉ CME (Excel), dựa theo mẫu "mẫu bc CME.xlsx":
 *   Sheet "Tổng quan"     : chỉ tiêu tổng hợp + cơ cấu theo hình thức CME
 *   Sheet "BC tổng"       : TT | MNV | Họ và tên | Khoa/Phòng | Tổng số tiết (| Ngưỡng | Đánh giá)
 *   Sheet "BC chi tiết"   : TT | MNV | Họ và tên | Khoa/Phòng | <từng nhóm hình thức CME> | Tổng
 *   Sheet "Theo khoa"     : tổng hợp theo khoa/phòng
 *   Sheet "Chưa đạt"      : nhân sự chưa đủ ngưỡng (chỉ khi lọc 1 năm và năm đó có cấu hình ngưỡng)
 *   Sheet "DS hoạt động"  : từng hoạt động được tính tín chỉ
 * Phiếu CME cá nhân (personal) chỉ gồm BC tổng, BC chi tiết, DS hoạt động.
 * Cộng dồn 2 nguồn giống cmeRequirementService.getComplianceReport: tham dự hội
 * thảo đã cấp CME (seminar_participants.cme_year) + ghi nhận độc lập đã duyệt.
 * Dùng cho file xuất trang Ghi nhận CME (toàn viện) và phiếu CME cá nhân (userId).
 */
const ExcelJS = require('exceljs');
const { getPool, sql } = require('../../config/db');
const xl = require('../../utils/excelTemplate');
const { isDeptAccountSql } = require('../../utils/deptAccount');

// Tín chỉ hội thảo/hội nghị thuộc nhóm "Khóa đào tạo, bồi dưỡng ngắn hạn, hội nghị, hội thảo"
const SEMINAR_GROUP = { id: 'CME_DAOTAO', name: 'Khóa đào tạo, bồi dưỡng ngắn hạn, hội nghị, hội thảo về y khoa' };
const NO_GROUP = { id: '__none__', name: 'Chưa phân loại' };
const NO_DEPT = '(Chưa có khoa/phòng)';

const PARTICIPATION_LABELS = {
	attendee: 'Đại biểu',
	speaker: 'Báo cáo viên',
	chair: 'Chủ tọa',
	organizer: 'Ban tổ chức',
	trainee: 'Học viên',
};

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// Liệt kê mọi nhân sự đang hoạt động (kể cả 0 tiết) + người đã nghỉ nhưng có tín chỉ,
// trừ tài khoản khoa/phòng (trừ khi xuất phiếu cá nhân theo userId).
// year rỗng = mọi năm. department = tên khoa/phòng (khớp bộ lọc trang Ghi nhận CME).
const getData = async ({ year, userId, department, search } = {}) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('year', sql.Int, year ? Number(year) : null)
		.input('uid', sql.VarChar(20), userId || null)
		.input('dept', sql.NVarChar(255), department || null).query(`
    SELECT id, name FROM cme_credit_groups ORDER BY sort_order, name;

    SELECT u.id, u.staff_number, u.full_name, u.is_active, u.department_id, d.name AS department_name,
           x.group_id, SUM(x.credits) AS credits
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN (
      SELECT p.user_id, '${SEMINAR_GROUP.id}' AS group_id, p.cme_credits AS credits
      FROM seminar_participants p
      WHERE p.cme_year IS NOT NULL AND (@year IS NULL OR p.cme_year = @year) AND ISNULL(p.cme_credits, 0) > 0
      UNION ALL
      SELECT r.user_id, c.group_id, r.credits
      FROM cme_records r
      LEFT JOIN cme_credit_categories c ON c.id = r.category_id
      WHERE r.approval_status = 'approved' AND (@year IS NULL OR r.year = @year)
    ) x ON x.user_id = u.id
    WHERE (@uid IS NULL OR u.id = @uid) AND (@dept IS NULL OR d.name = @dept)
      AND (u.is_active = 1 OR x.user_id IS NOT NULL OR @uid IS NOT NULL)
      -- Bỏ tài khoản khoa/phòng: tài khoản dùng chung, không phải nhân sự
      AND (@uid IS NOT NULL OR NOT ${isDeptAccountSql('u')})
    GROUP BY u.id, u.staff_number, u.full_name, u.is_active, u.department_id, d.name, x.group_id
    ORDER BY d.name, u.full_name;

    SELECT x.*
    FROM (
      SELECT p.user_id, N'Hội thảo/Hội nghị' AS source, '${SEMINAR_GROUP.id}' AS group_id, NULL AS category_name,
             s.title, p.participation_type AS role, s.start_date AS from_date, s.end_date AS to_date,
             p.cme_year AS year, p.cme_credits AS credits, p.cme_certificate_no AS cert_no
      FROM seminar_participants p
      JOIN seminars s ON s.id = p.seminar_id
      WHERE p.cme_year IS NOT NULL AND (@year IS NULL OR p.cme_year = @year) AND ISNULL(p.cme_credits, 0) > 0
      UNION ALL
      SELECT r.user_id, N'Ghi nhận độc lập', c.group_id, c.name,
             r.title, r.role, r.activity_date, r.end_date, r.year, r.credits, NULL
      FROM cme_records r
      LEFT JOIN cme_credit_categories c ON c.id = r.category_id
      WHERE r.approval_status = 'approved' AND (@year IS NULL OR r.year = @year)
    ) x
    WHERE (@uid IS NULL OR x.user_id = @uid)
    ORDER BY x.from_date, x.title;

    SELECT department_id, required_credits FROM cme_requirements WHERE year = @year;
  `);
	const [groupRows, creditRows, activityRows, reqRows] = r.recordsets;

	// Ngưỡng của năm: ưu tiên theo khoa/phòng, không có thì dùng ngưỡng toàn viện
	const reqByDept = new Map(reqRows.map((x) => [x.department_id ?? null, Number(x.required_credits)]));
	const requiredOf = (deptId) => (reqByDept.has(deptId) ? reqByDept.get(deptId) : (reqByDept.get(null) ?? null));

	const q = String(search || '').trim().toLowerCase();
	const people = new Map();
	for (const row of creditRows) {
		if (q && !row.full_name.toLowerCase().includes(q) && !String(row.staff_number ?? '').includes(q)) continue;
		const p = people.get(row.id) ?? {
			id: row.id,
			staff_number: row.staff_number,
			full_name: row.full_name,
			is_active: !!row.is_active,
			department_name: row.department_name,
			// Chỉ đánh giá đạt/chưa đạt cho nhân sự đang làm việc (như getComplianceReport)
			required: row.is_active ? requiredOf(row.department_id) : null,
			by_group: {},
			total: 0,
			activities: 0,
		};
		people.set(row.id, p);
		if (row.credits == null) continue; // nhân sự chưa có tín chỉ → dòng 0 tiết
		const gid = row.group_id ?? NO_GROUP.id;
		p.by_group[gid] = round2((p.by_group[gid] ?? 0) + Number(row.credits));
		p.total = round2(p.total + Number(row.credits));
	}

	// Hoạt động: chỉ của nhân sự có trong báo cáo (đã qua lọc khoa / từ khoá / tài khoản khoa)
	const activities = [];
	for (const a of activityRows) {
		const p = people.get(a.user_id);
		if (!p) continue;
		p.activities++;
		activities.push({ ...a, group_id: a.group_id ?? NO_GROUP.id, person: p, credits: round2(a.credits) });
	}
	const deptKey = (p) => p.department_name ?? NO_DEPT;
	activities.sort(
		(a, b) =>
			deptKey(a.person).localeCompare(deptKey(b.person), 'vi') ||
			a.person.full_name.localeCompare(b.person.full_name, 'vi') ||
			(a.from_date?.getTime?.() ?? 0) - (b.from_date?.getTime?.() ?? 0),
	);

	// Cột hình thức = danh mục nhóm; thêm cột phụ nếu dữ liệu rơi vào nhóm không có trong danh mục
	const groups = [...groupRows];
	const used = new Set([...people.values()].flatMap((p) => Object.keys(p.by_group)));
	if (used.has(SEMINAR_GROUP.id) && !groups.some((g) => g.id === SEMINAR_GROUP.id)) groups.unshift(SEMINAR_GROUP);
	if (used.has(NO_GROUP.id)) groups.push(NO_GROUP);

	return {
		year: year ? Number(year) : null,
		groups,
		people: [...people.values()],
		activities,
		hasRequirement: !!year && reqRows.length > 0,
	};
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
const SECTION_FILL = fill('FFF1F5F9');
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
	block(start, mid + 1, nCols, `Nghệ An, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`, {
		italic: true,
	});
	block(start + 1, 1, mid, 'NGƯỜI LẬP BIỂU', { bold: true });
	block(start + 1, mid + 1, nCols, 'THỦ TRƯỞNG ĐƠN VỊ', { bold: true });
	block(start + 2, 1, mid, '(Ký, ghi rõ họ tên)', { italic: true, color: { argb: GREY } });
	block(start + 2, mid + 1, nCols, '(Ký, đóng dấu)', { italic: true, color: { argb: GREY } });
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

const byDepartment = (people) => {
	const map = new Map();
	for (const p of people) {
		const k = p.department_name ?? NO_DEPT;
		if (!map.has(k)) map.set(k, []);
		map.get(k).push(p);
	}
	return [...map.entries()]
		.sort(([a], [b]) => (a === NO_DEPT) - (b === NO_DEPT) || a.localeCompare(b, 'vi'))
		.map(([name, list]) => ({ name, ...summarize(list) }));
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
	const { people, groups, activities, hasRequirement, year } = data;
	const s = summarize(people);
	const cols = [
		{ key: 'a', header: 'Chỉ tiêu', width: 52 },
		{ key: 'b', header: 'Số lượng', width: 16 },
		{ key: 'c', header: 'Tỷ lệ', width: 16 },
		{ key: 'd', header: 'Ghi chú', width: 34 },
	];
	const ws = xl.buildSheet(wb, { sheetName: 'Tổng quan', letterhead: true, ...head, columns: cols });
	const rows = [
		['Năm báo cáo', year ?? 'Tất cả các năm'],
		['Tổng số nhân sự trong báo cáo', s.n, null, 'Không gồm tài khoản dùng chung của khoa/phòng'],
		['Nhân sự đã có tín chỉ CME', s.withCredits, s.n ? s.withCredits / s.n : null],
		['Nhân sự chưa có tín chỉ (0 tiết)', s.zero, s.n ? s.zero / s.n : null],
		['Tổng số tiết CME', s.total],
		['Bình quân số tiết / nhân sự', s.avg],
		['Số tiết cao nhất của một nhân sự', s.max],
		['Tổng số lượt hoạt động được tính tín chỉ', activities.length],
		...(hasRequirement
			? [
					['Nhân sự được đánh giá theo ngưỡng', s.evaluated, null, 'Nhân sự đang làm việc, khoa có ngưỡng áp dụng'],
					['Đạt ngưỡng tín chỉ', s.passed, s.evaluated ? s.passed / s.evaluated : null],
					['Chưa đạt ngưỡng tín chỉ', s.failed, s.evaluated ? s.failed / s.evaluated : null, 'Xem sheet "Chưa đạt"'],
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
	setupPrint(ws);
};

const sheetSummary = (wb, data, head) => {
	const { people, hasRequirement } = data;
	const cols = [
		...ident,
		{ key: 'total', header: 'Tổng số tiết', width: 14 },
		...(hasRequirement
			? [
					{ key: 'required', header: 'Ngưỡng', width: 10 },
					{ key: 'result', header: 'Đánh giá', width: 12 },
				]
			: []),
	];
	const ws = xl.buildSheet(wb, { sheetName: 'BC tổng', letterhead: true, ...head, columns: cols });
	const first = ws.headRow + 1;
	people.forEach((p, i) => {
		const row = ws.addRow({
			...identOf(p, i),
			total: p.total,
			...(hasRequirement && {
				required: p.required ?? '',
				result: p.required == null ? '' : p.total >= p.required ? 'Đạt' : 'Chưa đạt',
			}),
		});
		if (p.total === 0) row.getCell('total').fill = WARN_FILL;
		if (hasRequirement && p.required != null) {
			row.getCell('result').font = { bold: true, color: { argb: p.total >= p.required ? GREEN : RED } };
		}
	});
	xl.styleBody(ws);
	alignCols(ws, first, {
		tt: { h: 'center' },
		mnv: { h: 'center' },
		total: { h: 'right', numFmt: NUM },
		...(hasRequirement && { required: { h: 'right', numFmt: NUM }, result: { h: 'center' } }),
	});
	const last = ws.rowCount;
	const totalCol = xl.colLetter(ident.length + 1);
	const tot = addTotalRow(ws, ident.length, {
		total: people.length
			? { formula: `SUM(${totalCol}${first}:${totalCol}${last})`, result: summarize(people).total }
			: 0,
	});
	tot.getCell('total').numFmt = NUM;
	addSignature(ws, cols.length);
	setupPrint(ws);
};

const sheetDetail = (wb, data, head) => {
	const { people, groups } = data;
	const groupCols = groups.map((g) => ({ key: g.id, header: g.name, width: 18 }));
	const cols = [...ident, ...groupCols, { key: 'total', header: 'Tổng', width: 12 }];
	const ws = xl.buildSheet(wb, { sheetName: 'BC chi tiết', letterhead: true, ...head, columns: cols });
	ws.getRow(ws.headRow).height = 75;
	const first = ws.headRow + 1;
	const g1 = xl.colLetter(ident.length + 1);
	const g2 = xl.colLetter(ident.length + groupCols.length);
	people.forEach((p, i) => {
		const row = ws.addRow({
			...identOf(p, i),
			...Object.fromEntries(groups.map((g) => [g.id, p.by_group[g.id] ?? 0])),
		});
		// Tổng là công thức như mẫu (sửa số từng hình thức thì tự cộng lại), kèm sẵn kết quả
		row.getCell('total').value = groups.length
			? { formula: `SUM(${g1}${row.number}:${g2}${row.number})`, result: p.total }
			: p.total;
	});
	xl.styleBody(ws);
	alignCols(ws, first, {
		tt: { h: 'center' },
		mnv: { h: 'center' },
		...Object.fromEntries(groups.map((g) => [g.id, { h: 'right', numFmt: NUM_DASH }])),
		total: { h: 'right', numFmt: NUM },
	});
	for (let r = first; r <= ws.rowCount; r++) ws.getRow(r).getCell('total').font = { bold: true };

	const last = ws.rowCount;
	const sumOf = (key, idx, result) => ({
		[key]: people.length
			? { formula: `SUM(${xl.colLetter(idx)}${first}:${xl.colLetter(idx)}${last})`, result }
			: 0,
	});
	const tot = addTotalRow(ws, ident.length, {
		...Object.assign(
			{},
			...groups.map((g, i) =>
				sumOf(g.id, ident.length + 1 + i, round2(people.reduce((t, p) => t + (p.by_group[g.id] ?? 0), 0))),
			),
		),
		...sumOf('total', cols.length, summarize(people).total),
	});
	for (let c = ident.length + 1; c <= cols.length; c++) tot.getCell(c).numFmt = NUM;
	addSignature(ws, cols.length);
	setupPrint(ws, true);
};

const sheetDepartments = (wb, data, head) => {
	const { people, hasRequirement } = data;
	const cols = [
		{ key: 'tt', header: 'TT', width: 6 },
		{ key: 'name', header: 'Khoa/Phòng', width: 36 },
		{ key: 'n', header: 'Số nhân sự', width: 11 },
		{ key: 'with', header: 'Đã có tín chỉ', width: 11 },
		{ key: 'zero', header: 'Chưa có tín chỉ', width: 11 },
		{ key: 'total', header: 'Tổng số tiết', width: 13 },
		{ key: 'avg', header: 'Bình quân tiết/người', width: 13 },
		...(hasRequirement
			? [
					{ key: 'passed', header: 'Đạt ngưỡng', width: 11 },
					{ key: 'failed', header: 'Chưa đạt', width: 11 },
					{ key: 'rate', header: 'Tỷ lệ đạt', width: 11 },
				]
			: []),
	];
	const ws = xl.buildSheet(wb, { sheetName: 'Theo khoa', letterhead: true, ...head, columns: cols });
	const first = ws.headRow + 1;
	const valuesOf = (d) => ({
		n: d.n,
		with: d.withCredits,
		zero: d.zero,
		total: d.total,
		avg: d.avg,
		...(hasRequirement && {
			passed: d.passed,
			failed: d.failed,
			rate: d.evaluated ? d.passed / d.evaluated : '',
		}),
	});
	byDepartment(people).forEach((d, i) => {
		const row = ws.addRow({ tt: i + 1, name: d.name, ...valuesOf(d) });
		if (hasRequirement && d.failed > 0) row.getCell('failed').font = { bold: true, color: { argb: RED } };
	});
	xl.styleBody(ws);
	const numeric = {
		n: { h: 'right' },
		with: { h: 'right' },
		zero: { h: 'right' },
		total: { h: 'right', numFmt: NUM },
		avg: { h: 'right', numFmt: NUM },
		...(hasRequirement && { passed: { h: 'right' }, failed: { h: 'right' }, rate: { h: 'right', numFmt: PCT } }),
	};
	alignCols(ws, first, { tt: { h: 'center' }, ...numeric });
	const tot = addTotalRow(ws, 2, valuesOf(summarize(people)), 'Toàn viện');
	for (const [k, o] of Object.entries(numeric)) if (o.numFmt) tot.getCell(k).numFmt = o.numFmt;
	addSignature(ws, cols.length);
	setupPrint(ws, hasRequirement);
};

const sheetFailed = (wb, data, head) => {
	const evaluated = data.people.filter((p) => p.required != null);
	const failed = evaluated.filter((p) => p.total < p.required);
	const cols = [
		...ident,
		{ key: 'required', header: 'Ngưỡng', width: 10 },
		{ key: 'total', header: 'Đã đạt', width: 10 },
		{ key: 'missing', header: 'Còn thiếu', width: 11 },
	];
	const ws = xl.buildSheet(wb, {
		sheetName: 'Chưa đạt',
		letterhead: true,
		title: `DANH SÁCH NHÂN SỰ CHƯA ĐẠT NGƯỠNG TÍN CHỈ CME NĂM ${data.year}`,
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
			required: p.required,
			total: p.total,
			missing: round2(p.required - p.total),
		});
		row.getCell('missing').font = { bold: true, color: { argb: RED } };
	});
	if (failed.length) {
		xl.styleBody(ws);
		alignCols(ws, first, {
			tt: { h: 'center' },
			mnv: { h: 'center' },
			required: { h: 'right', numFmt: NUM },
			total: { h: 'right', numFmt: NUM },
			missing: { h: 'right', numFmt: NUM },
		});
	}
	addSignature(ws, cols.length);
	setupPrint(ws);
};

const sheetActivities = (wb, data, head) => {
	const { activities, groups } = data;
	const groupName = new Map(groups.map((g) => [g.id, g.name]));
	const cols = [
		...ident,
		{ key: 'source', header: 'Nguồn', width: 16 },
		{ key: 'group', header: 'Hình thức CME', width: 24 },
		{ key: 'category', header: 'Danh mục', width: 22 },
		{ key: 'title', header: 'Nội dung hoạt động', width: 38 },
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
	if (activities.length) ws.autoFilter = { from: { row: ws.headRow, column: 1 }, to: { row: ws.headRow, column: cols.length } };
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
	if (!personal) {
		sheetDepartments(wb, data, { ...head, title: `${title} THEO KHOA/PHÒNG` });
		if (data.hasRequirement) sheetFailed(wb, data, head);
	}
	sheetActivities(wb, data, head);
	return wb;
};

module.exports = { getData, buildWorkbook };
