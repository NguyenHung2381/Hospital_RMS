/**
 * topicFullExportController.js — POST /api/v1/topics/export-report
 *
 * Body:
 *   ids          string[]   — topic IDs to include
 *   fileName     string     — base file name (no extension)
 *   title        string     — main report title
 *   subtitle     string     — subtitle (italic)
 *   refNumber    string     — reference number
 *   refDate      string     — reference date
 *   sections     string[]   — which sheets to include:
 *                             'overview' | 'topics' | 'members' | 'by_category'
 *                             | 'by_department' | 'by_specialty_group'
 *
 * Sheets produced (in order):
 *   1. "Tổng quan"          — stats: by status, category, level, department
 *   2. "Danh sách đề tài"   — full topic list with merged member rows
 *   3. "Thành viên"         — flat cross-reference of all members
 *   4+. One sheet per distinct category (if 'by_category' requested)
 *   +.  One sheet per khoa/phòng (if 'by_department' requested)
 *   +.  One sheet per hệ chuyên môn (if 'by_specialty_group' requested)
 */

const ExcelJS = require('exceljs');
const topicService = require('../services/topicService');
const { fnt, al, sf, bAll } = require('../utils/excelStyle');

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
	hdrDark: 'FF1B2A4A',
	hdrBlue: 'FF1F4E79',
	accent: 'FF4472C4',
	subBlue: 'FF2E75B6',
	rowA: 'FFEBF3FB',
	rowB: 'FFF7FBFF',
	totalBg: 'FFD9E1F2',
	totalTxt: 'FF1F3864',
	colHdr: 'FFD9E1F2',
	statBg: 'FFEFF8FF',
	white: 'FFFFFFFF',
	green: 'FFE2EFDA',
	greenTxt: 'FF375623',
	red: 'FFFCE4D6',
	redTxt: 'FFC00000',
	amber: 'FFFFF3CD',
	amberTxt: 'FF856404',
	gray: 'FFF2F2F2',
};

const STATUS_LABELS = {
	submitted: 'Chờ duyệt',
	approved: 'Đã phê duyệt',
	rejected: 'Từ chối',
	supplement: 'Bổ sung',
	cancelled: 'Đã hủy',
};
const STATUS_ORDER = [
	'approved',
	'submitted',
	'rejected',
	'supplement',
	'cancelled',
];
const ROLE_LABELS = {
	leader: 'Chủ nhiệm',
	secretary: 'Thư ký',
	member: 'Thành viên',
};

// ── Style helpers ─────────────────────────────────────────────────────────────
const bMedium = {
	top: { style: 'medium', color: { argb: 'FF000000' } },
	left: { style: 'medium', color: { argb: 'FF000000' } },
	bottom: { style: 'medium', color: { argb: 'FF000000' } },
	right: { style: 'medium', color: { argb: 'FF000000' } },
};

function fmtDate(iso) {
	if (!iso) return '';
	const d = new Date(iso);
	if (isNaN(d.getTime())) return '';
	return d.toLocaleDateString('vi-VN', {
		timeZone: 'Asia/Ho_Chi_Minh',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	});
}

// ── Letterhead rows 1–3 ───────────────────────────────────────────────────────
function writeLetterhead(ws, { refNumber, refDate, lastCol }) {
	const lc = lastCol || 'J';
	const rows = [
		[
			1,
			`A1:D1`,
			'SỞ Y TẾ NGHỆ AN',
			fnt({ size: 11 }),
			`F1:${lc}1`,
			'CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM',
			fnt({ bold: true, size: 11 }),
			18,
		],
		[
			2,
			`A2:D2`,
			'BỆNH VIỆN HNĐK NGHỆ AN',
			fnt({ bold: true, size: 11 }),
			`F2:${lc}2`,
			'Độc lập - Tự do - Hạnh phúc',
			fnt({ italic: true, size: 11 }),
			18,
		],
		[
			3,
			`A3:D3`,
			refNumber ? `Số: ${refNumber}/TB-BV` : '',
			fnt({ size: 10 }),
			`F3:${lc}3`,
			refDate ? `Nghệ An, ngày ${refDate}` : '',
			fnt({ italic: true, size: 10 }),
			16,
		],
	];
	for (const [, lr, lv, lf, rr, rv, rf, h] of rows) {
		ws.mergeCells(lr);
		Object.assign(ws.getCell(lr.split(':')[0]), {
			value: lv,
			font: lf,
			alignment: al('center', false),
		});
		ws.mergeCells(rr);
		Object.assign(ws.getCell(rr.split(':')[0]), {
			value: rv,
			font: rf,
			alignment: al('center', false),
		});
		ws.getRow(rows.indexOf(rows.find((r) => r[0] === h)) + 1); // just height
	}
	rows.forEach(([rowNum, , , , , , , h]) => {
		ws.getRow(rowNum).height = h;
	});
	ws.getRow(4).height = 6; // spacer
}

// ── Title + Subtitle rows 5–6 ─────────────────────────────────────────────────
function writeTitleBlock(ws, { title, subtitle, lastCol, titleRow = 5 }) {
	const lc = lastCol || 'J';
	ws.mergeCells(`A${titleRow}:${lc}${titleRow}`);
	Object.assign(ws.getCell(`A${titleRow}`), {
		value: title,
		font: fnt({ bold: true, size: 13 }),
		alignment: al('center', true),
	});
	ws.getRow(titleRow).height = 36;

	ws.mergeCells(`A${titleRow + 1}:${lc}${titleRow + 1}`);
	Object.assign(ws.getCell(`A${titleRow + 1}`), {
		value: subtitle,
		font: fnt({ italic: true, size: 11 }),
		alignment: al('center', true),
	});
	ws.getRow(titleRow + 1).height = subtitle ? 22 : 10;

	ws.getRow(titleRow + 2).height = 6; // spacer
}

// ════════════════════════════════════════════════════════════════════════════════
// SHEET 1 — TỔNG QUAN
// ════════════════════════════════════════════════════════════════════════════════
function buildOverviewSheet(ws, topics, opts) {
	const { refNumber, refDate, title, subtitle } = opts;
	ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 8 }];

	writeLetterhead(ws, { refNumber, refDate, lastCol: 'H' });
	writeTitleBlock(ws, { title, subtitle, lastCol: 'H', titleRow: 5 });

	// Section header utility
	let cur = 8;
	function secHeader(label) {
		ws.mergeCells(`A${cur}:H${cur}`);
		Object.assign(ws.getCell(`A${cur}`), {
			value: label,
			font: fnt({ bold: true, size: 11, color: 'FFFFFF' }),
			fill: sf(C.hdrBlue),
			alignment: al('left', false),
		});
		ws.getRow(cur).height = 22;
		cur++;
	}

	function twoColRow(label, value, bg) {
		ws.mergeCells(`A${cur}:E${cur}`);
		Object.assign(ws.getCell(`A${cur}`), {
			value: label,
			font: fnt({ size: 10 }),
			fill: sf(bg || C.white),
			alignment: al('left', false),
			border: bAll,
		});
		ws.mergeCells(`F${cur}:H${cur}`);
		Object.assign(ws.getCell(`F${cur}`), {
			value: value,
			font: fnt({ bold: true, size: 11, color: '1F4E79' }),
			fill: sf(bg || C.statBg),
			alignment: al('center', false),
			border: bAll,
		});
		ws.getRow(cur).height = 20;
		cur++;
	}

	// ── I. Thống kê tổng quan ──────────────────────────────────────────────
	secHeader('I. THỐNG KÊ TỔNG QUAN');
	twoColRow('Tổng số đề tài', topics.length);
	for (const st of STATUS_ORDER) {
		const cnt = topics.filter((t) => t.status === st).length;
		if (cnt === 0) continue;
		const bgMap = {
			approved: C.green,
			submitted: C.amber,
			rejected: C.red,
			supplement: C.amber,
			cancelled: C.gray,
		};
		twoColRow(`    • ${STATUS_LABELS[st]}`, cnt, bgMap[st] || C.white);
	}
	cur++; // blank row

	// ── II. Theo phân loại ─────────────────────────────────────────────────
	const catMap = new Map();
	topics.forEach((t) => {
		const k = t.category_name || '(Chưa phân loại)';
		catMap.set(k, (catMap.get(k) || 0) + 1);
	});
	const catRows = [...catMap.entries()].sort((a, b) => b[1] - a[1]);

	secHeader('II. THEO PHÂN LOẠI ĐỀ TÀI');
	// sub-header
	['STT', 'Phân loại', '', '', '', 'Số đề tài', '', 'Tỷ lệ (%)'].forEach(
		(h, i) => {
			Object.assign(ws.getCell(cur, i + 1), {
				value: h,
				font: fnt({ bold: true, size: 10, color: 'FFFFFF' }),
				fill: sf(C.accent),
				alignment: al('center', true),
				border: bAll,
			});
		},
	);
	ws.mergeCells(`B${cur}:E${cur}`);
	ws.mergeCells(`F${cur}:G${cur}`);
	ws.getRow(cur).height = 20;
	cur++;

	catRows.forEach(([name, cnt], i) => {
		const bg = i % 2 === 0 ? C.rowA : C.rowB;
		const pct =
			topics.length > 0 ? ((cnt / topics.length) * 100).toFixed(1) + '%' : '0%';
		[i + 1, name, '', '', '', cnt, '', pct].forEach((v, ci) => {
			Object.assign(ws.getCell(cur, ci + 1), {
				value: v,
				font: fnt({ size: 10 }),
				fill: sf(bg),
				alignment: al(ci === 0 || ci >= 5 ? 'center' : 'left', true),
				border: bAll,
			});
		});
		ws.mergeCells(`B${cur}:E${cur}`);
		ws.mergeCells(`F${cur}:G${cur}`);
		ws.getRow(cur).height = 20;
		cur++;
	});
	cur++;

	// ── III. Theo cấp độ ───────────────────────────────────────────────────
	const lvlMap = new Map();
	topics.forEach((t) => {
		const k = t.level_name || '(Chưa xác định)';
		lvlMap.set(k, (lvlMap.get(k) || 0) + 1);
	});
	const lvlRows = [...lvlMap.entries()].sort((a, b) => b[1] - a[1]);

	secHeader('III. THEO CẤP ĐỘ');
	['STT', 'Cấp độ', '', '', '', 'Số đề tài', '', 'Tỷ lệ (%)'].forEach(
		(h, i) => {
			Object.assign(ws.getCell(cur, i + 1), {
				value: h,
				font: fnt({ bold: true, size: 10, color: 'FFFFFF' }),
				fill: sf(C.accent),
				alignment: al('center', true),
				border: bAll,
			});
		},
	);
	ws.mergeCells(`B${cur}:E${cur}`);
	ws.mergeCells(`F${cur}:G${cur}`);
	ws.getRow(cur).height = 20;
	cur++;

	lvlRows.forEach(([name, cnt], i) => {
		const bg = i % 2 === 0 ? C.rowA : C.rowB;
		const pct =
			topics.length > 0 ? ((cnt / topics.length) * 100).toFixed(1) + '%' : '0%';
		[i + 1, name, '', '', '', cnt, '', pct].forEach((v, ci) => {
			Object.assign(ws.getCell(cur, ci + 1), {
				value: v,
				font: fnt({ size: 10 }),
				fill: sf(bg),
				alignment: al(ci === 0 || ci >= 5 ? 'center' : 'left', true),
				border: bAll,
			});
		});
		ws.mergeCells(`B${cur}:E${cur}`);
		ws.mergeCells(`F${cur}:G${cur}`);
		ws.getRow(cur).height = 20;
		cur++;
	});
	cur++;

	// ── IV. Theo phòng ban ─────────────────────────────────────────────────
	const deptMap = new Map();
	topics.forEach((t) => {
		const k = t.department_name || '(Chưa phân)';
		deptMap.set(k, (deptMap.get(k) || 0) + 1);
	});
	const deptRows = [...deptMap.entries()].sort((a, b) => b[1] - a[1]);

	secHeader('IV. THEO PHÒNG BAN (TOP 20)');
	['STT', 'Phòng ban / Khoa', '', '', '', 'Số đề tài', '', 'Tỷ lệ (%)'].forEach(
		(h, i) => {
			Object.assign(ws.getCell(cur, i + 1), {
				value: h,
				font: fnt({ bold: true, size: 10, color: 'FFFFFF' }),
				fill: sf(C.accent),
				alignment: al('center', true),
				border: bAll,
			});
		},
	);
	ws.mergeCells(`B${cur}:E${cur}`);
	ws.mergeCells(`F${cur}:G${cur}`);
	ws.getRow(cur).height = 20;
	cur++;

	deptRows.slice(0, 20).forEach(([name, cnt], i) => {
		const bg = i % 2 === 0 ? C.rowA : C.rowB;
		const pct =
			topics.length > 0 ? ((cnt / topics.length) * 100).toFixed(1) + '%' : '0%';
		[i + 1, name, '', '', '', cnt, '', pct].forEach((v, ci) => {
			Object.assign(ws.getCell(cur, ci + 1), {
				value: v,
				font: fnt({ size: 10 }),
				fill: sf(bg),
				alignment: al(ci === 0 || ci >= 5 ? 'center' : 'left', true),
				border: bAll,
			});
		});
		ws.mergeCells(`B${cur}:E${cur}`);
		ws.mergeCells(`F${cur}:G${cur}`);
		ws.getRow(cur).height = 20;
		cur++;
	});

	// Footer note
	cur++;
	ws.mergeCells(`A${cur}:H${cur}`);
	Object.assign(ws.getCell(`A${cur}`), {
		value: `Xuất ngày ${new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} — Hệ thống Quản lý Nghiên cứu Khoa học`,
		font: fnt({ italic: true, size: 9, color: '888888' }),
		alignment: al('right', false),
	});

	// Column widths
	[5, 20, 8, 8, 8, 12, 5, 12].forEach((w, i) => {
		ws.getColumn(i + 1).width = w;
	});
	ws.pageSetup = {
		orientation: 'portrait',
		paperSize: 9,
		fitToPage: true,
		fitToWidth: 1,
		printTitlesRow: '1:7',
	};
}

// ════════════════════════════════════════════════════════════════════════════════
// SHEET 2 — DANH SÁCH ĐỀ TÀI (merged member rows, 12 columns)
// ════════════════════════════════════════════════════════════════════════════════
const TOPIC_COLS = [
	{ label: 'STT', w: 5, wrap: false, center: true },
	{ label: 'Mã đề tài', w: 16, wrap: false, center: true },
	{ label: 'Tên đề tài', w: 40, wrap: true, center: false },
	{ label: 'Phân loại', w: 18, wrap: false, center: true },
	{ label: 'Cấp độ', w: 12, wrap: false, center: true },
	{ label: 'Đợt NC', w: 30, wrap: true, center: false },
	{ label: 'Phòng ban', w: 34, wrap: true, center: false },
	{ label: 'Trạng thái', w: 14, wrap: false, center: true },
	{ label: 'Ngày tạo', w: 12, wrap: false, center: true },
	{ label: 'Họ và tên', w: 22, wrap: false, center: false },
	{ label: 'Chức vụ', w: 16, wrap: true, center: false },
	{ label: 'MNV', w: 9, wrap: false, center: true },
	{ label: 'Vai trò NC', w: 13, wrap: false, center: true },
];

function buildTopicListSheet(ws, topics, opts, sectionTitle) {
	ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 9 }];
	ws.properties.defaultRowHeight = 20;
	const lastCol = 'M';

	writeLetterhead(ws, {
		refNumber: opts.refNumber,
		refDate: opts.refDate,
		lastCol,
	});
	writeTitleBlock(ws, {
		title: sectionTitle || opts.title,
		subtitle: opts.subtitle,
		lastCol,
		titleRow: 5,
	});

	// Col headers (row 8)
	TOPIC_COLS.forEach((c, i) => {
		Object.assign(ws.getCell(8, i + 1), {
			value: c.label,
			font: fnt({ bold: true, size: 10, color: 'FFFFFF' }),
			fill: sf(C.hdrBlue),
			alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
			border: bAll,
		});
	});
	ws.getRow(8).height = 30;

	let curRow = 9;
	topics.forEach((topic, idx) => {
		const members = topic.members ?? [];
		const rowCount = Math.max(members.length, 1);
		const startRow = curRow;
		const endRow = curRow + rowCount - 1;
		const bg = idx % 2 === 0 ? C.rowA : C.rowB;

		const statusColor =
			{
				approved: C.green,
				submitted: C.amber,
				rejected: C.red,
				supplement: C.amber,
				cancelled: C.gray,
			}[topic.status] || C.white;

		// Cols 1–9: topic info (merge vertically)
		const topicVals = [
			{ v: idx + 1, ci: 0 },
			{ v: topic.id, ci: 1 },
			{ v: topic.title, ci: 2 },
			{ v: topic.category_name ?? '', ci: 3 },
			{ v: topic.level_name ?? '', ci: 4 },
			{ v: topic.round_name ?? '', ci: 5 },
			{ v: topic.department_name ?? '', ci: 6 },
			{
				v: STATUS_LABELS[topic.status] ?? topic.status,
				fill: statusColor,
				ci: 7,
			},
			{ v: fmtDate(topic.created_at), ci: 8 },
		];
		topicVals.forEach(({ v, fill, ci }) => {
			const col = TOPIC_COLS[ci];
			if (rowCount > 1) ws.mergeCells(startRow, ci + 1, endRow, ci + 1);
			Object.assign(ws.getCell(startRow, ci + 1), {
				value: v,
				font: fnt({ size: 9, bold: ci === 2 }),
				fill: sf(fill || bg),
				alignment: {
					horizontal: col.center ? 'center' : 'left',
					vertical: rowCount > 1 ? 'top' : 'middle',
					wrapText: col.wrap,
				},
				border: bAll,
			});
		});

		// Cols 10–13: member rows
		const memberCols = TOPIC_COLS.slice(9); // Họ và tên, Chức vụ, MNV, Vai trò NC
		for (let mi = 0; mi < rowCount; mi++) {
			const r = curRow + mi;
			const m = members[mi];
			const isFirst = mi === 0;
			const isLast = mi === rowCount - 1;
			const hairLine = { style: 'hair', color: { argb: 'FFCCCCCC' } };
			const memBorder =
				rowCount === 1
					? bAll
					: {
							top: isFirst ? bAll.top : hairLine,
							bottom: isLast ? bAll.bottom : hairLine,
							left: bAll.left,
							right: bAll.right,
						};

			[
				m?.ho_ten ?? '',
				m?.chuc_vu ?? '',
				m?.staff_number != null ? String(m.staff_number) : '',
				m ? (ROLE_LABELS[m.role] ?? m.role ?? '') : '',
			].forEach((v, ci) => {
				const col = memberCols[ci];
				Object.assign(ws.getCell(r, 10 + ci), {
					value: v,
					font: fnt({ size: 9, bold: m?.role === 'leader' && ci === 0 }),
					fill: sf(bg),
					alignment: {
						horizontal: col.center ? 'center' : 'left',
						vertical: 'middle',
						wrapText: col.wrap,
					},
					border: memBorder,
				});
			});
			ws.getRow(r).height = 20;
		}

		curRow += rowCount;
	});

	// Total row
	ws.mergeCells(`A${curRow}:I${curRow}`);
	Object.assign(ws.getCell(`A${curRow}`), {
		value: `Tổng cộng: ${topics.length} đề tài — ${topics.reduce((s, t) => s + (t.members?.length ?? 0), 0)} thành viên`,
		font: fnt({ bold: true, size: 10, color: '1F3864' }),
		fill: sf(C.totalBg),
		alignment: al('center', false),
		border: bAll,
	});
	ws.mergeCells(`J${curRow}:M${curRow}`);
	Object.assign(ws.getCell(`J${curRow}`), {
		fill: sf(C.totalBg),
		border: bAll,
	});
	ws.getRow(curRow).height = 22;

	TOPIC_COLS.forEach((c, i) => {
		ws.getColumn(i + 1).width = c.w;
	});
	ws.pageSetup = {
		orientation: 'landscape',
		paperSize: 9,
		fitToPage: true,
		fitToWidth: 1,
		printTitlesRow: '1:8',
	};
}

// ════════════════════════════════════════════════════════════════════════════════
// SHEET 3 — THÀNH VIÊN (flat list)
// ════════════════════════════════════════════════════════════════════════════════
function buildMembersSheet(ws, topics, opts) {
	ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 9 }];
	ws.properties.defaultRowHeight = 20;
	const lastCol = 'L';

	writeLetterhead(ws, {
		refNumber: opts.refNumber,
		refDate: opts.refDate,
		lastCol,
	});
	writeTitleBlock(ws, {
		title: 'DANH SÁCH THÀNH VIÊN THAM GIA NGHIÊN CỨU KHOA HỌC',
		subtitle: opts.subtitle,
		lastCol,
		titleRow: 5,
	});

	const MCOLS = [
		{ label: 'STT', w: 5 },
		{ label: 'Mã ĐT', w: 16 },
		{ label: 'Tên đề tài', w: 38 },
		{ label: 'Phòng ban', w: 34 },
		{ label: 'Họ và tên', w: 22 },
		{ label: 'MNV', w: 9 },
		{ label: 'Chức vụ', w: 16 },
		{ label: 'Vai trò NC', w: 13 },
		{ label: 'Email', w: 28 },
		{ label: 'SĐT', w: 13 },
		{ label: 'Phân loại', w: 18 },
		{ label: 'Trạng thái', w: 14 },
	];

	MCOLS.forEach((c, i) => {
		Object.assign(ws.getCell(8, i + 1), {
			value: c.label,
			font: fnt({ bold: true, size: 10, color: 'FFFFFF' }),
			fill: sf(C.hdrBlue),
			alignment: al('center', true),
			border: bAll,
		});
	});
	ws.getRow(8).height = 28;

	let stt = 1;
	let curRow = 9;
	topics.forEach((topic, ti) => {
		const members = topic.members ?? [];
		if (members.length === 0) {
			// topic with no members — still list it
			const bg = ti % 2 === 0 ? C.rowA : C.rowB;
			[
				stt++,
				topic.id,
				topic.title,
				topic.department_name ?? '',
				'(Chưa có thành viên)',
				'',
				'',
				'',
				'',
				'',
				topic.category_name ?? '',
				STATUS_LABELS[topic.status] ?? topic.status,
			].forEach((v, i) => {
				Object.assign(ws.getCell(curRow, i + 1), {
					value: v,
					font: fnt({ size: 9, italic: i === 4 }),
					fill: sf(bg),
					alignment: al(i === 0 ? 'center' : 'left', false),
					border: bAll,
				});
			});
			ws.getRow(curRow).height = 20;
			curRow++;
			return;
		}
		members.forEach((m, mi) => {
			const bg = ti % 2 === 0 ? C.rowA : C.rowB;
			[
				stt++,
				topic.id,
				topic.title,
				topic.department_name ?? '',
				m.ho_ten ?? '',
				m.staff_number ?? '',
				m.chuc_vu ?? '',
				ROLE_LABELS[m.role] ?? m.role ?? '',
				m.email ?? '',
				m.so_dien_thoai ?? '',
				topic.category_name ?? '',
				STATUS_LABELS[topic.status] ?? topic.status,
			].forEach((v, i) => {
				Object.assign(ws.getCell(curRow, i + 1), {
					value: v,
					font: fnt({ size: 9, bold: i === 4 && m.role === 'leader' }),
					fill: sf(bg),
					alignment: al(i === 0 ? 'center' : 'left', false),
					border: bAll,
				});
			});
			ws.getRow(curRow).height = 20;
			curRow++;
		});
	});

	// Total
	const totalMembers = topics.reduce((s, t) => s + (t.members?.length ?? 0), 0);
	ws.mergeCells(`A${curRow}:L${curRow}`);
	Object.assign(ws.getCell(`A${curRow}`), {
		value: `Tổng cộng: ${totalMembers} thành viên từ ${topics.length} đề tài`,
		font: fnt({ bold: true, size: 10, color: '1F3864' }),
		fill: sf(C.totalBg),
		alignment: al('center', false),
		border: bAll,
	});
	ws.getRow(curRow).height = 22;

	MCOLS.forEach((c, i) => {
		ws.getColumn(i + 1).width = c.w;
	});
	ws.pageSetup = {
		orientation: 'landscape',
		paperSize: 9,
		fitToPage: true,
		fitToWidth: 1,
		printTitlesRow: '1:8',
	};
}

// ════════════════════════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════════════════════════
async function exportReport(req, res, next) {
	try {
		const {
			ids,
			fileName = 'bao-cao-nckh',
			title = 'BÁO CÁO TỔNG KẾT NGHIÊN CỨU KHOA HỌC',
			subtitle = '',
			refNumber = '',
			refDate = '',
			sections = ['overview', 'topics', 'members', 'by_category'],
		} = req.body;

		if (!Array.isArray(ids) || ids.length === 0) {
			return res
				.status(400)
				.json({ success: false, message: 'Danh sách đề tài trống' });
		}

		const data = await topicService.getForExport(ids);
		if (!data.length) {
			return res
				.status(404)
				.json({ success: false, message: 'Không tìm thấy đề tài' });
		}

		const wb = new ExcelJS.Workbook();
		wb.creator = 'RMS Hospital';
		wb.created = new Date();

		const opts = { title, subtitle, refNumber, refDate };

		if (sections.includes('overview')) {
			buildOverviewSheet(wb.addWorksheet('Tổng quan'), data, opts);
		}

		if (sections.includes('topics')) {
			buildTopicListSheet(
				wb.addWorksheet('Danh sách đề tài'),
				data,
				opts,
				title,
			);
		}

		if (sections.includes('members')) {
			buildMembersSheet(wb.addWorksheet('Thành viên'), data, opts);
		}

		// One sheet per distinct value of keyFn(topic) — used for by_category /
		// by_department / by_specialty_group, which all group the same topic list.
		const addGroupedSheets = (keyFn, fallbackLabel) => {
			const groups = new Map();
			data.forEach((t) => {
				const k = keyFn(t) || fallbackLabel;
				if (!groups.has(k)) groups.set(k, []);
				groups.get(k).push(t);
			});
			const used = new Set(wb.worksheets.map((ws) => ws.name));
			groups.forEach((groupTopics, groupName) => {
				let sheetName = groupName.replace(/[\\/*?[\]:]/g, '').slice(0, 31) || fallbackLabel;
				let i = 2;
				while (used.has(sheetName)) {
					const suffix = ` (${i++})`;
					sheetName = sheetName.slice(0, 31 - suffix.length) + suffix;
				}
				used.add(sheetName);
				const ws = wb.addWorksheet(sheetName);
				buildTopicListSheet(ws, groupTopics, opts, `${title} — ${groupName}`);
			});
		};

		if (sections.includes('by_category')) {
			addGroupedSheets((t) => t.category_name, 'Chưa phân loại');
		}

		if (sections.includes('by_department')) {
			addGroupedSheets((t) => t.department_name, 'Chưa phân');
		}

		if (sections.includes('by_specialty_group')) {
			addGroupedSheets((t) => t.specialty_group, 'Chưa xác định');
		}

		// Ensure at least one sheet
		if (wb.worksheets.length === 0) {
			buildTopicListSheet(
				wb.addWorksheet('Danh sách đề tài'),
				data,
				opts,
				title,
			);
		}

		const safeName =
			(fileName || 'bao-cao-nckh').replace(/[/\\?%*:|"<>]/g, '').trim() ||
			'bao-cao-nckh';

		res.setHeader(
			'Content-Type',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		);
		res.setHeader(
			'Content-Disposition',
			`attachment; filename*=UTF-8''${encodeURIComponent(safeName + '.xlsx')}`,
		);
		await wb.xlsx.write(res);
		res.end();
	} catch (err) {
		next(err);
	}
}

module.exports = { exportReport };
