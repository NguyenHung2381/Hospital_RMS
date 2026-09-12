import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import {
	createTrainingRound,
	deleteTrainingRound,
	getTrainingRounds,
	updateTrainingRound,
} from '../api/trainingRoundApi';
import {
	EMPTY_FORM,
	type ModalType,
	type TrainingRound,
	type TrainingRoundFormData,
} from '../types/trainingRound.type';

export function useTrainingRounds() {
	const [rounds, setRounds] = useState<TrainingRound[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingRound, setEditingRound] = useState<TrainingRound | null>(null);
	const [deletingRound, setDeletingRound] = useState<TrainingRound | null>(null);
	const [loading, setLoading] = useState(false);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((prev) => prev + 1), []);
	useRealtimeUpdate('training_round', refreshData);

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	}, []);

	useEffect(() => {
		getTrainingRounds()
			.then((res) => setRounds(res.data))
			.catch(() => showToast('error', 'Không thể tải danh sách đợt đào tạo'))
			.finally(() => setIsLoadingData(false));
	}, [showToast, refreshKey]);

	const filtered = useMemo(() => {
		if (!search.trim()) return rounds;
		const q = search.toLowerCase();
		return rounds.filter((r) => r.name.toLowerCase().includes(q));
	}, [rounds, search]);

	const totalPages = pageSize === 0 ? 1 : Math.ceil(filtered.length / pageSize);
	const safePage = Math.min(page, totalPages || 1);

	const paged = useMemo(() => {
		if (pageSize === 0) return filtered;
		const start = (safePage - 1) * pageSize;
		return filtered.slice(start, start + pageSize);
	}, [filtered, safePage, pageSize]);

	const handleSearch = useCallback((v: string) => {
		setSearch(v);
		setPage(1);
	}, []);

	const handlePageSize = useCallback((v: number) => {
		setPageSize(v);
		setPage(1);
	}, []);

	const handleAdd = useCallback(
		async (data: TrainingRoundFormData) => {
			setLoading(true);
			try {
				const createdRound = await createTrainingRound(data);
				setRounds((prev) => [createdRound, ...prev]);
				setModal(null);
				showToast('success', `Đã thêm "${createdRound.name}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Thêm thất bại');
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	const handleEdit = useCallback(
		async (data: TrainingRoundFormData) => {
			if (!editingRound) return;
			setLoading(true);
			try {
				const updated = await updateTrainingRound(editingRound.id, data);
				setRounds((prev) => prev.map((r) => (r.id === editingRound.id ? updated : r)));
				setModal(null);
				setEditingRound(null);
				showToast('success', `Đã cập nhật "${updated.name}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Cập nhật thất bại');
			} finally {
				setLoading(false);
			}
		},
		[editingRound, showToast],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingRound) return;
		setLoading(true);
		try {
			await deleteTrainingRound(deletingRound.id);
			setRounds((prev) => prev.filter((r) => r.id !== deletingRound.id));
			setModal(null);
			setDeletingRound(null);
			showToast('success', `Đã xoá "${deletingRound.name}"`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingRound, showToast]);

	const handleBulkDelete = useCallback(
		async (ids: string[]) => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, deleteTrainingRound);
				setRounds((prev) => prev.filter((r) => !okIds.has(r.id)));
				setModal(null);
				showToast(failedCount ? 'error' : 'success', bulkToast('xoá', okIds.size, failedCount, 'đợt đào tạo'));
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	return {
		rounds,
		isLoadingData,
		search,
		modal,
		editingRound,
		deletingRound,
		loading,
		toast,
		pageSize,
		page,
		filtered,
		totalPages,
		safePage,
		paged,
		EMPTY_FORM,
		setModal,
		setEditingRound,
		setDeletingRound,
		setPage,
		handleSearch,
		handlePageSize,
		handleAdd,
		handleEdit,
		handleDelete,
		handleBulkDelete,
	};
}
