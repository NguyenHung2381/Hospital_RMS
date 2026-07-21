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

module.exports = { fnt, al, sf, border, bAll, bNoBot, bNoTop, bSides };
