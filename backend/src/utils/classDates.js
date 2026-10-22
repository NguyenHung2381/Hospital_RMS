/**
 * classDates.js — gợi ý ngày bắt đầu / kết thúc cho 1 lớp (chương trình trong khóa).
 * Hàm thuần (ngày dạng 'YYYY-MM-DD', tính theo UTC để khỏi lệch múi giờ) — test được.
 *   - Bắt đầu: thứ Hai đầu tiên từ (hôm nay + số ngày chuẩn bị), bỏ ngày lễ.
 *   - Kết thúc: ưu tiên thời lượng chương trình (3 tháng, 2 tuần…); không có thì
 *     theo tổng tiết các bài (8 tiết = 1 ngày học). Bỏ T7, CN và ngày lễ.
 *   - Thời lượng không đủ ngày học cho số tiết ⇒ cảnh báo, vẫn giữ theo thời lượng.
 */
const HOURS_PER_DAY = 8;

const toDate = (s) => new Date(`${s}T00:00:00Z`);
const toStr = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

/**
 * Danh sách ngày lễ ở Cấu hình hệ thống: mỗi dòng / dấu phẩy 1 ngày.
 * 'DD/MM' = lễ cố định hằng năm, 'DD/MM/YYYY' hoặc 'YYYY-MM-DD' = 1 ngày cụ thể.
 */
const parseHolidays = (text) => {
	const yearly = new Set();
	const dates = new Set();
	for (const raw of String(text ?? '').split(/[\n,;]+/)) {
		const s = raw.trim();
		let m;
		if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)))
			dates.add(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
		else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)))
			dates.add(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
		else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})$/)))
			yearly.add(`${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
	}
	return { yearly, dates };
};

const isWorkday = (d, holidays) => {
	const dow = d.getUTCDay();
	if (dow === 0 || dow === 6) return false;
	const s = toStr(d);
	return !holidays.dates.has(s) && !holidays.yearly.has(s.slice(5));
};

const countWorkdays = (from, to, holidays) => {
	let n = 0;
	for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkday(d, holidays)) n++;
	return n;
};

// Cộng thời lượng (tháng lẻ = 30 ngày/tháng) rồi lùi 1 ngày: học 1 tháng từ 03/11 ⇒ hết 02/12.
const addDuration = (start, value, unit) => {
	const v = Number(value);
	if (unit === 'day') return addDays(start, Math.ceil(v) - 1);
	if (unit === 'week') return addDays(start, Math.ceil(v * 7) - 1);
	const whole = Math.floor(v);
	const d = new Date(start);
	d.setUTCMonth(d.getUTCMonth() + whole);
	return addDays(d, Math.round((v - whole) * 30) - 1);
};

/**
 * @param {{ today: string, prepDays?: number, durationValue?: number|null, durationUnit?: string|null,
 *           totalHours?: number|null, holidays?: string }} p
 * @returns {{ start_date: string, end_date: string|null, workdays: number|null, needed_days: number|null, warning: string|null }}
 */
const suggestClassDates = ({
	today,
	prepDays = 7,
	durationValue = null,
	durationUnit = null,
	totalHours = null,
	holidays = '',
}) => {
	const hol = parseHolidays(holidays);
	let start = addDays(toDate(today), Math.max(0, Number(prepDays) || 0));
	while (start.getUTCDay() !== 1) start = addDays(start, 1);
	while (!isWorkday(start, hol)) start = addDays(start, 1);

	const needed = totalHours > 0 ? Math.ceil(totalHours / HOURS_PER_DAY) : null;
	let end = null;
	if (durationValue > 0 && ['day', 'week', 'month'].includes(durationUnit)) {
		end = addDuration(start, durationValue, durationUnit);
		while (end > start && !isWorkday(end, hol)) end = addDays(end, -1);
	} else if (needed) {
		end = start;
		for (let n = 1; n < needed;) {
			end = addDays(end, 1);
			if (isWorkday(end, hol)) n++;
		}
	}
	const workdays = end ? countWorkdays(start, end, hol) : null;
	const warning =
		needed && workdays != null && workdays < needed
			? `Thời lượng chương trình chỉ có ${workdays} ngày học, ít hơn ${needed} ngày cần cho ${totalHours} tiết.`
			: null;
	return {
		start_date: toStr(start),
		end_date: end ? toStr(end) : null,
		workdays,
		needed_days: needed,
		warning,
	};
};

module.exports = { suggestClassDates, parseHolidays, HOURS_PER_DAY };
