import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getRounds } from '../../round/api/roundApi';
import type { ResearchRound } from '../../round/types/round.type';
import {
	createCouncil,
	deleteCouncil,
	formToPayload,
	getCouncils,
	updateCouncil,
	type CouncilStats,
	type UpdateCouncilPayload,
} from '../api/councilApi';
import { sortCouncilsBySpecialty } from '../utils/councilHelpers';
import type {
	Council,
	CouncilForm,
	CouncilStatus,
	ModalType,
} from '../types/council.type';

const EMPTY_STATS: CouncilStats = { total: 0, draft: 0, finalized: 0, topicSum: 0 };

export function useCouncils() {
	const [councils, setCouncils] = useState<Council[]>([]);
	// Tổng quan toàn bộ hội đồng (server tính, không phụ thuộc bộ lọc round/status trên UI)
	const [stats, setStats] = useState<CouncilStats>(EMPTY_STATS);
	const [rounds, setRounds] = useState<ResearchRound[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [roundFilter, setRoundFilter] = useState<string>('all');
	const [statusFilter, setStatusFilter] = useState<CouncilStatus | 'all'>('all');
	const [modal, setModal] = useState<ModalType>(null);
	const [activeCouncil, setActiveCouncil] = useState<Council | null>(null);
	const [loading, setLoading] = useState(false);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate(['council', 'topic'], refreshData);

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	}, []);

	useEffect(() => {
		getRounds({ limit: 0 })
			.then((res) => setRounds(res.data))
			.catch(() => undefined);
	}, []);

	useEffect(() => {
		getCouncils({ limit: 0 })
			.then((res) => {
				setCouncils(res.data);
				setStats(res.stats);
			})
			.catch(() => showToast('error', 'Không thể tải danh sách hội đồng'))
			.finally(() => setIsLoadingData(false));
	}, [refreshKey, showToast]);

	const filtered = useMemo(
		() => {
			const res = councils.filter((c) => {
				if (roundFilter !== 'all' && c.round_id !== roundFilter) return false;
				if (statusFilter !== 'all' && c.status !== statusFilter) return false;
				return true;
			});

			return sortCouncilsBySpecialty(res);
		},
		[councils, roundFilter, statusFilter],
	);

	const handleCreate = useCallback(
		async (form: CouncilForm) => {
			setLoading(true);
			try {
				const created = await createCouncil(formToPayload(form));
				setCouncils((prev) => [created, ...prev]);
				setModal(null);
				showToast('success', `Đã tạo "${created.name}"`);
				refreshData();
			} catch (err) {
				showToast(
					'error',
					err instanceof Error ? err.message : 'Tạo hội đồng thất bại',
				);
			} finally {
				setLoading(false);
			}
		},
		[showToast, refreshData],
	);

	const handleEdit = useCallback(
		async (form: CouncilForm) => {
			if (!activeCouncil) return;
			setLoading(true);
			try {
				const updated = await updateCouncil(activeCouncil.id, {
					...formToPayload(form),
					status: form.status,
				});
				setCouncils((prev) =>
					prev.map((c) => (c.id === updated.id ? updated : c)),
				);
				setModal(null);
				setActiveCouncil(null);
				showToast('success', `Đã cập nhật "${updated.name}"`);
				refreshData();
			} catch (err) {
				showToast(
					'error',
					err instanceof Error ? err.message : 'Cập nhật thất bại',
				);
			} finally {
				setLoading(false);
			}
		},
		[activeCouncil, showToast, refreshData],
	);

	const allSelected =
		filtered.length > 0 && filtered.every((c) => selected.has(c.id));

	const toggleSelect = useCallback((id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const toggleSelectAll = useCallback(() => {
		setSelected(allSelected ? new Set() : new Set(filtered.map((c) => c.id)));
	}, [allSelected, filtered]);

	const clearSelection = useCallback(() => setSelected(new Set()), []);

	const setManySelected = useCallback((ids: string[], on: boolean) => {
		setSelected((prev) => {
			const next = new Set(prev);
			for (const id of ids) {
				if (on) next.add(id);
				else next.delete(id);
			}
			return next;
		});
	}, []);

	// ponytail: chưa có bulk API — gọi từng endpoint, đủ với ≤200 hội đồng; thêm endpoint bulk nếu chậm
	const handleBulkDelete = useCallback(async () => {
		const ids = [...selected];
		setLoading(true);
		const results = await Promise.allSettled(ids.map((id) => deleteCouncil(id)));
		const okIds = new Set(ids.filter((_, i) => results[i].status === 'fulfilled'));
		const failed = ids.length - okIds.size;
		setCouncils((prev) => prev.filter((c) => !okIds.has(c.id)));
		setSelected(new Set());
		setModal(null);
		setLoading(false);
		showToast(
			failed ? 'error' : 'success',
			failed
				? `Đã xoá ${okIds.size} hội đồng, ${failed} lỗi`
				: `Đã xoá ${okIds.size} hội đồng`,
		);
		refreshData();
	}, [selected, showToast, refreshData]);

	const handleBulkEdit = useCallback(
		async (payload: UpdateCouncilPayload) => {
			const ids = [...selected];
			setLoading(true);
			const results = await Promise.allSettled(
				ids.map((id) => updateCouncil(id, payload)),
			);
			const updated = new Map(
				results
					.filter((r): r is PromiseFulfilledResult<Council> => r.status === 'fulfilled')
					.map((r) => [r.value.id, r.value]),
			);
			const failed = ids.length - updated.size;
			setCouncils((prev) => prev.map((c) => updated.get(c.id) ?? c));
			setSelected(new Set());
			setModal(null);
			setLoading(false);
			showToast(
				failed ? 'error' : 'success',
				failed
					? `Đã cập nhật ${updated.size} hội đồng, ${failed} lỗi`
					: `Đã cập nhật ${updated.size} hội đồng`,
			);
			refreshData();
		},
		[selected, showToast, refreshData],
	);

	const handleDelete = useCallback(async () => {
		if (!activeCouncil) return;
		setLoading(true);
		try {
			await deleteCouncil(activeCouncil.id);
			setCouncils((prev) => prev.filter((c) => c.id !== activeCouncil.id));
			setModal(null);
			setActiveCouncil(null);
			showToast('success', `Đã xoá "${activeCouncil.name}"`);
			refreshData();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [activeCouncil, showToast, refreshData]);

	return {
		councils: filtered,
		allCouncils: councils,
		rounds,
		isLoadingData,
		roundFilter,
		statusFilter,
		modal,
		activeCouncil,
		loading,
		toast,
		stats,
		setRoundFilter,
		setStatusFilter,
		setModal,
		setActiveCouncil,
		showToast,
		refreshData,
		handleCreate,
		handleEdit,
		handleDelete,
		selected,
		allSelected,
		toggleSelect,
		toggleSelectAll,
		setManySelected,
		clearSelection,
		handleBulkDelete,
		handleBulkEdit,
	};
}
