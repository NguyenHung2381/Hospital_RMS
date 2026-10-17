/**
 * dashboardExportController.js — POST /api/v1/dashboard/export-stats
 *
 * Body: { year?: string }
 *
 * Sheets produced (in order):
 *   1. "Tổng quan"          — tổng số đề tài, theo phân hệ, theo trạng thái
 *   2. "Theo hệ"            — tổng hợp theo hệ chuyên môn (11 hệ)
 *   3. "Theo khoa-phòng-TT" — bảng đầy đủ từng khoa/phòng/trung tâm
 *   4+. Một sheet riêng cho từng khoa/phòng/trung tâm
 */

const ExcelJS = require('exceljs');
const dashboardService = require('./dashboardService');
const { fnt, al, headerRow, dataRow } = require('../../utils/excelStyle');
const { sendWorkbook } = require('../../utils/response');

const C = {
	hdrBlue: 'FF1F4E79',
	accent: 'FF4472C4',
	rowA: 'FFEBF3FB',
	rowB: 'FFF7FBFF',
	totalBg: 'FFD9E1F2',
	green: 'FFE2EFDA',
	red: 'FFFCE4D6',
	amber: 'FFFFF3CD',
	gray: 'FFF2F2F2',
};

const STATUS_LABELS = {
	submitted: 'Chờ duyệt',
	approved: 'Đã phê duyệt',
	rejected: 'Từ chối',
	supplement: 'Bổ sung',
	cancelled: 'Đã hủy',
};
const STATUS_ORDER = ['approved', 'submitted', 'rejected', 'supplement', 'cancelled'];
const STATUS_BG = {
	approved: C.green,
	submitted: C.amber,
	rejected: C.red,
	supplement: C.amber,
	cancelled: C.gray,
};

// Quốc hiệu + tiêu ngữ — giống mẫu văn bản hành chính dùng ở export-report.
function writeLetterhead(ws, lastCol) {
	const rows = [
		[
			1,
			'A1:D1',
			'SỞ Y TẾ NGHỆ AN',
			fnt({ size: 11 }),
			`F1:${lastCol}1`,
			'CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM',
			fnt({ bold: true, size: 11 }),
			18,
		],
		[
			2,
			'A2:D2',
			'BỆNH VIỆN HNĐK NGHỆ AN',
			fnt({ bold: true, size: 11 }),
			`F2:${lastCol}2`,
			'Độc lập - Tự do - Hạnh phúc',
			fnt({ italic: true, size: 11 }),
			18,
		],
	];
	for (const [rowNum, lr, lv, lf, rr, rv, rf, h] of rows) {
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
		ws.getRow(rowNum).height = h;
	}
	ws.getRow(3).height = 6; // spacer
}

// Nội dung mỗi sheet bắt đầu từ dòng 6 (sau letterhead + tiêu đề).
const CONTENT_START = 6;

// Quốc hiệu luôn chiếm tối thiểu tới cột F (khối bên phải "F..lastCol"),
// bất kể sheet có ít cột dữ liệu hơn — tránh merge range đảo ngược (vd F1:B1).
const LETTERHEAD_MIN_COL = 'F';

function sheetTitle(ws, title, lastCol) {
	writeLetterhead(ws, lastCol >= LETTERHEAD_MIN_COL ? lastCol : LETTERHEAD_MIN_COL);
	ws.mergeCells(`A4:${lastCol}4`);
	Object.assign(ws.getCell('A4'), {
		value: title,
		font: fnt({ bold: true, size: 13 }),
		alignment: al('center', true),
	});
	ws.getRow(4).height = 30;
	ws.getRow(5).height = 6;
}

// ── Sheet: Tổng quan ─────────────────────────────────────────────────────────
function buildOverviewSheet(ws, stats, year) {
	const { overview, by_article_type } = stats;
	const deTai = by_article_type.find((a) => a.type === 'de_tai')?.count ?? 0;
	const baiBao = by_article_type.find((a) => a.type === 'bai_bao')?.count ?? 0;

	sheetTitle(ws, `THỐNG KÊ TỔNG QUAN ĐỀ TÀI NGHIÊN CỨU KHOA HỌC NĂM ${year}`, 'B');

	let cur = CONTENT_START;
	headerRow(ws, cur, ['Phân hệ', 'Số lượng']);
	cur++;
	[
		['Đề tài NCKH', deTai],
		['Bài báo & Tập san', baiBao],
		['Tổng cộng', overview.total],
	].forEach((r) => {
		dataRow(ws, cur, r, { bg: C.totalBg, boldFirst: true });
		cur++;
	});
	cur++;

	headerRow(ws, cur, ['Trạng thái', 'Số lượng']);
	cur++;
	for (const st of STATUS_ORDER) {
		dataRow(ws, cur, [STATUS_LABELS[st], overview.by_status[st] ?? 0], {
			bg: STATUS_BG[st],
		});
		cur++;
	}

	ws.getColumn(1).width = 28;
	ws.getColumn(2).width = 14;
}

// ── Sheet: Theo hệ chuyên môn ────────────────────────────────────────────────
function buildByHeSheet(ws, stats) {
	sheetTitle(ws, 'THỐNG KÊ THEO HỆ CHUYÊN MÔN', 'F');

	const byHe = new Map();
	for (const d of stats.by_department) {
		const cur = byHe.get(d.specialty_group) ?? {
			de_tai: 0,
			bai_bao: 0,
			total: 0,
			approved: 0,
		};
		cur.de_tai += d.de_tai;
		cur.bai_bao += d.bai_bao;
		cur.total += d.total;
		cur.approved += d.approved;
		byHe.set(d.specialty_group, cur);
	}

	let cur = CONTENT_START;
	headerRow(ws, cur, ['Hệ chuyên môn', 'Đề tài NCKH', 'Bài báo', 'Tổng', 'Đã duyệt', 'Tỷ lệ duyệt (%)']);
	cur++;
	[...byHe.entries()]
		.sort((a, b) => b[1].total - a[1].total)
		.forEach(([name, h]) => {
			dataRow(ws, cur, [
				name,
				h.de_tai,
				h.bai_bao,
				h.total,
				h.approved,
				h.total > 0 ? Math.round((h.approved / h.total) * 1000) / 10 : 0,
			]);
			cur++;
		});

	[32, 14, 12, 10, 12, 14].forEach((w, i) => {
		ws.getColumn(i + 1).width = w;
	});
}

// ── Sheet: Theo khoa-phòng-TT (bảng tổng hợp) ───────────────────────────────
function buildDeptTableSheet(ws, stats) {
	sheetTitle(ws, 'THỐNG KÊ THEO KHOA / PHÒNG / TRUNG TÂM', 'L');

	let cur = CONTENT_START;
	headerRow(ws, cur, [
		'STT',
		'Khoa / Phòng / Trung tâm',
		'Hệ',
		'Đề tài NCKH',
		'Bài báo',
		'Tổng',
		'Chờ duyệt',
		'Đã duyệt',
		'Từ chối',
		'Bổ sung',
		'Huỷ',
		'Tỷ lệ duyệt (%)',
	]);
	cur++;
	stats.by_department.forEach((d, i) => {
		dataRow(ws, cur, [
			i + 1,
			d.name,
			d.specialty_group,
			d.de_tai,
			d.bai_bao,
			d.total,
			d.by_status.submitted,
			d.by_status.approved,
			d.by_status.rejected,
			d.by_status.supplement,
			d.by_status.cancelled,
			Math.round(d.approval_rate * 1000) / 10,
		]);
		cur++;
	});

	[5, 32, 22, 12, 10, 8, 10, 10, 10, 10, 8, 14].forEach((w, i) => {
		ws.getColumn(i + 1).width = w;
	});
}

// ── Sheet: chi tiết 1 khoa ───────────────────────────────────────────────────
function buildDeptDetailSheet(ws, d) {
	sheetTitle(ws, d.name, 'B');

	let cur = CONTENT_START;
	dataRow(ws, cur, ['Hệ chuyên môn', d.specialty_group], { bg: C.totalBg, boldFirst: true });
	cur++;
	dataRow(ws, cur, ['Đề tài NCKH', d.de_tai], { boldFirst: true });
	cur++;
	dataRow(ws, cur, ['Bài báo & Tập san', d.bai_bao], { boldFirst: true });
	cur++;
	dataRow(ws, cur, ['Tổng cộng', d.total], { bg: C.totalBg, boldFirst: true });
	cur++;
	dataRow(ws, cur, ['Tỷ lệ duyệt (%)', Math.round(d.approval_rate * 1000) / 10], {
		boldFirst: true,
	});
	cur++;
	if (d.council_progress.expected > 0) {
		dataRow(
			ws,
			cur,
			[
				'Tiến độ đánh giá hội đồng',
				`${d.council_progress.completed}/${d.council_progress.expected}`,
			],
			{ boldFirst: true },
		);
		cur++;
	}
	cur++;

	headerRow(ws, cur, ['Trạng thái', 'Số lượng']);
	cur++;
	for (const st of STATUS_ORDER) {
		dataRow(ws, cur, [STATUS_LABELS[st], d.by_status[st] ?? 0], { bg: STATUS_BG[st] });
		cur++;
	}
	cur++;

	if (d.categories.length > 0) {
		headerRow(ws, cur, ['Phân loại', 'Số lượng']);
		cur++;
		for (const c of d.categories) {
			dataRow(ws, cur, [c.name, c.count]);
			cur++;
		}
	}

	ws.getColumn(1).width = 30;
	ws.getColumn(2).width = 14;
}

function sheetNameFor(raw, used) {
	const cleaned = raw.replace(/[\\/*?[\]:]/g, ' ').trim().slice(0, 31) || 'Khoa';
	let name = cleaned;
	let i = 2;
	while (used.has(name)) {
		const suffix = ` (${i++})`;
		name = cleaned.slice(0, 31 - suffix.length) + suffix;
	}
	used.add(name);
	return name;
}

const ALL_SECTIONS = [
	'overview',
	'by_specialty_group',
	'by_department_table',
	'by_department_detail',
];

async function exportStats(req, res, next) {
	try {
		const year = req.body?.year || String(new Date().getFullYear());
		const sections =
			Array.isArray(req.body?.sections) && req.body.sections.length > 0
				? req.body.sections
				: ALL_SECTIONS;
		const stats = await dashboardService.getStats();

		const wb = new ExcelJS.Workbook();
		wb.creator = 'RMS Hospital';
		wb.created = new Date();

		if (sections.includes('overview')) {
			buildOverviewSheet(wb.addWorksheet('Tổng quan'), stats, year);
		}
		if (sections.includes('by_specialty_group')) {
			buildByHeSheet(wb.addWorksheet('Theo hệ'), stats);
		}
		if (sections.includes('by_department_table')) {
			buildDeptTableSheet(wb.addWorksheet('Theo khoa-phòng-TT'), stats);
		}
		if (sections.includes('by_department_detail')) {
			const used = new Set(wb.worksheets.map((ws) => ws.name));
			for (const d of stats.by_department) {
				buildDeptDetailSheet(wb.addWorksheet(sheetNameFor(d.name, used)), d);
			}
		}

		// Đảm bảo luôn có ít nhất 1 sheet nếu người dùng bỏ chọn hết
		if (wb.worksheets.length === 0) {
			buildOverviewSheet(wb.addWorksheet('Tổng quan'), stats, year);
		}

		await sendWorkbook(res, wb, `thong-ke-de-tai-${year}.xlsx`);
	} catch (err) {
		next(err);
	}
}

module.exports = { exportStats };
