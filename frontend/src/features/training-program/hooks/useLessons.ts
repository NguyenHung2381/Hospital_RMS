import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { showToast } from '@/shared/utils/feedback';
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
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((prev) => prev + 1), []);
	useRealtimeUpdate('program_lesson', refreshData);

	const load = useCallback(() => {
		return getAllLessons()
			.then(setLessons)
			.catch(() => showToast('error', 'Không thể tải danh sách bài học'))
			.finally(() => setIsLoadingData(false));
	}, []);

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

	const { page, setPage, pageSize, handlePageSize, totalPages, safePage, paged } =
		useClientPaging(filtered);

	const handleSearch = useCallback((v: string) => {
		setSearch(v);
		setPage(1);
	}, [setPage]);


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
	}, [deletingLesson, load]);

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
		[load],
	);

	return {
		lessons,
		programs,
		isLoadingData,
		search,
		formModal,
		deletingLesson,
		loading,
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
