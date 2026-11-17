import { useCallback, useEffect, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getDashboardStats } from '../api/dashboardApi';
import type { DashboardStats } from '../types/dashboard.type';

export interface DashboardState {
	stats: DashboardStats | null;
	statsLoading: boolean;
	statsError: boolean;
}

// Số liệu dashboard NCKH (GET /dashboard/stats), tự tải lại khi có thay đổi realtime.
export function useDashboard(): DashboardState {
	const [stats, setStats] = useState<DashboardStats | null>(null);
	const [statsLoading, setStatsLoading] = useState(true);
	const [statsError, setStatsError] = useState(false);

	const load = useCallback(() => {
		let cancelled = false;
		getDashboardStats()
			.then((d) => {
				if (cancelled) return;
				setStats(d);
				setStatsError(false);
			})
			.catch(() => {
				if (!cancelled) setStatsError(true);
			})
			.finally(() => {
				if (!cancelled) setStatsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => load(), [load]);

	useRealtimeUpdate(['topic', 'user', 'department', 'round', 'category', 'level', 'council'], () => {
		load();
	});

	return { stats, statsLoading, statsError };
}
