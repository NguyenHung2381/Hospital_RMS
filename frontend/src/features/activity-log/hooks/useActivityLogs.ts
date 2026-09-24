import { useEffect, useMemo, useState } from 'react';
import {
	getActivityLogs,
	getActivityStats,
	type ActivityLog,
	type ActivityLogFilters,
	type ActivityStats,
} from '../api/activityLogApi';

export const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;

// exact = khung giờ chính xác của 1 phiên truy cập (bấm từ tab Phiên).
export type RangePreset = '1h' | 'today' | '24h' | '7d' | '30d' | 'custom' | 'exact';

export interface FilterState {
	range: RangePreset;
	/** 'YYYY-MM-DD' — chỉ dùng khi range = custom */
	fromDate: string;
	toDate: string;
	/** ISO — chỉ dùng khi range = exact */
	fromIso: string;
	toIso: string;
	actor: string;
	/** Chọn nhiều — gửi lên dạng "a,b,c" */
	action: string[];
	module: string[];
	method: string[];
	status: string;
	actorType: '' | 'user' | 'anonymous';
	ip: string;
	search: string;
	minDuration: string;
	excludeViews: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
	range: '24h',
	fromDate: '',
	toDate: '',
	fromIso: '',
	toIso: '',
	actor: '',
	action: [],
	module: [],
	method: [],
	status: '',
	actorType: '',
	ip: '',
	search: '',
	minDuration: '',
	excludeViews: false,
};

// Ngày 'YYYY-MM-DD' theo giờ Việt Nam → mốc ISO (đầu hoặc cuối ngày).
const vnDayBoundary = (day: string, end: boolean) =>
	new Date(`${day}T${end ? '23:59:59.999' : '00:00:00.000'}+07:00`).toISOString();

const rangeToQuery = (f: FilterState): Pick<ActivityLogFilters, 'from' | 'to'> => {
	const now = Date.now();
	switch (f.range) {
		case '1h':
			return { from: new Date(now - 3_600_000).toISOString() };
		case 'today': {
			const vnToday = new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);
			return { from: vnDayBoundary(vnToday, false) };
		}
		case '24h':
			return { from: new Date(now - 86_400_000).toISOString() };
		case '7d':
			return { from: new Date(now - 7 * 86_400_000).toISOString() };
		case '30d':
			return { from: new Date(now - 30 * 86_400_000).toISOString() };
		case 'exact':
			return { from: f.fromIso || undefined, to: f.toIso || undefined };
		case 'custom':
			return {
				from: f.fromDate ? vnDayBoundary(f.fromDate, false) : undefined,
				to: f.toDate ? vnDayBoundary(f.toDate, true) : undefined,
			};
	}
};

function useDebounced<T>(value: T, ms = 350): T {
	const [v, setV] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setV(value), ms);
		return () => clearTimeout(t);
	}, [value, ms]);
	return v;
}

export function useActivityLogs() {
	const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
	const [rows, setRows] = useState<ActivityLog[]>([]);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState<number>(20);
	const [total, setTotal] = useState(0);
	const [totalPages, setTotalPages] = useState(1);
	const [truncated, setTruncated] = useState(false);
	const [stats, setStats] = useState<ActivityStats | null>(null);
	const [loading, setLoading] = useState(false);
	const [statsLoading, setStatsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	// Ô gõ chữ thì debounce, còn select/checkbox áp dụng ngay.
	const actor = useDebounced(filters.actor);
	const ip = useDebounced(filters.ip);
	const search = useDebounced(filters.search);

	const query = useMemo<ActivityLogFilters>(
		() => ({
			...rangeToQuery(filters),
			actor: actor.trim() || undefined,
			action: filters.action.join(',') || undefined,
			module: filters.module.join(',') || undefined,
			method: filters.method.join(',') || undefined,
			status: filters.status || undefined,
			actor_type: filters.actorType || undefined,
			ip: ip.trim() || undefined,
			search: search.trim() || undefined,
			min_duration: filters.minDuration ? Number(filters.minDuration) : undefined,
			exclude_views: filters.excludeViews ? '1' : undefined,
		}),
		// refreshKey: "Làm mới" phải tính lại mốc thời gian tương đối (24h qua...).
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[
			filters.range,
			filters.fromDate,
			filters.toDate,
			filters.fromIso,
			filters.toIso,
			filters.action,
			filters.module,
			filters.method,
			filters.status,
			filters.actorType,
			filters.minDuration,
			filters.excludeViews,
			actor,
			ip,
			search,
			refreshKey,
		],
	);

	// Đổi bộ lọc → quay về trang 1 (điều chỉnh state ngay trong render, tránh
	// gọi API 2 lần: 1 lần với trang cũ, 1 lần với trang 1).
	const [prevQuery, setPrevQuery] = useState(query);
	if (prevQuery !== query) {
		setPrevQuery(query);
		if (page !== 1) setPage(1);
	}

	useEffect(() => {
		let cancelled = false;
		queueMicrotask(async () => {
			if (cancelled) return;
			setLoading(true);
			setError(null);
			try {
				const res = await getActivityLogs({ ...query, page, limit: pageSize });
				if (cancelled) return;
				setRows(res.data);
				setTotal(res.total);
				setTotalPages(res.total_pages);
				setTruncated(res.truncated);
				// Server kẹp trang về trang cuối nếu vượt quá (vd sau khi lọc hẹp lại).
				if (res.page !== page) setPage(res.page);
			} catch (e) {
				if (!cancelled) setError((e as Error)?.message || 'Không tải được nhật ký');
			} finally {
				if (!cancelled) setLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [query, page, pageSize]);

	useEffect(() => {
		let cancelled = false;
		queueMicrotask(async () => {
			if (cancelled) return;
			setStatsLoading(true);
			try {
				const res = await getActivityStats(query);
				if (!cancelled) setStats(res);
			} catch {
				if (!cancelled) setStats(null);
			} finally {
				if (!cancelled) setStatsLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [query]);

	const patch = (p: Partial<FilterState>) => setFilters((f) => ({ ...f, ...p }));

	return {
		filters,
		patch,
		reset: () => setFilters(DEFAULT_FILTERS),
		rows,
		page,
		setPage,
		pageSize,
		setPageSize: (n: number) => {
			setPageSize(n);
			setPage(1);
		},
		total,
		totalPages,
		truncated,
		stats,
		loading,
		statsLoading,
		error,
		refresh: () => setRefreshKey((k) => k + 1),
	};
}
