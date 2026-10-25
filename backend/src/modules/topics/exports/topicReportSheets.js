// Sheet Tổng quan + Danh sách đề tài của báo cáo đề tài (topicReportWorkbook.js).
const { fnt, al, sf, bAll } = require('../../../utils/excelStyle');
const {
	C,
	STATUS_LABELS,
	STATUS_ORDER,
	ROLE_LABELS,
	fmtDate,
	writeLetterhead,
	writeTitleBlock,
} = require('./topicReportLayout');

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

	// ── II–IV. Đếm đề tài theo nhóm (bảng STT / tên / số đề tài / tỷ lệ) ───
	const countSection = (title, label, keyOf, limit = Infinity) => {
		const counts = new Map();
		topics.forEach((t) => {
			const k = keyOf(t);
			counts.set(k, (counts.get(k) || 0) + 1);
		});
		const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);

		const tableRow = (values, style) => {
			values.forEach((v, ci) =>
				Object.assign(ws.getCell(cur, ci + 1), { value: v, border: bAll, ...style(ci) }),
			);
			ws.mergeCells(`B${cur}:E${cur}`);
			ws.mergeCells(`F${cur}:G${cur}`);
			ws.getRow(cur).height = 20;
			cur++;
		};

		secHeader(title);
		tableRow(['STT', label, '', '', '', 'Số đề tài', '', 'Tỷ lệ (%)'], () => ({
			font: fnt({ bold: true, size: 10, color: 'FFFFFF' }),
			fill: sf(C.accent),
			alignment: al('center', true),
		}));
		rows.forEach(([name, cnt], i) => {
			const pct = topics.length > 0 ? ((cnt / topics.length) * 100).toFixed(1) + '%' : '0%';
			tableRow([i + 1, name, '', '', '', cnt, '', pct], (ci) => ({
				font: fnt({ size: 10 }),
				fill: sf(i % 2 === 0 ? C.rowA : C.rowB),
				alignment: al(ci === 0 || ci >= 5 ? 'center' : 'left', true),
			}));
		});
	};

	countSection(
		'II. THEO PHÂN LOẠI ĐỀ TÀI',
		'Phân loại',
		(t) => t.category_name || '(Chưa phân loại)',
	);
	cur++;
	countSection('III. THEO CẤP ĐỘ', 'Cấp độ', (t) => t.level_name || '(Chưa xác định)');
	cur++;
	countSection(
		'IV. THEO KHOA/PHÒNG (TOP 20)',
		'Phòng ban / Khoa',
		(t) => t.department_name || '(Chưa phân)',
		20,
	);

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

module.exports = {
	buildOverviewSheet,
	buildTopicListSheet,
};
