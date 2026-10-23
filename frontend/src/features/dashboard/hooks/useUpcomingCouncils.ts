import { useEffect, useState } from 'react';
import { hasPermission } from '@/shared/utils/permissions';
import { getCouncils } from '@/features/council/api/councilApi';
import type { Council } from '@/features/council/types/council.type';
import { getStoredUser, type StoredUser } from '@/shared/utils/storage';

// defense_date trả về dạng "dd/mm/yyyy" từ councilService.normalize.
function parseDMY(d: string | null | undefined): Date | null {
	if (!d) return null;
	const [dd, mm, yyyy] = d.split('/').map(Number);
	if (!dd || !mm || !yyyy) return null;
	const date = new Date(yyyy, mm - 1, dd);
	return Number.isNaN(date.getTime()) ? null : date;
}

export interface UpcomingCouncilsState {
	upcomingCouncils: Council[];
	councilsLoading: boolean;
	councilsError: boolean;
}

// Hội đồng đã chốt có ngày bảo vệ từ hôm nay trở đi (tối đa 6) — cho dashboard NCKH.
export function useUpcomingCouncils(): UpcomingCouncilsState {
	const [upcomingCouncils, setUpcomingCouncils] = useState<Council[]>([]);
	const [councilsLoading, setCouncilsLoading] = useState(() =>
		hasPermission(getStoredUser<StoredUser>(), 'councils:read'),
	);
	const [councilsError, setCouncilsError] = useState(false);

	useEffect(() => {
		if (!hasPermission(getStoredUser<StoredUser>(), 'councils:read')) return;
		let cancelled = false;
		getCouncils({ limit: 0 })
			.then((res) => {
				if (cancelled) return;
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				const upcoming = res.data
					.map((c) => ({ c, date: parseDMY(c.defense_date) }))
					.filter(
						(x): x is { c: Council; date: Date } =>
							x.c.status === 'finalized' && x.date !== null && x.date >= today,
					)
					.sort((a, b) => a.date.getTime() - b.date.getTime())
					.slice(0, 6)
					.map((x) => x.c);
				setUpcomingCouncils(upcoming);
				setCouncilsError(false);
			})
			.catch(() => {
				if (!cancelled) setCouncilsError(true);
			})
			.finally(() => {
				if (!cancelled) setCouncilsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return { upcomingCouncils, councilsLoading, councilsError };
}
