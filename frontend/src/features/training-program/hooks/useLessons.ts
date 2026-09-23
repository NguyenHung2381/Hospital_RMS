import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import { deleteLesson, getAllLessons, getTrainingPrograms } from '../api/trainingProgramApi';
import type { Lesson, TrainingProgram } from '../types/trainingProgram.type';

export function useLessons() {
	const [lessons, setLessons] = useState<Lesson[]>([]);
	const [programs, setPrograms] = useState<TrainingProgram[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [formModal, setFormModal] = useState<{ mode: 'add' | 'edit'; lesson?: Lesson } | null>(null);
	const [deletingLesson, setDeletingLesson] = useState<Lesson | null>(null);
	const [loading, setLoading] = useState(false);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((prev) => prev + 1), []);
	useRealtimeUpdate('program_lesson', refreshData);

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	}, []);

	const load = useCallback(() => {
		return getAllLessons()
			.then(setLessons)
			.catch(() => showToast('error', 'Không thể tải danh sách bài học'))
			.finally(() => setIsLoadingData(false));
	}, [showToast]);

	useEffect(() => {
		load();
	}, [load, refreshKey]);

	useEffect(() => {
		getTrainingPrograms()
			.then((res) => setPrograms(res.data))
			.catch(() => {});
	}, []);

	const filtered = useMemo(() => {
		if (!search.trim()) return lessons;
		const q = search.toLowerCase();
		return lessons.filter(
			(l) => l.title.toLowerCase().includes(q) || (l.code ?? '').toLowerCase().includes(q),
		);
	}, [lessons, search]);

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

	const handleDelete = useCallback(async () => {
		if (!deletingLesson) return;
		setLoading(true);
		try {
			await deleteLesson(deletingLesson.id);
			setDeletingLesson(null);
			showToast('success', `Đã xoá "${deletingLesson.title}"`);
			await load();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingLesson, showToast, load]);

	const handleBulkDelete = useCallback(
		async (ids: string[]) => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, deleteLesson);
				showToast(failedCount ? 'error' : 'success', bulkToast('xoá', okIds.size, failedCount, 'bài học'));
				await load();
			} finally {
				setLoading(false);
			}
		},
		[showToast, load],
	);

	return {
		lessons,
		programs,
		isLoadingData,
		search,
		formModal,
		deletingLesson,
		loading,
		toast,
		pageSize,
		page,
		filtered,
		totalPages,
		safePage,
		paged,
		setFormModal,
		setDeletingLesson,
		setPage,
		handleSearch,
		handlePageSize,
		handleDelete,
		handleBulkDelete,
		reload: load,
	};
}
