/**
 * trainingDuration.js — thời lượng chương trình / vòng thực hành.
 * Lưu dạng số + đơn vị (duration_value, duration_unit ∈ day|week|month) để
 * cộng dồn / so sánh được; văn bản ("03 tháng", "1,5 tuần") chỉ để hiển thị.
 */
const { norm } = require('./vietnameseText');

const UNITS = ['day', 'week', 'month'];
const UNIT_LABEL = { day: 'ngày', week: 'tuần', month: 'tháng' };
// Quy đổi xấp xỉ ra ngày — chỉ dùng để so tổng các vòng với thời lượng chương trình.
const DAYS_PER_UNIT = { day: 1, week: 7, month: 30 };

/** @type {Array<[string, RegExp]>} */
const UNIT_WORDS = [
	['month', /^(thang|th)$/],
	['week', /^(tuan|t)$/],
	['day', /^(ngay|n)$/],
];

/**
 * "03 tháng" / "1.5 tháng" / "1,5 tháng" / "07 ngày" / "1.5  tuần" → { value, unit };
 * không đọc được → null.
 */
const parseDuration = (text) => {
	const raw = String(text ?? '')
		.replace(',', '.')
		.trim();
	const m = raw.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
	if (!m) return null;
	const value = Number(m[1]);
	if (!Number.isFinite(value) || value <= 0) return null;
	const word = norm(m[2]);
	const hit = UNIT_WORDS.find(([, re]) => re.test(word));
	return hit ? { value, unit: hit[0] } : null;
};

// { 1.5, 'month' } → "1,5 tháng"; 3 → "03 tháng" (giữ cách viết của danh mục gốc).
const formatDuration = (value, unit) => {
	if (value == null || !UNIT_LABEL[unit]) return null;
	const n = Number(value);
	const num = Number.isInteger(n) ? String(n).padStart(2, '0') : String(n).replace('.', ',');
	return `${num} ${UNIT_LABEL[unit]}`;
};

const toDays = (value, unit) =>
	value == null || !DAYS_PER_UNIT[unit] ? null : Number(value) * DAYS_PER_UNIT[unit];

module.exports = { UNITS, UNIT_LABEL, parseDuration, formatDuration, toDays };
