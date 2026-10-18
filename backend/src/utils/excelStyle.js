function fnt({ bold = false, color = '1B2A4A', size = 10, italic = false } = {}) {
	return {
		name: 'Times New Roman',
		bold,
		color: { argb: 'FF' + color },
		size,
		italic,
	};
}

function al(h = 'center', wrap = true) {
	return { horizontal: h, vertical: 'middle', wrapText: wrap };
}

function sf(argb) {
	return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function border(...sides) {
	const s = { style: 'thin', color: { argb: 'FF000000' } };
	const b = {};
	sides.forEach((k) => (b[k] = s));
	return b;
}

const bAll = border('top', 'bottom', 'left', 'right');
const bNoBot = border('top', 'left', 'right');
const bNoTop = border('bottom', 'left', 'right');
const bSides = border('left', 'right');

// Bảng báo cáo: dòng tiêu đề nền xanh đậm + dòng dữ liệu kẻ sọc.
const TABLE = { hdrBlue: 'FF1F4E79', rowA: 'FFEBF3FB', rowB: 'FFF7FBFF' };

function headerRow(ws, row, labels) {
	labels.forEach((label, i) => {
		Object.assign(ws.getCell(row, i + 1), {
			value: label,
			font: fnt({ bold: true, size: 10, color: 'FFFFFF' }),
			fill: sf(TABLE.hdrBlue),
			alignment: al('center', true),
			border: bAll,
		});
	});
	ws.getRow(row).height = 22;
}

// Số căn giữa, chữ căn trái; bg mặc định sọc theo số dòng.
function dataRow(ws, row, values, { bg = undefined, boldFirst = false } = {}) {
	values.forEach((v, i) => {
		Object.assign(ws.getCell(row, i + 1), {
			value: v ?? '',
			font: fnt({ size: 10, bold: boldFirst && i === 0 }),
			fill: sf(bg || (row % 2 === 0 ? TABLE.rowA : TABLE.rowB)),
			alignment: al(typeof v === 'number' ? 'center' : 'left', true),
			border: bAll,
		});
	});
}

module.exports = { fnt, al, sf, border, bAll, bNoBot, bNoTop, bSides, headerRow, dataRow };
