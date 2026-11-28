import { useEffect, useState } from 'react';
import { getHolidays, type Holiday } from '../api/holidayApi';

/** Khóa ngày theo giờ máy: 'YYYY-MM-DD' (khớp `Holiday.date`). */
export const isoDay = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Bộ nhớ đệm theo năm cho cả phiên — đổi tuần/tháng không tải lại. Lỗi thì bỏ khỏi đệm để lần sau thử lại. */
const cache = new Map<number, Promise<Holiday[]>>();
const load = (year: number) => {
	let p = cache.get(year);
	if (!p) {
		p = getHolidays(year).catch(() => {
			cache.delete(year);
			return [];
		});
		cache.set(year, p);
	}
	return p;
};

/**
 * Ngày nghỉ lễ của các năm cần hiển thị ⇒ Map 'YYYY-MM-DD' → tên lễ.
 * Không tải được thì lịch vẫn hiện bình thường, chỉ không tô ngày lễ.
 */
export function useHolidays(years: number[]): Map<string, string> {
	const key = [...new Set(years)].sort().join(',');
	const [map, setMap] = useState<Map<string, string>>(() => new Map());
	useEffect(() => {
		let alive = true;
		const ys = key.split(',').map(Number);
		Promise.all(ys.map(load)).then((lists) => {
			if (!alive) return;
			setMap(new Map(lists.flat().map((h) => [h.date, h.name])));
		});
		return () => {
			alive = false;
		};
	}, [key]);
	return map;
}
