/**
 * excelLecturerTotals.js — Khối "Tổng số tiết theo giảng viên" ghi dưới bảng của các file
 * Excel phân công giảng viên (file mẫu giảng viên bài học của chương trình, kế hoạch giảng
 * dạy của khóa). Khối là CÔNG THỨC Excel: người dùng gõ / sửa tên giảng viên, số tiết trong
 * bảng thì tổng tự tính lại ngay trong file.
 *
 *  - Sheet ẩn "TinhTiet" gom họ tên từ bảng: mỗi dòng bảng 6 ô (giảng viên + tối đa 5 trợ
 *    giảng / GV phụ tách theo dấu ;), cột B đánh số người xuất hiện lần đầu. Khối tổng lấy
 *    người thứ 1, 2, … bằng INDEX/MATCH — chỉ dùng hàm có từ Excel 2010 (không cần Excel 365).
 *  - Tổng số tiết (tính riêng từng người): SUMPRODUCT số tiết các dòng có tên người đó ở cột
 *    giảng viên hoặc trong danh sách trợ giảng.
 *  - Giờ tín chỉ CME dự kiến × hệ số DT_KHOAHOC: mode 'split' (kế hoạch giảng dạy — như CME:
 *    số tiết dòng chia đều cho số người dạy dòng đó) | 'main' (chương trình — bài chưa có buổi:
 *    giảng viên chính đủ số tiết, GV phụ 0).
 *  - Vùng tham chiếu kết thúc ở dòng trống ngay trên khối: chèn thêm dòng trong bảng (kể cả
 *    ở dòng trống đó) thì Excel tự nới vùng; sheet ẩn đọc dư 50 dòng cho các dòng chèn thêm.
 *  - Ô công thức kèm sẵn kết quả (tính bằng JS như công thức) để phần mềm không tự tính lại khi
 *    mở file vẫn hiện đúng; workbook đặt fullCalcOnLoad để Excel tính lại khi mở.
 * Khi nhập lại file, readSheet dừng ở dòng tiêu đề khối (isLecturerTotalsRow).
 */
const { cellText } = require('./excelImport');
const { norm } = require('./vietnameseText');

const TOTALS_TITLE = 'Tổng số tiết theo giảng viên';
const TOTALS_KEY = norm(TOTALS_TITLE);
const HELPER_SHEET = 'TinhTiet';
const SLOTS = 6; // 1 giảng viên + 5 trợ giảng mỗi dòng
const EXTRA_ROWS = 50; // dòng chèn thêm vào bảng sau khi tải file vẫn được gom tên
const SPLIT_WIDTH = 200;

/** 2,5 / 300 — tối đa 2 chữ số thập phân, dấu phẩy thập phân. */
const fmtHours = (h) => String(Math.round(h * 100) / 100).replace('.', ',');
const round2 = (n) => Math.round(n * 100) / 100;

const quoteSheet = (name) => `'${String(name).replace(/'/g, "''")}'`;
const colNum = (letter) => letter.split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

/** Giá trị ô dạng chữ (kể cả ô công thức / rich text) — để tính sẵn kết quả. */
const textOf = (cell) => {
	const v = cell.value;
	if (v == null) return '';
	if (typeof v === 'object' && 'result' in v) return String(v.result ?? '');
	return cellText(cell);
};
const numberOf = (cell) => {
	const v = cell.value;
	const raw = v && typeof v === 'object' && 'result' in v ? v.result : v;
	return typeof raw === 'number' ? raw : 0;
};

// Mô phỏng TRIM của Excel: bỏ khoảng trắng đầu/cuối, gộp khoảng trắng giữa
const xlTrim = (s) => String(s).replace(/ +/g, ' ').trim();
// Ô trợ giảng → các tên (giống MID/SUBSTITUTE theo dấu ; ở sheet ẩn)
const splitNames = (raw) => String(raw).split(';').map(xlTrim);

/**
 * Số liệu tính sẵn cho các ô công thức (cùng quy tắc với công thức).
 * @param {{ main: string, assistants: string, hours: number }[]} rows
 * @param {'split' | 'main' | null} mode
 */
const computeTotals = (rows, mode) => {
	const people = [];
	const seen = new Set();
	for (const r of rows) {
		const slots = [xlTrim(r.main), ...splitNames(r.assistants).slice(0, SLOTS - 1)];
		for (const s of slots) {
			const key = s.toLowerCase();
			if (!s || seen.has(key)) continue;
			seen.add(key);
			people.push(s);
		}
	}
	const same = (a, b) => a.toLowerCase() === b.toLowerCase();
	return people.map((name) => {
		let hours = 0;
		let cme = 0;
		for (const r of rows) {
			const main = xlTrim(r.main);
			const assts = String(r.assistants).trim() ? splitNames(r.assistants) : [];
			const isMain = same(main, name);
			if (!isMain && !assts.some((a) => same(a, name))) continue;
			hours += r.hours;
			if (mode === 'main' && isMain) cme += r.hours;
			if (mode === 'split') {
				const raw = String(r.assistants);
				const count = (main ? 1 : 0) + (raw.trim() ? raw.split(';').length : 0) || 1;
				cme += r.hours / count;
			}
		}
		return { name, hours: round2(hours), cme };
	});
};

/**
 * Ghi khối tổng (công thức) dưới bảng + sheet ẩn gom tên.
 * @param {import('exceljs').Workbook} wb
 * @param {import('exceljs').Worksheet} ws sheet bảng; dữ liệu từ `firstRow` tới dòng cuối hiện có
 * @param {{
 *   firstRow: number,
 *   cols: { hours: string, main: string, assistants: string },
 *   lastCol: string,
 *   block: { name: [string, string], hours: [string, string?], credits: string },
 *   cme: null | { mode: 'split' | 'main', factor: number },
 *   note?: string,
 *   creditLabel?: string,
 * }} opts
 *   block: cột của khối — name gộp 2 cột, hours 1–2 cột, credits 1 cột (bỏ khi cme null);
 *   không được trùng cột main / assistants của bảng.
 */
const addLecturerTotals = (wb, ws, opts) => {
	const { firstRow, cols, lastCol, block, cme, note = '', creditLabel = 'Giờ tín chỉ CME' } = opts;
	const lastData = Math.max(ws.rowCount, firstRow - 1);
	const rows = [];
	for (let r = firstRow; r <= lastData; r++) {
		const row = ws.getRow(r);
		rows.push({
			main: textOf(row.getCell(colNum(cols.main))),
			assistants: textOf(row.getCell(colNum(cols.assistants))),
			hours: numberOf(row.getCell(colNum(cols.hours))),
		});
	}
	const totals = computeTotals(rows, cme?.mode ?? null);

	// Dòng trống ngay trên khối = dòng cuối của vùng tham chiếu
	const spacer = ws.addRow([]).number;
	const ref = (c) => `${quoteSheet(ws.name)}!$${c}$${firstRow}:$${c}$${spacer}`;
	const mainR = ref(cols.main);
	const asstR = ref(cols.assistants);
	const hoursR = ref(cols.hours);

	// ── Sheet ẩn gom tên ──
	const helper = wb.addWorksheet(HELPER_SHEET, { state: 'hidden' });
	helper.columns = [{ width: 40 }, { width: 10 }];
	helper.addRow(['Họ tên (tự gom từ bảng)', 'Thứ tự']);
	const capacity = spacer - firstRow + 1 + EXTRA_ROWS;
	const slotValues = rows.flatMap((r) => {
		const assts = splitNames(r.assistants);
		return Array.from({ length: SLOTS }, (_, k) =>
			k === 0 ? xlTrim(r.main) : (assts[k - 1] ?? ''),
		);
	});
	const seen = new Set();
	let order = 0;
	for (let i = 1; i <= capacity; i++) {
		for (let k = 0; k < SLOTS; k++) {
			const r = helper.rowCount + 1;
			const formula =
				k === 0
					? `IFERROR(TRIM(INDEX(${mainR},${i})),"")`
					: `IFERROR(TRIM(MID(SUBSTITUTE(INDEX(${asstR},${i}),";",REPT(" ",${SPLIT_WIDTH})),${(k - 1) * SPLIT_WIDTH + 1},${SPLIT_WIDTH})),"")`;
			const value = slotValues[(i - 1) * SLOTS + k] ?? '';
			const key = value.toLowerCase();
			const first = value && !seen.has(key);
			if (first) seen.add(key);
			helper.getCell(`A${r}`).value = { formula, result: value };
			helper.getCell(`B${r}`).value = {
				formula: `IF(A${r}="","",IF(COUNTIF(A$2:A${r},A${r})=1,MAX(B$1:B${r - 1})+1,""))`,
				result: first ? ++order : '',
			};
		}
	}
	const helperRef = (c) => `${quoteSheet(HELPER_SHEET)}!$${c}:$${c}`;

	// ── Khối tổng ──
	const merge = (row, from, to) => to && ws.mergeCells(`${from}${row}:${to}${row}`);
	const title = ws.addRow([note ? `${TOTALS_TITLE} — ${note}` : TOTALS_TITLE]);
	merge(title.number, 'A', lastCol);
	title.font = { bold: true };
	title.alignment = { wrapText: true, vertical: 'top' };
	title.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F3EC' } };
	title.height = note ? 48 : 20;

	const header = ws.addRow([]);
	const head = (c, v) => {
		const cell = header.getCell(c);
		cell.value = v;
		cell.font = { bold: true };
		cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
		cell.border = { bottom: { style: 'thin', color: { argb: 'FF9DB5A6' } } };
	};
	head('A', 'STT');
	head(block.name[0], 'Giảng viên');
	merge(header.number, block.name[0], block.name[1]);
	head(block.hours[0], 'Tổng số tiết');
	merge(header.number, block.hours[0], block.hours[1]);
	if (cme) head(block.credits, creditLabel);
	header.height = 30;

	const count = Math.max(20, totals.length + 15);
	for (let j = 1; j <= count; j++) {
		const row = ws.addRow([]);
		const r = row.number;
		const t = totals[j - 1];
		const name = `$${block.name[0]}${r}`;
		const isPerson = `((TRIM(${mainR})=${name})+ISNUMBER(SEARCH(";"&${name}&";",";"&SUBSTITUTE(SUBSTITUTE(${asstR},"; ",";")," ;",";")&";")))>0`;
		row.getCell('A').value = { formula: `IF(${name}="","",${j})`, result: t ? j : '' };
		row.getCell(block.name[0]).value = {
			formula: `IFERROR(INDEX(${helperRef('A')},MATCH(${j},${helperRef('B')},0)),"")`,
			result: t ? t.name : '',
		};
		merge(r, block.name[0], block.name[1]);
		const hoursCell = row.getCell(block.hours[0]);
		hoursCell.value = {
			formula: `IF(${name}="","",SUMPRODUCT(--(${isPerson}),${hoursR}))`,
			result: t ? t.hours : '',
		};
		hoursCell.numFmt = 'General';
		merge(r, block.hours[0], block.hours[1]);
		if (cme) {
			const people = `((TRIM(${mainR})<>"")+(TRIM(${asstR})<>"")*(LEN(${asstR})-LEN(SUBSTITUTE(${asstR},";",""))+1)+(TRIM(${mainR})&TRIM(${asstR})=""))`;
			const cmeSum =
				cme.mode === 'split'
					? `SUMPRODUCT(--(${isPerson}),${hoursR},1/${people})`
					: `SUMPRODUCT(--(TRIM(${mainR})=${name}),${hoursR})`;
			const credit = row.getCell(block.credits);
			credit.value = {
				formula: `IF(${name}="","",ROUND(${cmeSum}*${cme.factor},2))`,
				result: t ? round2(t.cme * cme.factor) : '',
			};
			credit.numFmt = 'General';
		}
		row.alignment = { vertical: 'middle' };
	}
	// Excel tính lại toàn bộ công thức khi mở file
	wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };
	return { totals, spacer, titleRow: title.number };
};

/** Dòng tiêu đề khối tổng (ô cột A) — readSheet dừng đọc tại đây. */
const isLecturerTotalsRow = (row) => norm(cellText(row.getCell(1))).startsWith(TOTALS_KEY);

module.exports = {
	TOTALS_TITLE,
	HELPER_SHEET,
	fmtHours,
	computeTotals,
	addLecturerTotals,
	isLecturerTotalsRow,
};
