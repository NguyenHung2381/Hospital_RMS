/**
 * importText.js — Hàm xử lý chuỗi / gom nhóm dùng chung cho các service nhập Excel của
 * đào tạo (giảng viên theo buổi, giảng viên theo bài của chương trình).
 */

/** Gộp khoảng trắng liên tiếp thành 1 dấu cách, bỏ khoảng trắng đầu/cuối. */
const tidy = (s) =>
	String(s || '')
		.replace(/\s+/g, ' ')
		.trim();

/** Mã (bài học, nhân viên…): bỏ mọi khoảng trắng, viết hoa. */
const cleanCode = (s) =>
	String(s || '')
		.replace(/\s+/g, '')
		.toUpperCase();

/** items → Map(key → [item…]), giữ thứ tự xuất hiện. */
const groupBy = (items, keyOf) => {
	const map = new Map();
	for (const item of items) {
		const key = keyOf(item);
		if (!map.has(key)) map.set(key, []);
		map.get(key).push(item);
	}
	return map;
};

module.exports = { tidy, cleanCode, groupBy };
