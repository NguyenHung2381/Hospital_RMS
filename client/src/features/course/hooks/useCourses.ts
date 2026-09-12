import { useCallback, useEffect, useMemo, useState } from 'react';
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
	const [courses, setCourses] = useState<Course[]>([]);
	const [programs, setPrograms] = useState<SimpleItem[]>([]);
	const [rounds, setRounds] = useState<SimpleItem[]>([]);
	const [forms, setForms] = useState<SimpleItem[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
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

	useEffect(() => {
		getCourses()
			.then((res) => setCourses(res.data))
			.catch(() => showToast('error', 'Không thể tải danh sách khóa học'))
			.finally(() => setIsLoadingData(false));
	}, [showToast, refreshKey]);

	useEffect(() => {
		apiClient.get<{ data: SimpleItem[] }>('/training-programs?limit=0').then((r) => setPrograms(r.data)).catch(() => {});
		apiClient.get<{ data: SimpleItem[] }>('/training-rounds?limit=0').then((r) => setRounds(r.data)).catch(() => {});
		apiClient.get<{ data: SimpleItem[] }>('/training-forms?limit=0').then((r) => setForms(r.data)).catch(() => {});
	}, []);

	const filtered = useMemo(() => {
		if (!search.trim()) return courses;
		const q = search.toLowerCase();
		return courses.filter((c) => c.name.toLowerCase().includes(q));
	}, [courses, search]);

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
		async (data: CourseFormData) => {
			setLoading(true);
			try {
				const created = await createCourse(data);
				setCourses((prev) => [created, ...prev]);
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
		async (data: CourseFormData) => {
			if (!editingCourse) return;
			setLoading(true);
			try {
				const updated = await updateCourse(editingCourse.id, data);
				setCourses((prev) => prev.map((c) => (c.id === editingCourse.id ? updated : c)));
				setModal(null);
				setEditingCourse(null);
				showToast('success', `Đã cập nhật "${updated.name}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Cập nhật thất bại');
			} finally {
				setLoading(false);
			}
		},
		[editingCourse, showToast],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingCourse) return;
		setLoading(true);
		try {
			await deleteCourse(deletingCourse.id);
			setCourses((prev) => prev.filter((c) => c.id !== deletingCourse.id));
			setModal(null);
			setDeletingCourse(null);
			showToast('success', `Đã xoá "${deletingCourse.name}"`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingCourse, showToast]);

	const handleBulkDelete = useCallback(
		async (ids: string[]) => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, deleteCourse);
				setCourses((prev) => prev.filter((c) => !okIds.has(c.id)));
				setModal(null);
				showToast(failedCount ? 'error' : 'success', bulkToast('xoá', okIds.size, failedCount, 'khóa học'));
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	return {
		courses,
		programs,
		rounds,
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
		filtered,
		totalPages,
		safePage,
		paged,
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
