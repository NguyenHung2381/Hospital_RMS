import { useEffect, useState } from 'react';
import { getActivityLogs, type ActivityLog } from '../api/activityLogApi';

const LIMIT = 50;

export function useActivityLogs() {
	const [rows, setRows] = useState<ActivityLog[]>([]);
	const [cursor, setCursor] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(true);
	const [method, setMethod] = useState('');
	const [search, setSearch] = useState('');
	const [loading, setLoading] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);

	// Đổi filter → nạp lại từ đầu (keyset pagination, không có khái niệm "trang N").
	useEffect(() => {
		let cancelled = false;
		queueMicrotask(async () => {
			if (cancelled) return;
			setLoading(true);
			try {
				const res = await getActivityLogs({
					limit: LIMIT,
					method: method || undefined,
					search: search || undefined,
				});
				if (cancelled) return;
				setRows(res.data);
				setCursor(res.next_cursor);
				setHasMore(!!res.next_cursor);
			} catch {
				// ignore
			} finally {
				if (!cancelled) setLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [method, search, refreshKey]);

	const loadMore = async () => {
		if (!cursor || loadingMore) return;
		setLoadingMore(true);
		try {
			const res = await getActivityLogs({
				limit: LIMIT,
				cursor,
				method: method || undefined,
				search: search || undefined,
			});
			setRows((prev) => [...prev, ...res.data]);
			setCursor(res.next_cursor);
			setHasMore(!!res.next_cursor);
		} catch {
			// ignore
		} finally {
			setLoadingMore(false);
		}
	};

	return {
		rows,
		hasMore,
		method,
		setMethod,
		search,
		setSearch,
		loading,
		loadingMore,
		loadMore,
		refresh: () => setRefreshKey((k) => k + 1),
	};
}
