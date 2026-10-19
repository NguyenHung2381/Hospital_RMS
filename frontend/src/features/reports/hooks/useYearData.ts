import { useEffect, useState } from 'react';

interface Loaded<T> {
	year: number;
	data: T | null;
	error: string;
}

/** Tải dữ liệu báo cáo của một năm; đổi năm thì tải lại, kết quả của năm cũ về muộn bị bỏ. */
export function useYearData<T>(load: (year: number) => Promise<T>, year: number) {
	const [loaded, setLoaded] = useState<Loaded<T> | null>(null);

	useEffect(() => {
		let alive = true;
		load(year)
			.then((data) => alive && setLoaded({ year, data, error: '' }))
			.catch((e: Error) => alive && setLoaded({ year, data: null, error: e.message || 'Lỗi tải dữ liệu' }));
		return () => {
			alive = false;
		};
	}, [load, year]);

	// Dữ liệu của năm khác (đang chuyển năm) coi như đang tải
	const cur = loaded?.year === year ? loaded : null;
	return { data: cur?.data ?? null, error: cur?.error ?? '' };
}
