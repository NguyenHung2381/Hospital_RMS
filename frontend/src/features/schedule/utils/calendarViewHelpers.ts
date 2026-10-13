import type { RoundDeadline } from '../../round/types/round.type';
import { DEADLINE_COLORS, type RoundRow } from '../types/schedule.type';
import type { CalDay, CalView, DayEventItem, MonthData } from '../types/calendarView.type';
import { parseDate } from './scheduleUtils';

export const DOW = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
export const DOW_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export const GRID_COLS: Record<CalView, string> = {
	1: '1fr',
	12: 'repeat(4, 1fr)',
};

export function isSameDay(d1: Date, d2: Date): boolean {
	return (
		d1.getFullYear() === d2.getFullYear() &&
		d1.getMonth() === d2.getMonth() &&
		d1.getDate() === d2.getDate()
	);
}

export function deadlineColor(dl: RoundDeadline, gc: (key: string, fallback: string) => string): string {
	return gc(`deadline-${dl.id}`, DEADLINE_COLORS[dl.deadline_type ?? ''] ?? '#888888');
}

/** Map "yyyy-m-d" → các mốc phủ ngày đó (quét từng ngày trong khoảng start→deadline). */
function buildDeadlinesByDay(
	rows: RoundRow[],
	gc: (key: string, fallback: string) => string,
): Map<string, DayEventItem[]> {
	const byDay = new Map<string, DayEventItem[]>();
	rows.forEach((r) => {
		r.deadlines.forEach((dl) => {
			const endDate = parseDate(dl.deadline_date);
			if (!endDate) return;
			const startDate = parseDate(dl.start_date) || endDate;
			const color = deadlineColor(dl, gc);

			const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
			const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
			while (cur <= end) {
				const k = `${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`;
				if (!byDay.has(k)) byDay.set(k, []);
				const existing = byDay.get(k)!;
				if (!existing.some(item => item.deadline.id === dl.id)) {
					existing.push({ round: r, deadline: dl, color });
				}
				cur.setDate(cur.getDate() + 1);
			}
		});
	});
	return byDay;
}

/** Thứ 2 của tuần chứa ngày `d` (00:00). */
export function startOfWeek(d: Date): Date {
	const res = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	res.setDate(res.getDate() - ((res.getDay() + 6) % 7));
	return res;
}

export function addDays(d: Date, n: number): Date {
	const res = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	res.setDate(res.getDate() + n);
	return res;
}

/** Năm "sở hữu" tuần (theo ISO: năm của ngày Thứ 5). */
export function weekYear(weekStart: Date): number {
	return addDays(weekStart, 3).getFullYear();
}

/** 7 ô ngày (Thứ 2 → CN) của tuần bắt đầu từ `weekStart`. */
export function buildWeekDays(weekStart: Date): CalDay[] {
	const today = new Date();
	return Array.from({ length: 7 }, (_, i) => {
		const date = addDays(weekStart, i);
		return {
			date,
			dayNum:         date.getDate(),
			month:          date.getMonth(),
			year:           date.getFullYear(),
			isCurrentMonth: true,
			isToday:        isSameDay(date, today),
			key:            `wk-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
		};
	});
}

/** Lưới tuần của tháng `m` (kèm ngày tháng trước/sau lấp đủ hàng). */
export function buildMonthWeeks(year: number, m: number): CalDay[][] {
	const today = new Date();
	const firstDate = new Date(year, m, 1);
	const firstDow  = (firstDate.getDay() + 6) % 7;
	const totalDays = new Date(year, m + 1, 0).getDate();

	const cells: CalDay[] = [];

	const prevMonthLastDate = new Date(year, m, 0).getDate();
	for (let i = firstDow - 1; i >= 0; i--) {
		const d = prevMonthLastDate - i;
		const date = new Date(year, m - 1, d);
		cells.push({
			date,
			dayNum:         d,
			month:          date.getMonth(),
			year:           date.getFullYear(),
			isCurrentMonth: false,
			isToday:        isSameDay(date, today),
			key:            `prev-${date.getMonth()}-${d}`,
		});
	}

	for (let d = 1; d <= totalDays; d++) {
		const date = new Date(year, m, d);
		cells.push({
			date,
			dayNum:         d,
			month:          m,
			year,
			isCurrentMonth: true,
			isToday:        isSameDay(date, today),
			key:            `cur-${m}-${d}`,
		});
	}

	const remaining = 7 - (cells.length % 7);
	if (remaining < 7) {
		for (let d = 1; d <= remaining; d++) {
			const date = new Date(year, m + 1, d);
			cells.push({
				date,
				dayNum:         d,
				month:          date.getMonth(),
				year:           date.getFullYear(),
				isCurrentMonth: false,
				isToday:        isSameDay(date, today),
				key:            `next-${date.getMonth()}-${d}`,
			});
		}
	}

	const weeks: CalDay[][] = [];
	for (let i = 0; i < cells.length; i += 7) {
		weeks.push(cells.slice(i, i + 7));
	}
	return weeks;
}

export function computeMonthsData(
	rows: RoundRow[],
	year: number,
	gc: (key: string, fallback: string) => string,
): MonthData[] {
	const deadlinesByDay = buildDeadlinesByDay(rows, gc);
	return Array.from({ length: 12 }, (_, m) => {
		const weeks = buildMonthWeeks(year, m);

		const monthDeadlines: MonthData['monthDeadlines'] = [];

		// Danh sách tóm tắt dưới thẻ: mỗi mốc 1 lần, xếp vào tháng của ngày hết hạn
		rows.forEach((r) => {
			r.deadlines.forEach((dl) => {
				const endDate = parseDate(dl.deadline_date);
				if (!endDate || endDate.getFullYear() !== year || endDate.getMonth() !== m) return;
				if (!monthDeadlines.some(item => item.deadline.id === dl.id)) {
					monthDeadlines.push({ round: r, deadline: dl, day: endDate.getDate(), color: deadlineColor(dl, gc) });
				}
			});
		});

		monthDeadlines.sort((a, b) => a.day - b.day);

		return { month: m, weeks, deadlinesByDay, monthDeadlines };
	});
}
