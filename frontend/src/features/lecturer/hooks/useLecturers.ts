import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import {
	createLecturer,
	deleteLecturer,
	getLecturers,
	updateLecturer,
} from '../api/lecturerApi';
import { EMPTY_FORM, type Lecturer, type LecturerFormData, type ModalType } from '../types/lecturer.type';
import { DEFAULT_PAGE_SIZE } from '@/shared/utils/constants';

export function useLecturers() {
	// Chỉ chứa các dòng của TRANG hiện tại — server lo tìm kiếm & phân trang
	const [lecturers, setLecturers] = useState<Lecturer[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingLecturer, setEditingLecturer] = useState<Lecturer | null>(null);
	const [deletingLecturer, setDeletingLecturer] = useState<Lecturer | null>(null);
	const [loading, setLoading] = useState(false);
	const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((prev) => prev + 1), []);
	useRealtimeUpdate('lecturer', refreshData);

	// Debounce ô tìm kiếm 300ms rồi mới gọi API
	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(t);
	}, [search]);

	useEffect(() => {
		const controller = new AbortController();
		void (async () => {
			setIsLoadingData(true);
			try {
				const res = await getLecturers({
					page,
					limit: pageSize,
					search: debouncedSearch || undefined,
					active_only: false,
				});
				if (controller.signal.aborted) return;
				setLecturers(res.data);
				setTotal(res.pagination.total);
				// Trang hiện tại vượt quá số trang thực tế (vd. vừa xoá/đổi tìm kiếm) — về trang 1
				const lastPage = pageSize === 0 ? 1 : Math.max(1, Math.ceil(res.pagination.total / pageSize));
				if (page > lastPage) setPage(1);
			} catch {
				if (!controller.signal.aborted) showToast('error', 'Không thể tải danh sách giảng viên');
			} finally {
				if (!controller.signal.aborted) setIsLoadingData(false);
			}
		})();
		return () => controller.abort();
	}, [page, pageSize, debouncedSearch, refreshKey]);

	const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
	const safePage = Math.min(page, totalPages);

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
				setModal(null);
				showToast('success', `Đã thêm "${created.full_name}"`);
				refreshData();
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Thêm thất bại');
			} finally {
				setLoading(false);
			}
		},
		[refreshData],
	);

	const handleEdit = useCallback(
		async (data: LecturerFormData) => {
			if (!editingLecturer) return;
			setLoading(true);
			try {
				const updated = await updateLecturer(editingLecturer.id, data);
				setModal(null);
				setEditingLecturer(null);
				showToast('success', `Đã cập nhật "${updated.full_name}"`);
				refreshData();
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Cập nhật thất bại');
			} finally {
				setLoading(false);
			}
		},
		[editingLecturer, refreshData],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingLecturer) return;
		setLoading(true);
		try {
			await deleteLecturer(deletingLecturer.id);
			setModal(null);
			setDeletingLecturer(null);
			showToast('success', `Đã xoá "${deletingLecturer.full_name}"`);
			refreshData();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingLecturer, refreshData]);

	const handleBulkDelete = useCallback(
		async (ids: string[]) => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, deleteLecturer);
				setModal(null);
				showToast(failedCount ? 'error' : 'success', bulkToast('xoá', okIds.size, failedCount, 'giảng viên'));
				refreshData();
			} finally {
				setLoading(false);
			}
		},
		[refreshData],
	);

	return {
		lecturers,
		isLoadingData,
		search,
		modal,
		editingLecturer,
		deletingLecturer,
		loading,
		pageSize,
		page,
		total,
		totalPages,
		safePage,
		paged: lecturers,
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
