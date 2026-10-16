import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { showToast } from '@/shared/utils/feedback';
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
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('training_plan', refreshData);

	useEffect(() => {
		trainingPlanApi
			.list()
			.then((res) => setItems(res.data))
			.catch(() => showToast('error', 'Không thể tải danh sách kế hoạch đào tạo'))
			.finally(() => setIsLoadingData(false));
	}, [refreshKey]);

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

	const { page, setPage, pageSize, handlePageSize, totalPages, safePage, paged } =
		useClientPaging(filtered);

	const handleSearch = useCallback((v: string) => {
		setSearch(v);
		setPage(1);
	}, [setPage]);


	const toPayload = (data: TrainingPlanFormData) => ({
		department_id: data.department_id || null,
		year: Number(data.year),
		title: data.title.trim(),
		description: data.description.trim() || null,
		status: data.status,
		items: data.items
			.filter((it) => it.title.trim())
			.map((it) => ({
				id: it.id,
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
		[],
	);

	const handleEdit = useCallback(
		async (data: TrainingPlanFormData) => {
			if (!editingItem) return;
			setLoading(true);
			try {
				const updated = await trainingPlanApi.update(editingItem.id, toPayload(data));
				setItems((prev) => prev.map((d) => (d.id === editingItem.id ? { ...d, ...updated } : d)));
				refreshData();
				setModal(null);
				setEditingItem(null);
				showToast('success', `Đã cập nhật "${updated.title}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Cập nhật thất bại');
			} finally {
				setLoading(false);
			}
		},
		[editingItem, refreshData],
	);

	// Danh sách không kèm hạng mục → phải tải chi tiết trước khi sửa, nếu không lưu sẽ xoá hết hạng mục
	const openEdit = useCallback(async (plan: TrainingPlan) => {
		try {
			setEditingItem(await trainingPlanApi.getById(plan.id));
			setModal('edit');
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Không thể tải kế hoạch');
		}
	}, []);

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
	}, [deletingItem]);

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
		[],
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
		openEdit,
		refreshData,
		handleDelete,
		handleBulkDelete,
	};
}
