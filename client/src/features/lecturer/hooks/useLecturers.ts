import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import {
	createLecturer,
	deleteLecturer,
	getLecturers,
	updateLecturer,
} from '../api/lecturerApi';
import { EMPTY_FORM, type Lecturer, type LecturerFormData, type ModalType } from '../types/lecturer.type';

export function useLecturers() {
	const [lecturers, setLecturers] = useState<Lecturer[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingLecturer, setEditingLecturer] = useState<Lecturer | null>(null);
	const [deletingLecturer, setDeletingLecturer] = useState<Lecturer | null>(null);
	const [loading, setLoading] = useState(false);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((prev) => prev + 1), []);
	useRealtimeUpdate('lecturer', refreshData);

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	}, []);

	useEffect(() => {
		getLecturers()
			.then((res) => setLecturers(res.data))
			.catch(() => showToast('error', 'Không thể tải danh sách giảng viên'))
			.finally(() => setIsLoadingData(false));
	}, [showToast, refreshKey]);

	const filtered = useMemo(() => {
		if (!search.trim()) return lecturers;
		const q = search.toLowerCase();
		return lecturers.filter(
			(l) =>
				l.full_name.toLowerCase().includes(q) ||
				(l.specialty ?? '').toLowerCase().includes(q) ||
				(l.email ?? '').toLowerCase().includes(q),
		);
	}, [lecturers, search]);

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
		async (data: LecturerFormData) => {
			setLoading(true);
			try {
				const created = await createLecturer(data);
				setLecturers((prev) => [created, ...prev]);
				setModal(null);
				showToast('success', `Đã thêm "${created.full_name}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Thêm thất bại');
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	const handleEdit = useCallback(
		async (data: LecturerFormData) => {
			if (!editingLecturer) return;
			setLoading(true);
			try {
				const updated = await updateLecturer(editingLecturer.id, data);
				setLecturers((prev) => prev.map((l) => (l.id === editingLecturer.id ? updated : l)));
				setModal(null);
				setEditingLecturer(null);
				showToast('success', `Đã cập nhật "${updated.full_name}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Cập nhật thất bại');
			} finally {
				setLoading(false);
			}
		},
		[editingLecturer, showToast],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingLecturer) return;
		setLoading(true);
		try {
			await deleteLecturer(deletingLecturer.id);
			setLecturers((prev) => prev.filter((l) => l.id !== deletingLecturer.id));
			setModal(null);
			setDeletingLecturer(null);
			showToast('success', `Đã xoá "${deletingLecturer.full_name}"`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingLecturer, showToast]);

	const handleBulkDelete = useCallback(
		async (ids: string[]) => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, deleteLecturer);
				setLecturers((prev) => prev.filter((l) => !okIds.has(l.id)));
				setModal(null);
				showToast(failedCount ? 'error' : 'success', bulkToast('xoá', okIds.size, failedCount, 'giảng viên'));
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	return {
		lecturers,
		isLoadingData,
		search,
		modal,
		editingLecturer,
		deletingLecturer,
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
		setEditingLecturer,
		setDeletingLecturer,
		setPage,
		handleSearch,
		handlePageSize,
		handleAdd,
		handleEdit,
		handleDelete,
		handleBulkDelete,
	};
}
