/**
 * traineeTypeMatch.js — đọc ô "Đối tượng" của chương trình đào tạo (chữ tự do
 * trong file phòng Đào tạo: "BS, ĐD,KTV, YS YHCT", "Bác sĩ đã có CCHN",
 * "Nhân viên y tế") ra danh sách id danh mục trainee_types (id cố định, seed ở
 * 2026-09-14_seed_trainee_types và 2026-11-13_training_program_catalog).
 */
const { norm } = require('./vietnameseText');

// "Nhân viên y tế" = mọi chức danh chuyên môn (trừ quản lý, sinh viên).
const ALL_STAFF = [
	'TRNTYPE-BS',
	'TRNTYPE-DD',
	'TRNTYPE-NHS',
	'TRNTYPE-KTV',
	'TRNTYPE-YS',
	'TRNTYPE-DSI',
	'TRNTYPE-CN',
];

// Khớp theo ĐẦU mỗi mục (phần sau là điều kiện: "Bác sĩ đã có CCHN" → Bác sĩ).
const RULES = [
	[/^(bac si|bs)\b/, ['TRNTYPE-BS']],
	[/^(dieu duong|dd)\b/, ['TRNTYPE-DD']],
	[/^(nu )?ho sinh\b/, ['TRNTYPE-NHS']],
	[/^(ky thuat vien|ktv)\b/, ['TRNTYPE-KTV']],
	[/^(y si|y sy|ys)\b/, ['TRNTYPE-YS']],
	[/^duoc si\b/, ['TRNTYPE-DSI']],
	[/^cu nhan\b/, ['TRNTYPE-CN']],
	[/^(can bo )?quan ly\b/, ['TRNTYPE-QL']],
	[/^sinh vien\b/, ['TRNTYPE-SV']],
	[/^nhan vien y te\b/, ALL_STAFF],
];

/** "Bác sĩ, KTV" → { ids: ['TRNTYPE-BS', 'TRNTYPE-KTV'], unknown: [] } (giữ thứ tự, bỏ trùng). */
const parseTraineeTypes = (text) => {
	const ids = [];
	const unknown = [];
	for (const raw of String(text || '').split(/[,;+\n]/)) {
		const item = norm(raw);
		if (!item) continue;
		const rule = RULES.find(([re]) => re.test(item));
		if (!rule) {
			unknown.push(raw.trim());
			continue;
		}
		for (const id of rule[1]) if (!ids.includes(id)) ids.push(id);
	}
	return { ids, unknown };
};

module.exports = { parseTraineeTypes, ALL_STAFF };
