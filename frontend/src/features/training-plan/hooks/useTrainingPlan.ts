import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import { trainingPlanApi, type SimpleDept } from '../api/trainingPlanApi';
import type { ModalType, TrainingPlan, TrainingPlanFormData } from '../types/trainingPlan.type';

export const EMPTY_FORM: TrainingPlanFormData = {
	department_id: '',
	year: String(new Date().getFullYear()),
	title: '',
	description: '',
	status: 'draft',
	items: [],
};

const STATUS_LABEL: Record<string, string> = {
	draft: 'Nháp',
	active: 'Đang thực hiện',
	completed: 'Hoàn thành',
	cancelled: 'Đã huỷ',
};

export function useTrainingPlan() {
	const [items, setItems] = useState<TrainingPlan[]>([]);
	const [departments, setDepartments] = useState<SimpleDept[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingItem, setEditingItem] = useState<TrainingPlan | null>(null);
	const [deletingItem, setDeletingItem] = useState<TrainingPlan | null>(null);
	const [loading, setLoading] = useState(false);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('training_plan', refreshData);

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	}, []);

	useEffect(() => {
		trainingPlanApi
			.list()
			.then((res) => setItems(res.data))
			.catch(() => showToast('error', 'Không thể tải danh sách kế hoạch đào tạo'))
			.finally(() => setIsLoadingData(false));
	}, [showToast, refreshKey]);

	useEffect(() => {
		trainingPlanApi
			.getDepartments()
			.then((res) => setDepartments(res.data))
			.catch(() => {});
	}, []);

	const filtered = useMemo(() => {
		if (!search.trim()) return items;
		const q = search.toLowerCase();
		return items.filter(
			(d) =>
				d.title.toLowerCase().includes(q) ||
				(d.description ?? '').toLowerCase().includes(q) ||
				(d.department_name ?? '').toLowerCase().includes(q) ||
				String(d.year).includes(q),
		);
	}, [items, search]);

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

	const toPayload = (data: TrainingPlanFormData) => ({
		department_id: data.department_id || null,
		year: Number(data.year),
		title: data.title.trim(),
		description: data.description.trim() || null,
		status: data.status,
		items: data.items
			.filter((it) => it.title.trim())
			.map((it) => ({
				title: it.title.trim(),
				quarter: it.quarter ? Number(it.quarter) : null,
				target_count: it.target_count ? Number(it.target_count) : null,
				note: it.note.trim() || null,
			})),
	});

	const handleAdd = useCallback(
		async (data: TrainingPlanFormData) => {
			setLoading(true);
			try {
				const createdItem = await trainingPlanApi.create(toPayload(data));
				setItems((prev) => [createdItem, ...prev]);
				setModal(null);
				showToast('success', `Đã thêm kế hoạch "${createdItem.title}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Thêm thất bại');
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	const handleEdit = useCallback(
		async (data: TrainingPlanFormData) => {
			if (!editingItem) return;
			setLoading(true);
			try {
				const updated = await trainingPlanApi.update(editingItem.id, toPayload(data));
				setItems((prev) => prev.map((d) => (d.id === editingItem.id ? updated : d)));
				setModal(null);
				setEditingItem(null);
				showToast('success', `Đã cập nhật "${updated.title}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Cập nhật thất bại');
			} finally {
				setLoading(false);
			}
		},
		[editingItem, showToast],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingItem) return;
		setLoading(true);
		try {
			await trainingPlanApi.remove(deletingItem.id);
			setItems((prev) => prev.filter((d) => d.id !== deletingItem.id));
			setModal(null);
			setDeletingItem(null);
			showToast('success', `Đã xoá "${deletingItem.title}"`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingItem, showToast]);

	const handleBulkDelete = useCallback(
		async (ids: string[]) => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, (id) => trainingPlanApi.remove(id));
				setItems((prev) => prev.filter((d) => !okIds.has(d.id)));
				setModal(null);
				showToast(
					failedCount ? 'error' : 'success',
					bulkToast('xoá', okIds.size, failedCount, 'kế hoạch'),
				);
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	return {
		items,
		departments,
		isLoadingData,
		search,
		modal,
		editingItem,
		deletingItem,
		loading,
		toast,
		pageSize,
		page,
		filtered,
		totalPages,
		safePage,
		paged,
		statusLabel: STATUS_LABEL,
		setModal,
		setEditingItem,
		setDeletingItem,
		setPage,
		handleSearch,
		handlePageSize,
		handleAdd,
		handleEdit,
		handleDelete,
		handleBulkDelete,
	};
}
