import { useEffect, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getRounds } from '../api/roundApi';
import type { ResearchRound } from '../types/round.type';

// Cache cấp module: AdminLayout bị remount mỗi lần chuyển trang, tránh gọi lại
// API và nháy chỉ báo trên topbar. Realtime 'round' sẽ làm mới cache.
let cache: ResearchRound[] | null = null;

/** Các đợt nghiên cứu đang `active` — dùng cho chỉ báo đợt trên topbar admin. */
export function useActiveRounds(enabled = true): ResearchRound[] {
	const [rounds, setRounds] = useState<ResearchRound[]>(cache ?? []);
	const [tick, setTick] = useState(0);

	useRealtimeUpdate(['round'], () => {
		cache = null;
		setTick((t) => t + 1);
	});

	useEffect(() => {
		if (!enabled || cache) return;
		let alive = true;
		getRounds({ status: 'active', limit: 20 })
			.then((res) => {
				cache = (res.data ?? []).filter((r) => r.status === 'active');
				if (alive) setRounds(cache);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [enabled, tick]);

	return enabled ? rounds : [];
}
