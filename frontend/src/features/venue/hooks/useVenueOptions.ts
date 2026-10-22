import { useCallback, useEffect, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { venueApi } from '../api/venueApi';
import type { Venue, VenueScope } from '../types/venue.type';

// Nhiều ô chọn địa điểm có thể mount cùng lúc (vd: form thêm + các dòng sửa
// trong form buổi học) ⇒ dùng chung 1 request thay vì mỗi ô tự gọi API.
// `force` (từ realtime) bắn đồng thời ở mọi ô đang mount ⇒ gộp các lần tải lại
// trong cùng 1 giây thành 1 request.
let cache: Promise<Venue[]> | null = null;
let fetchedAt = 0;
const load = (force = false) => {
	if (!cache || (force && Date.now() - fetchedAt > 1000)) {
		fetchedAt = Date.now();
		cache = venueApi
			.list()
			.then((res) => res.data)
			.catch((err) => {
				cache = null; // lỗi thì lần sau thử lại
				throw err;
			});
	}
	return cache;
};

/** Danh sách địa điểm đang hoạt động, dùng được cho `scope` (địa điểm 'both' khớp mọi scope). */
export function useVenueOptions(scope: Exclude<VenueScope, 'both'>) {
	const [venues, setVenues] = useState<Venue[]>([]);
	const [loaded, setLoaded] = useState(false);

	const refresh = useCallback((force = false) => {
		load(force)
			.then(setVenues)
			.catch(() => setVenues([]))
			.finally(() => setLoaded(true));
	}, []);

	useEffect(() => refresh(), [refresh]);
	useRealtimeUpdate('venue', () => refresh(true));

	const active = venues.filter((v) => v.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
	const inScope = (v: Venue) => v.usage_scope === scope || v.usage_scope === 'both';
	// others: địa điểm đang hoạt động nhưng dành cho mục đích khác — ô chọn nào cần thì hiện thêm
	return { venues: active.filter(inScope), others: active.filter((v) => !inScope(v)), loaded };
}
