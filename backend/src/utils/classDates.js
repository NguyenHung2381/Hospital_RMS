/**
 * classDates.js — gợi ý ngày bắt đầu / kết thúc cho 1 lớp (chương trình trong khóa).
 * Hàm thuần (ngày dạng 'YYYY-MM-DD', tính theo UTC để khỏi lệch múi giờ) — test được.
 *   - Bắt đầu: thứ Hai đầu tiên từ (hôm nay + số ngày chuẩn bị), bỏ ngày lễ.
 *   - Kết thúc: ưu tiên thời lượng chương trình (3 tháng, 2 tuần…); không có thì
 *     theo tổng tiết các bài (8 tiết = 1 ngày học). Bỏ T7, CN và ngày lễ.
 *   - Thời lượng không đủ ngày học cho số tiết ⇒ cảnh báo, vẫn giữ theo thời lượng.
 */
const { vnHolidays } = require('./vnHolidays');

const HOURS_PER_DAY = 8;

const toDate = (s) => new Date(`${s}T00:00:00Z`);
const toStr = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

/**
 * Ô "Ngày nghỉ lễ" ở Cấu hình hệ thống: mỗi dòng / dấu phẩy 1 ngày.
 * 'DD/MM' = lễ cố định hằng năm, 'DD/MM/YYYY' hoặc 'YYYY-MM-DD' = 1 ngày cụ thể.
 * Thêm dấu '-' phía trước = BỎ ngày đó (vd bỏ một ngày lễ tự tính: -03/09/2026).
 * `invalid` = các mục không hiểu / ngày không có thật (để báo khi lưu).
 */
const parseHolidays = (text) => {
	const yearly = new Set();
	const dates = new Set();
	const exYearly = new Set();
	const exDates = new Set();
	const invalid = [];
	const realDate = (y, m, d) => {
		const dt = new Date(Date.UTC(y, m - 1, d));
		return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
	};
	for (const raw of String(text ?? '').split(/[\n,;]+/)) {
		const token = raw.trim();
		if (!token) continue;
		const remove = token.startsWith('-');
		const s = remove ? token.slice(1).trim() : token;
		let m;
		let y;
		let mo;
		let d;
		if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, mo, d] = [+m[1], +m[2], +m[3]];
		else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [y, mo, d] = [+m[3], +m[2], +m[1]];
		else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})$/))) [y, mo, d] = [2024, +m[2], +m[1]]; // 2024 nhuận: nhận 29/02
		else {
			invalid.push(token);
			continue;
		}
		if (!realDate(y, mo, d)) {
			invalid.push(token);
			continue;
		}
		const md = `${pad(mo)}-${pad(d)}`;
		if (m.length === 3) (remove ? exYearly : yearly).add(md);
		else (remove ? exDates : dates).add(`${y}-${md}`);
	}
	return { yearly, dates, exYearly, exDates, invalid };
};
const pad = (n) => String(n).padStart(2, '0');

/**
 * Bộ kiểm tra "ngày này có nghỉ lễ không": ngày tự tính theo luật (khi bật) + ngày nhập tay,
 * trừ các ngày có dấu '-'. Ngày tự tính nạp theo từng năm khi cần.
 * @param {{ text?: string, auto?: boolean }} p
 */
const holidayCalendar = ({ text = '', auto = false } = {}) => {
	const h = parseHolidays(text);
	const autoByYear = new Map();
	const autoOf = (year) => {
		if (!autoByYear.has(year))
			autoByYear.set(year, new Map(auto ? vnHolidays(year).map((x) => [x.date, x]) : []));
		return autoByYear.get(year);
	};
	const removed = (s) => h.exDates.has(s) || h.exYearly.has(s.slice(5));
	const manual = (s) => h.dates.has(s) || h.yearly.has(s.slice(5));
	return {
		/** @param {string} s 'YYYY-MM-DD' */
		isHoliday: (s) => !removed(s) && (manual(s) || autoOf(+s.slice(0, 4)).has(s)),
		/** Ngày có trong ô nhập tay (kể cả trùng ngày tự tính) */
		isManual: manual,
		/**
		 * Danh sách cả năm để xem trước trên trang cấu hình — gồm cả ngày đã bị bỏ (removed).
		 * @param {number} year
		 */
		list: (year) => {
			const out = new Map();
			for (const [s, x] of autoOf(year))
				out.set(s, { date: s, name: x.name, source: 'auto', compensatory: !!x.compensatory });
			for (const md of h.yearly) {
				const s = `${year}-${md}`;
				if (!out.has(s) && !(md === '02-29' && new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1))
					out.set(s, { date: s, name: 'Thêm tay (hằng năm)', source: 'manual' });
			}
			for (const s of h.dates)
				if (s.startsWith(`${year}-`) && !out.has(s)) out.set(s, { date: s, name: 'Thêm tay', source: 'manual' });
			return [...out.values()]
				.map((x) => ({ ...x, removed: removed(x.date) }))
				.sort((a, b) => a.date.localeCompare(b.date));
		},
	};
};

const isWorkday = (d, cal) => {
	const dow = d.getUTCDay();
	if (dow === 0 || dow === 6) return false;
	return !cal.isHoliday(toStr(d));
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
 *           totalHours?: number|null, holidays?: string, autoHolidays?: boolean }} p
 * @returns {{ start_date: string, end_date: string|null, workdays: number|null, needed_days: number|null, warning: string|null }}
 */
const suggestClassDates = ({
	today,
	prepDays = 7,
	durationValue = null,
	durationUnit = null,
	totalHours = null,
	holidays = '',
	autoHolidays = false,
}) => {
	const hol = holidayCalendar({ text: holidays, auto: autoHolidays });
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

// Kiểm tra khi admin lưu cấu hình (modules/settings/settingRules.js) — null = hợp lệ
const validateSetting = (key, value) => {
	if (key !== 'TRAINING_HOLIDAYS' || value === null || value === '') return null;
	const { invalid } = parseHolidays(value);
	return invalid.length
		? `Không hiểu ngày: ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? '…' : ''} (dùng DD/MM, DD/MM/YYYY; thêm "-" phía trước để bỏ ngày)`
		: null;
};

module.exports = { suggestClassDates, parseHolidays, holidayCalendar, validateSetting };
