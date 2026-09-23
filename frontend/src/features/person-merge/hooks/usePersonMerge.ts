import { useCallback, useEffect, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import {
	getMergeCandidates,
	getMergeStats,
	mergeCandidate,
	rejectCandidate,
	reopenCandidate,
} from '../api/personMergeApi';
import type {
	FieldChoice,
	MergeCandidate,
	MergeReason,
	MergeStats,
	MergeStatus,
	Side,
} from '../types/personMerge.type';

export function usePersonMerge() {
	const [status, setStatus] = useState<MergeStatus>('PENDING');
	const [reason, setReason] = useState<MergeReason | ''>('');
	const [search, setSearch] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [page, setPage] = useState(1);
	const [pageSize] = useState(20);

	const [rows, setRows] = useState<MergeCandidate[]>([]);
	const [total, setTotal] = useState(0);
	const [stats, setStats] = useState<MergeStats | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [refreshKey, setRefreshKey] = useState(0);

	const [openId, setOpenId] = useState<number | null>(null);
	const [busy, setBusy] = useState(false);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3500);
	}, []);

	const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('person_merge', refresh);

	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(t);
	}, [search]);

	useEffect(() => {
		const controller = new AbortController();
		void (async () => {
			setIsLoading(true);
			try {
				const res = await getMergeCandidates({
					status,
					reason: reason || undefined,
					search: debouncedSearch || undefined,
					page,
					limit: pageSize,
				});
				if (controller.signal.aborted) return;
				setRows(res.data);
				setTotal(res.pagination.total);
				const lastPage = Math.max(1, Math.ceil(res.pagination.total / pageSize));
				if (page > lastPage) setPage(lastPage);
			} catch (e) {
				if (!controller.signal.aborted) {
					showToast('error', e instanceof Error ? e.message : 'Không thể tải danh sách');
				}
			} finally {
				if (!controller.signal.aborted) setIsLoading(false);
			}
		})();
		return () => controller.abort();
	}, [status, reason, debouncedSearch, page, pageSize, refreshKey, showToast]);

	useEffect(() => {
		void getMergeStats()
			.then(setStats)
			.catch(() => setStats(null));
	}, [refreshKey]);

	const changeStatus = useCallback((s: MergeStatus) => {
		setStatus(s);
		setPage(1);
	}, []);
	const changeReason = useCallback((r: MergeReason | '') => {
		setReason(r);
		setPage(1);
	}, []);
	const changeSearch = useCallback((v: string) => {
		setSearch(v);
		setPage(1);
	}, []);

	// Mọi thao tác ghi: khoá nút trong lúc chạy, báo kết quả, tải lại danh sách + số đếm.
	const run = useCallback(
		async (fn: () => Promise<string>, close = true) => {
			setBusy(true);
			try {
				const msg = await fn();
				showToast('success', msg);
				if (close) setOpenId(null);
				refresh();
				return true;
			} catch (e) {
				showToast('error', e instanceof Error ? e.message : 'Thao tác thất bại');
				refresh(); // dữ liệu có thể đã đổi (vd. đã được người khác xử lý)
				return false;
			} finally {
				setBusy(false);
			}
		},
		[refresh, showToast],
	);

	const doMerge = useCallback(
		(id: number, keep: Side, fields: FieldChoice, note?: string) =>
			run(async () => {
				const r = await mergeCandidate(id, { keep, fields, note: note || undefined });
				const n = Object.values(r.moved).reduce((a, b) => a + b, 0);
				return `Đã gộp hồ sơ (chuyển ${n} bản ghi liên quan)`;
			}),
		[run],
	);
	const doReject = useCallback(
		(id: number, note?: string) =>
			run(async () => {
				await rejectCandidate(id, note || undefined);
				return 'Đã đánh dấu không phải cùng một người';
			}),
		[run],
	);
	const doReopen = useCallback(
		(id: number) =>
			run(async () => {
				await reopenCandidate(id);
				return 'Đã đưa lại vào hàng đợi';
			}),
		[run],
	);

	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	return {
		status,
		reason,
		search,
		page,
		pageSize,
		rows,
		total,
		totalPages,
		stats,
		isLoading,
		openId,
		busy,
		toast,
		setPage,
		setOpenId,
		changeStatus,
		changeReason,
		changeSearch,
		doMerge,
		doReject,
		doReopen,
	};
}
