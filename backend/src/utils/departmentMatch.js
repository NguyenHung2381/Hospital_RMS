/**
 * departmentMatch.js — khớp tên khoa ghi tay trong file Excel ("TDCN",
 * "Gây mê hồi sức", "P. Điều dưỡng", "Cơ xương khớp") với danh mục departments.
 * Thứ tự: tên chuẩn hoá trùng khớp → viết tắt quen dùng → tên khoa chứa trọn
 * cụm từ → tên khoa chứa đủ mọi từ ("Nội hô hấp" = "Nội Dị Ứng - Hô Hấp"). Chỉ nhận
 * khi đúng 1 khoa; nhiều khoa thì báo mơ hồ.
 */
const { normDept } = require('./vietnameseText');

// Viết tắt thường gặp trong sổ sách của phòng Đào tạo → tên khoa đã chuẩn hoá.
const ALIASES = {
	ctch: 'chan thuong chinh hinh',
	tdcn: 'tham do chuc nang',
	rhm: 'rang ham mat',
	tmh: 'tai mui hong',
	yhct: 'y hoc co truyen',
	phcn: 'phuc hoi chuc nang',
	ksnk: 'kiem soat nhiem khuan',
	hstc: 'hoi suc tich cuc',
	hstcnk: 'hoi suc tich cuc ngoai khoa',
	pttkcs: 'phau thuat than kinh cot song',
	duhh: 'noi di ung ho hap',
	nttnlm: 'noi than tiet nieu loc mau',
	'd d': 'dieu duong',
	'p dieu duong': 'dieu duong',
	xq: 'x quang',
	xquang: 'x quang',
	// Cách viết trong sổ thực hành GPHN (3.xlsx)
	'noi tiet dai thao duong': 'noi tiet dtd',
	'ngoai tong hop 1': 'ngoai tong hop',
	'phau thuat tim mach long nguc': 'phau thuat tm long nguc',
	vs: 'vi sinh',
	gmhs: 'gay me hoi suc',
};

const wordsIn = (hay, needle) => ` ${hay} `.includes(` ${needle} `);

/** departments: [{ id, name }] → (raw) => { id, name } | { ambiguous: [...] } | null */
const createDepartmentMatcher = (departments) => {
	const list = departments.map((d) => ({ id: d.id, name: d.name, key: normDept(d.name) }));
	const byKey = new Map();
	for (const d of list) if (!byKey.has(d.key)) byKey.set(d.key, d);

	return (raw) => {
		let key = normDept(raw);
		if (!key) return null;
		key = ALIASES[key] ?? key;
		const exact = byKey.get(key);
		if (exact) return { id: exact.id, name: exact.name };
		const hits = list.filter((d) => wordsIn(d.key, key));
		if (hits.length === 1) return { id: hits[0].id, name: hits[0].name };
		if (hits.length > 1) return { ambiguous: hits.map((h) => h.name) };
		const words = key.split(' ');
		const loose = words.length > 1 ? list.filter((d) => words.every((w) => wordsIn(d.key, w))) : [];
		if (loose.length === 1) return { id: loose[0].id, name: loose[0].name };
		if (loose.length > 1) return { ambiguous: loose.map((h) => h.name) };
		return null;
	};
};

module.exports = { createDepartmentMatcher };
