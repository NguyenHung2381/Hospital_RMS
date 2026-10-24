import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import { createCourse, deleteCourse, getCourses, updateCourse } from '../api/courseApi';
import { EMPTY_FORM, TRAINING_TYPE, type Course, type CourseFormData, type ModalType } from '../types/course.type';
import { DEFAULT_PAGE_SIZE } from '@/shared/utils/constants';

/** Lọc theo tab loại khóa; tab "Tất cả" ('') bỏ đợt GPHN — GPHN làm việc ở trang Hồ sơ thực hành GPHN. */
export const courseTypeFilter = (trainingTypeId: string) =>
	trainingTypeId ? { training_type_id: trainingTypeId } : { exclude_training_type_id: TRAINING_TYPE.GPHN };

/** trainingTypeId: lọc theo loại khóa (tab), '' = tất cả trừ GPHN. */
export function useCourses(trainingTypeId = '') {
	// Chỉ chứa các dòng của TRANG hiện tại — server lo tìm kiếm & phân trang
	const [courses, setCourses] = useState<Course[]>([]);
	const [total, setTotal] = useState(0);
	const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingCourse, setEditingCourse] = useState<Course | null>(null);
	const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);
	const [loading, setLoading] = useState(false);
	const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((prev) => prev + 1), []);
	useRealtimeUpdate('course', refreshData);

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
				const res = await getCourses({
					page,
					limit: pageSize,
					search: debouncedSearch || undefined,
					...courseTypeFilter(trainingTypeId),
				});
				if (controller.signal.aborted) return;
				setCourses(res.data);
				setTotal(res.pagination.total);
				const counts = res.type_counts ?? {};
				// Tab "Tất cả" không gồm đợt GPHN (quản lý ở trang Hồ sơ thực hành GPHN)
				setTypeCounts({ ...counts, '': (counts[''] ?? 0) - (counts[TRAINING_TYPE.GPHN] ?? 0) });
				const lastPage = pageSize === 0 ? 1 : Math.max(1, Math.ceil(res.pagination.total / pageSize));
				if (page > lastPage) setPage(1);
			} catch {
				if (!controller.signal.aborted) showToast('error', 'Không thể tải danh sách khóa học');
			} finally {
				if (!controller.signal.aborted) setIsLoadingData(false);
			}
		})();
		return () => controller.abort();
	}, [page, pageSize, debouncedSearch, trainingTypeId, refreshKey]);

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
		[refreshData],
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
		[editingCourse, refreshData],
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
	}, [deletingCourse, refreshData]);

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
		[refreshData],
	);

	// Id toàn bộ bản ghi khớp từ khoá (mọi trang, limit=0) — cho nút "Xoá tất cả"
	const fetchAllIds = useCallback(
		async () =>
			(
				await getCourses({ search: debouncedSearch || undefined, ...courseTypeFilter(trainingTypeId) })
			).data.map((x) => x.id),
		[debouncedSearch, trainingTypeId],
	);

	return {
		refreshData,
		courses,
		fetchAllIds,
		isLoadingData,
		search,
		modal,
		editingCourse,
		deletingCourse,
		loading,
		pageSize,
		page,
		total,
		typeCounts,
		totalPages,
		safePage,
		paged: courses,
		EMPTY_FORM,
		setModal,
		setEditingCourse,
		setDeletingCourse,
		setPage,
		handleSearch,
		handlePageSize,
		handleAdd,
		handleEdit,
		handleDelete,
		handleBulkDelete,
	};
}
