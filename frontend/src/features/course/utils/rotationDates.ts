// Tính ngày cho vòng thực hành — cùng quy tắc với backend (rotationPlanner.js):
// khoảng tính cả ngày đầu, 16/06 + 3 tháng → 15/09.
export type DurationUnit = 'day' | 'week' | 'month';

const DAY_MS = 86400000;
const toDate = (ymd: string) => new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (start: string, n: number) => ymd(new Date(toDate(start).getTime() + n * DAY_MS));

const addMonths = (start: string, n: number) => {
	const r = toDate(start);
	const day = r.getUTCDate();
	r.setUTCDate(1);
	r.setUTCMonth(r.getUTCMonth() + n);
	const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
	r.setUTCDate(Math.min(day, last));
	return ymd(r);
};

/** Ngày kết thúc của khoảng bắt đầu `start`, dài value×unit (tính cả ngày đầu). */
export const endOf = (start: string, value: number, unit: DurationUnit) => {
	if (unit === 'month') {
		const whole = Math.floor(value);
		return addDays(addDays(addMonths(start, whole), Math.round((value - whole) * 30)), -1);
	}
	return addDays(start, Math.max(1, Math.round(value * (unit === 'week' ? 7 : 1))) - 1);
};

/** "03 tháng" / "1,5 tuần" / "10 ngày" → { value, unit }; không đọc được → null. */
export const parseDuration = (text: string | null | undefined): { value: number; unit: DurationUnit } | null => {
	const m = String(text ?? '')
		.replace(',', '.')
		.trim()
		.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
	if (!m) return null;
	const value = Number(m[1]);
	const word = m[2]
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.trim();
	const unit: DurationUnit | null = /^(thang|th)$/.test(word)
		? 'month'
		: /^(tuan|t)$/.test(word)
			? 'week'
			: /^(ngay|n)$/.test(word)
				? 'day'
				: null;
	return unit && value > 0 ? { value, unit } : null;
};

export const formatDateVi = (v: string | null | undefined) => (v ? v.slice(0, 10).split('-').reverse().join('/') : '');
