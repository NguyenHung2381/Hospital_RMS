import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../shared/api/axios';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import { createCourse, deleteCourse, getCourses, updateCourse } from '../api/courseApi';
import { EMPTY_FORM, type Course, type CourseFormData, type ModalType } from '../types/course.type';

export interface SimpleItem {
	id: string;
	name: string;
}

export function useCourses() {
	// Chỉ chứa các dòng của TRANG hiện tại — server lo tìm kiếm & phân trang
	const [courses, setCourses] = useState<Course[]>([]);
	const [total, setTotal] = useState(0);
	const [programs, setPrograms] = useState<SimpleItem[]>([]);
	const [forms, setForms] = useState<SimpleItem[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingCourse, setEditingCourse] = useState<Course | null>(null);
	const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);
	const [detailCourse, setDetailCourse] = useState<Course | null>(null);
	const [loading, setLoading] = useState(false);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((prev) => prev + 1), []);
	useRealtimeUpdate('course', refreshData);

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	}, []);

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
				const res = await getCourses({ page, limit: pageSize, search: debouncedSearch || undefined });
				if (controller.signal.aborted) return;
				setCourses(res.data);
				setTotal(res.pagination.total);
				const lastPage = pageSize === 0 ? 1 : Math.max(1, Math.ceil(res.pagination.total / pageSize));
				if (page > lastPage) setPage(1);
			} catch {
				if (!controller.signal.aborted) showToast('error', 'Không thể tải danh sách khóa học');
			} finally {
				if (!controller.signal.aborted) setIsLoadingData(false);
			}
		})();
		return () => controller.abort();
	}, [page, pageSize, debouncedSearch, refreshKey, showToast]);

	useEffect(() => {
		apiClient.get<{ data: SimpleItem[] }>('/training-programs?limit=0').then((r) => setPrograms(r.data)).catch(() => {});
		apiClient.get<{ data: SimpleItem[] }>('/training-forms?limit=0').then((r) => setForms(r.data)).catch(() => {});
	}, []);

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
		async (data: CourseFormData) => {
			setLoading(true);
			try {
				const created = await createCourse(data);
				setModal(null);
				showToast('success', `Đã thêm "${created.name}"`);
				refreshData();
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Thêm thất bại');
			} finally {
				setLoading(false);
			}
		},
		[showToast, refreshData],
	);

	const handleEdit = useCallback(
		async (data: CourseFormData) => {
			if (!editingCourse) return;
			setLoading(true);
			try {
				const updated = await updateCourse(editingCourse.id, data);
				setModal(null);
				setEditingCourse(null);
				showToast('success', `Đã cập nhật "${updated.name}"`);
				refreshData();
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Cập nhật thất bại');
			} finally {
				setLoading(false);
			}
		},
		[editingCourse, showToast, refreshData],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingCourse) return;
		setLoading(true);
		try {
			await deleteCourse(deletingCourse.id);
			setModal(null);
			setDeletingCourse(null);
			showToast('success', `Đã xoá "${deletingCourse.name}"`);
			refreshData();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingCourse, showToast, refreshData]);

	const handleBulkDelete = useCallback(
		async (ids: string[]) => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, deleteCourse);
				setModal(null);
				showToast(failedCount ? 'error' : 'success', bulkToast('xoá', okIds.size, failedCount, 'khóa học'));
				refreshData();
			} finally {
				setLoading(false);
			}
		},
		[showToast, refreshData],
	);

	return {
		courses,
		programs,
		forms,
		isLoadingData,
		search,
		modal,
		editingCourse,
		deletingCourse,
		detailCourse,
		loading,
		toast,
		pageSize,
		page,
		total,
		totalPages,
		safePage,
		paged: courses,
		EMPTY_FORM,
		setModal,
		setEditingCourse,
		setDeletingCourse,
		setDetailCourse,
		setPage,
		handleSearch,
		handlePageSize,
		handleAdd,
		handleEdit,
		handleDelete,
		handleBulkDelete,
	};
}
