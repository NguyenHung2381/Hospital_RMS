/**
 * topicReportWorkbook.js — dựng workbook cho POST /api/v1/topics/export-report
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
const { lazyRequire } = require('../../../utils/lazyRequire');
/** @type {typeof import('exceljs')} */
const ExcelJS = lazyRequire('exceljs');
const { fnt, al, sf, bAll } = require('../../../utils/excelStyle');
const {
	C,
	STATUS_LABELS,
	ROLE_LABELS,
	writeLetterhead,
	writeTitleBlock,
} = require('./topicReportLayout');
const { buildOverviewSheet, buildTopicListSheet } = require('./topicReportSheets');

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
		members.forEach((m) => {
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
// data: kết quả topicService.getForExport; sections: các sheet cần dựng.
const buildTopicReportWorkbook = (data, { title, subtitle, refNumber, refDate, sections }) => {
	const wb = new ExcelJS.Workbook();
	wb.creator = 'RMS Hospital';
	wb.created = new Date();

	const opts = { title, subtitle, refNumber, refDate };

	if (sections.includes('overview')) {
		buildOverviewSheet(wb.addWorksheet('Tổng quan'), data, opts);
	}

	if (sections.includes('topics')) {
		buildTopicListSheet(wb.addWorksheet('Danh sách đề tài'), data, opts, title);
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
		buildTopicListSheet(wb.addWorksheet('Danh sách đề tài'), data, opts, title);
	}
	return wb;
};

module.exports = { buildTopicReportWorkbook };
