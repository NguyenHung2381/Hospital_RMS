// Bảng màu, nhãn, quốc hiệu + tiêu đề dùng chung cho các sheet báo cáo đề tài (topicReportWorkbook.js).
const { fnt, al } = require('../../../utils/excelStyle');

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
const STATUS_ORDER = ['approved', 'submitted', 'rejected', 'supplement', 'cancelled'];
const ROLE_LABELS = {
	leader: 'Chủ nhiệm',
	secretary: 'Thư ký',
	member: 'Thành viên',
};

// ── Style helpers ─────────────────────────────────────────────────────────────
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
	/** @type {any[][]} */
	const rows = [
		[
			1,
			`A1:D1`,
			'SỞ Y TẾ NGHỆ AN',
			fnt({ size: 11 }),
			`F1:${lc}1`,
			'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
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

module.exports = {
	C,
	STATUS_LABELS,
	STATUS_ORDER,
	ROLE_LABELS,
	fmtDate,
	writeLetterhead,
	writeTitleBlock,
};
