import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../shared/api/axios';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import {
	createTrainingProgram,
	deleteTrainingProgram,
	getTrainingPrograms,
	updateTrainingProgram,
} from '../api/trainingProgramApi';
import {
	EMPTY_FORM,
	type ModalType,
	type TrainingProgram,
	type TrainingProgramFormData,
} from '../types/trainingProgram.type';

export interface SimpleItem {
	id: string;
	name: string;
}

export function useTrainingPrograms() {
	const [programs, setPrograms] = useState<TrainingProgram[]>([]);
	const [departments, setDepartments] = useState<SimpleItem[]>([]);
	const [traineeTypes, setTraineeTypes] = useState<SimpleItem[]>([]);
	const [trainingTypes, setTrainingTypes] = useState<SimpleItem[]>([]);
	const [subjects, setSubjects] = useState<SimpleItem[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingProgram, setEditingProgram] = useState<TrainingProgram | null>(null);
	const [deletingProgram, setDeletingProgram] = useState<TrainingProgram | null>(null);
	const [loading, setLoading] = useState(false);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((prev) => prev + 1), []);
	useRealtimeUpdate('training_program', refreshData);

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	}, []);

	useEffect(() => {
		getTrainingPrograms()
			.then((res) => setPrograms(res.data))
			.catch(() => showToast('error', 'Không thể tải danh sách chương trình đào tạo'))
			.finally(() => setIsLoadingData(false));
	}, [showToast, refreshKey]);

	useEffect(() => {
		apiClient.get<{ data: SimpleItem[] }>('/departments?limit=0').then((r) => setDepartments(r.data)).catch(() => {});
		apiClient.get<{ data: SimpleItem[] }>('/trainee-types?limit=0').then((r) => setTraineeTypes(r.data)).catch(() => {});
		apiClient.get<{ data: SimpleItem[] }>('/training-types?limit=0').then((r) => setTrainingTypes(r.data)).catch(() => {});
		apiClient.get<{ data: SimpleItem[] }>('/subjects?limit=0').then((r) => setSubjects(r.data)).catch(() => {});
	}, []);

	const filtered = useMemo(() => {
		if (!search.trim()) return programs;
		const q = search.toLowerCase();
		return programs.filter(
			(p) => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q),
		);
	}, [programs, search]);

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
		async (data: TrainingProgramFormData) => {
			setLoading(true);
			try {
				const created = await createTrainingProgram(data);
				setPrograms((prev) => [created, ...prev]);
				setModal(null);
				showToast('success', `Đã thêm "${created.name}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Thêm thất bại');
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	const handleEdit = useCallback(
		async (data: TrainingProgramFormData) => {
			if (!editingProgram) return;
			setLoading(true);
			try {
				const updated = await updateTrainingProgram(editingProgram.id, data);
				setPrograms((prev) => prev.map((p) => (p.id === editingProgram.id ? updated : p)));
				setModal(null);
				setEditingProgram(null);
				showToast('success', `Đã cập nhật "${updated.name}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Cập nhật thất bại');
			} finally {
				setLoading(false);
			}
		},
		[editingProgram, showToast],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingProgram) return;
		setLoading(true);
		try {
			await deleteTrainingProgram(deletingProgram.id);
			setPrograms((prev) => prev.filter((p) => p.id !== deletingProgram.id));
			setModal(null);
			setDeletingProgram(null);
			showToast('success', `Đã xoá "${deletingProgram.name}"`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingProgram, showToast]);

	const handleBulkDelete = useCallback(
		async (ids: string[]) => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, deleteTrainingProgram);
				setPrograms((prev) => prev.filter((p) => !okIds.has(p.id)));
				setModal(null);
				showToast(
					failedCount ? 'error' : 'success',
					bulkToast('xoá', okIds.size, failedCount, 'chương trình'),
				);
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	return {
		programs,
		departments,
		traineeTypes,
		trainingTypes,
		subjects,
		isLoadingData,
		search,
		modal,
		editingProgram,
		deletingProgram,
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
		setEditingProgram,
		setDeletingProgram,
		setPage,
		handleSearch,
		handlePageSize,
		handleAdd,
		handleEdit,
		handleDelete,
		handleBulkDelete,
	};
}
