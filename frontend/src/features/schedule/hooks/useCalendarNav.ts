import { useCallback, useMemo, useState } from 'react';
import type { CalMode } from '../types/calendarView.type';
import { addDays, startOfWeek, weekYear } from '../utils/calendarViewHelpers';

const YEAR_RANGE_BACK = 15;
const YEAR_RANGE_FORWARD = 5;

export const CAL_MODES: { key: CalMode; label: string }[] = [
	{ key: 'week',  label: 'Tuần' },
	{ key: 'month', label: 'Tháng' },
	{ key: 'year',  label: 'Năm' },
];

/** Tuần mở đầu của năm `y` (tuần chứa ngày 4/1 — luôn thuộc năm đó theo ISO). */
const firstWeekOf = (y: number) => startOfWeek(new Date(y, 0, 4));

/**
 * Trạng thái điều hướng lịch tuần / tháng / năm — dùng chung cho Lịch trình
 * nghiên cứu và Lịch học.
 */
export function useCalendarNav(initialMode: CalMode = 'year') {
	const now         = useMemo(() => new Date(), []);
	const currentYear = now.getFullYear();
	const minYear = currentYear - YEAR_RANGE_BACK;
	const maxYear = currentYear + YEAR_RANGE_FORWARD;

	const [year, setYear]                 = useState(currentYear);
	const [calMode, setCalMode]           = useState<CalMode>(initialMode);
	const [calStart, setCalStart]         = useState(() => now.getMonth());
	const [calWeekStart, setCalWeekStart] = useState(() => startOfWeek(now));

	const handleCalMode = useCallback((m: CalMode) => {
		if (m === calMode) return;
		if (m === 'month') {
			setCalStart(calMode === 'week'
				? addDays(calWeekStart, 3).getMonth()
				: year === currentYear ? now.getMonth() : 0);
		} else if (m === 'week') {
			// Tháng đang xem chứa hôm nay → tuần hiện tại; ngược lại → tuần đầu của tháng đang xem
			const month = calMode === 'month' ? calStart : (year === currentYear ? now.getMonth() : 0);
			let ws = year === currentYear && month === now.getMonth()
				? startOfWeek(now)
				: startOfWeek(new Date(year, month, 1));
			if (weekYear(ws) < year) ws = addDays(ws, 7);
			setCalWeekStart(ws);
			if (weekYear(ws) !== year) setYear(weekYear(ws));
		}
		setCalMode(m);
	}, [calMode, calStart, calWeekStart, year, currentYear, now]);

	const handleYearChange = useCallback((y: number) => {
		setYear(y);
		setCalWeekStart(y === currentYear ? startOfWeek(now) : firstWeekOf(y));
		if (y === currentYear) setCalStart(now.getMonth());
	}, [currentYear, now]);

	const handleSelectMonth = useCallback((m: number) => {
		setCalMode('month');
		setCalStart(m);
	}, []);

	const shiftWeek = useCallback((dir: 1 | -1) => {
		const ws = addDays(calWeekStart, dir * 7);
		const wy = weekYear(ws);
		if (wy < minYear || wy > maxYear) return;
		setCalWeekStart(ws);
		if (wy !== year) setYear(wy);
	}, [calWeekStart, year, minYear, maxYear]);

	const calPrev = useCallback(() => {
		if (calMode === 'week') return shiftWeek(-1);
		if (calStart > 0) {
			setCalStart((s) => s - 1);
		} else if (year > minYear) {
			setYear((y) => y - 1);
			setCalStart(11);
		}
	}, [calMode, shiftWeek, calStart, year, minYear]);

	const calNext = useCallback(() => {
		if (calMode === 'week') return shiftWeek(1);
		if (calStart < 11) {
			setCalStart((s) => s + 1);
		} else if (year < maxYear) {
			setYear((y) => y + 1);
			setCalStart(0);
		}
	}, [calMode, shiftWeek, calStart, year, maxYear]);

	const calGoToday = useCallback(() => {
		setYear(currentYear);
		setCalStart(now.getMonth());
		setCalWeekStart(startOfWeek(now));
	}, [currentYear, now]);

	const calCanPrev = calMode === 'week'
		? weekYear(addDays(calWeekStart, -7)) >= minYear
		: calStart > 0 || year > minYear;
	const calCanNext = calMode === 'week'
		? weekYear(addDays(calWeekStart, 7)) <= maxYear
		: calStart < 11 || year < maxYear;
	const calShowsToday = calMode === 'week'
		? calWeekStart.getTime() === startOfWeek(now).getTime()
		: year === currentYear && (calMode === 'year' || calStart === now.getMonth());
	const todayTitle = calMode === 'week' ? 'Về tuần hiện tại' : calMode === 'month' ? 'Về tháng hiện tại' : 'Về năm hiện tại';

	return {
		now, currentYear, minYear, maxYear,
		year, calMode, calStart, calWeekStart,
		handleCalMode, handleYearChange, handleSelectMonth,
		calPrev, calNext, calGoToday,
		calCanPrev, calCanNext, calShowsToday, todayTitle,
	};
}
