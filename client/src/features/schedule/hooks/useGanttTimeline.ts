import { useCallback, useMemo } from 'react';
import { MONTHS_LONG, MONTHS_SHORT, type ZoomLevel } from '../types/schedule.type';

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function useGanttTimeline(year: number, zoom: ZoomLevel) {
	const now = useMemo(() => new Date(), []);
	const currentYear  = now.getFullYear();
	const currentMonth = now.getMonth();

	const yearStart = useMemo(() => new Date(year, 0, 1).getTime(), [year]);
	const yearEnd   = useMemo(() => new Date(year, 11, 31, 23, 59, 59).getTime(), [year]);
	const yearMs    = yearEnd - yearStart;

	const toPct = useCallback(
		(date: Date) => {
			const clamped = Math.max(yearStart, Math.min(yearEnd, date.getTime()));
			return ((clamped - yearStart) / yearMs) * 100;
		},
		[yearStart, yearEnd, yearMs],
	);

	const monthData = useMemo(() => {
		const totalDays = isLeap(year) ? 366 : 365;
		const labels = zoom >= 2 ? MONTHS_LONG : MONTHS_SHORT;
		const daysPerMonth = Array.from({ length: 12 }, (_, i) =>
			new Date(year, i + 1, 0).getDate(),
		);
		return daysPerMonth.map((days, i) => ({
			label:    labels[i],
			startPct: (daysPerMonth.slice(0, i).reduce((a, b) => a + b, 0) / totalDays) * 100,
			widthPct: (days / totalDays) * 100,
			idx: i,
		}));
	}, [year, zoom]);

	const subHeader = useMemo(() => {
		if (zoom < 2) return [];
		const items: { pct: number; label: string }[] = [];
		const d = new Date(year, 0, 1);
		if (zoom >= 8) {
			while (d.getFullYear() === year) {
				if (d.getDate() !== 1)
					items.push({
						pct:   ((d.getTime() - yearStart) / yearMs) * 100,
						label: String(d.getDate()),
					});
				d.setDate(d.getDate() + 1);
			}
		} else {
			while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
			while (d.getFullYear() === year) {
				items.push({
					pct: ((d.getTime() - yearStart) / yearMs) * 100,
					label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
				});
				d.setDate(d.getDate() + 7);
			}
		}
		return items;
	}, [year, zoom, yearStart, yearMs]);

	const fineLines = useMemo(() => {
		if (zoom < 2) return [];
		const lines: { pct: number; strong: boolean }[] = [];
		const d = new Date(year, 0, 1);
		if (zoom >= 8) {
			while (d.getFullYear() === year) {
				if (d.getDate() !== 1)
					lines.push({
						pct:    ((d.getTime() - yearStart) / yearMs) * 100,
						strong: d.getDay() === 1,
					});
				d.setDate(d.getDate() + 1);
			}
		} else {
			while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
			while (d.getFullYear() === year) {
				if (d.getDate() !== 1)
					lines.push({
						pct:    ((d.getTime() - yearStart) / yearMs) * 100,
						strong: true,
					});
				d.setDate(d.getDate() + 7);
			}
		}
		return lines;
	}, [year, zoom, yearStart, yearMs]);

	const todayPct = useMemo(() => {
		if (now.getFullYear() !== year) return null;
		return ((now.getTime() - yearStart) / yearMs) * 100;
	}, [now, year, yearStart, yearMs]);

	return {
		currentYear,
		currentMonth,
		yearStart,
		yearMs,
		monthData,
		subHeader,
		fineLines,
		todayPct,
		toPct,
	};
}
