/**
 * vietnameseText.js — helper chuẩn hoá chuỗi tiếng Việt dùng khi match dữ liệu
 * import (tên người, tên khoa, tên đề tài…). Tách từ councilImportService để
 * seminarImportService dùng chung.
 */

// "Nguyễn Đức" → "Nguyen Duc" (bỏ dấu + đ/Đ)
const stripDiacritics = (s) =>
	String(s == null ? '' : s)
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'D');

// Chuẩn hoá về "chỉ chữ thường + số + 1 dấu cách" — khoá so khớp.
const norm = (s) => {
	if (!s) return '';
	return stripDiacritics(s)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
};

// Bỏ tiền tố Khoa/Phòng/TT… để "Khoa Bỏng" == "Bỏng".
const normDept = (s) => norm(s).replace(/^(khoa|phong|trung tam|tt|don vi|vp khoa|bo mon)\s+/, '');

// "PGS.TS. Nguyễn Văn A" / "BSCK2. X" → phần tên sau học vị.
const stripQualification = (s) => {
	const t = String(s || '').trim();
	const lastDot = t.lastIndexOf('.');
	const name = lastDot >= 0 ? t.slice(lastDot + 1) : t;
	return name
		.replace(/^\s*(GS|PGS|TS|ThS|BSCKII|BSCKI|BSCK2|BSCK1|BSNT|BS|KS|CN|CĐ|DS|ĐD)\s+/i, '')
		.trim();
};

// Dice coefficient trên bigram — fuzzy match chuỗi gõ lệch nhẹ.
const bigrams = (s) => {
	const set = new Map();
	for (let i = 0; i < s.length - 1; i++) {
		const b = s.slice(i, i + 2);
		set.set(b, (set.get(b) || 0) + 1);
	}
	return set;
};

const dice = (a, b) => {
	if (!a.length || !b.length) return 0;
	if (a === b) return 1;
	const ba = bigrams(a);
	const bb = bigrams(b);
	let overlap = 0;
	let total = 0;
	for (const [g, n] of ba) {
		total += n;
		if (bb.has(g)) overlap += Math.min(n, bb.get(g));
	}
	for (const [, n] of bb) total += n;
	return (2 * overlap) / total;
};

module.exports = {
	stripDiacritics,
	norm,
	normDept,
	stripQualification,
	bigrams,
	dice,
};
