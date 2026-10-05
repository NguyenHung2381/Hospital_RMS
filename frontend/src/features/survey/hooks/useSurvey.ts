import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { publicUrl } from '../../../shared/utils/publicUrl';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import { surveyApi, type SimpleRole } from '../api/surveyApi';
import type { ModalType, Survey, SurveyFormData, SurveyResults } from '../types/survey.type';

export const EMPTY_FORM: SurveyFormData = {
	title: '',
	description: '',
	status: 'draft',
	target_role: '',
	questions: [],
};

const STATUS_LABEL: Record<string, string> = {
	draft: 'Nháp',
	active: 'Đang mở',
	closed: 'Đã đóng',
};

export function useSurvey() {
	const [items, setItems] = useState<Survey[]>([]);
	const [roles, setRoles] = useState<SimpleRole[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingItem, setEditingItem] = useState<Survey | null>(null);
	const [deletingItem, setDeletingItem] = useState<Survey | null>(null);
	const [results, setResults] = useState<SurveyResults | null>(null);
	const [loading, setLoading] = useState(false);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('survey', refreshData);

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	}, []);

	useEffect(() => {
		surveyApi
			.list()
			.then((res) => setItems(res.data))
			.catch(() => showToast('error', 'Không thể tải danh sách khảo sát'))
			.finally(() => setIsLoadingData(false));
	}, [showToast, refreshKey]);

	useEffect(() => {
		surveyApi
			.getRoles()
			.then((res) => setRoles(res.data))
			.catch(() => {});
	}, []);

	const filtered = useMemo(() => {
		if (!search.trim()) return items;
		const q = search.toLowerCase();
		return items.filter(
			(d) =>
				d.title.toLowerCase().includes(q) || (d.description ?? '').toLowerCase().includes(q),
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

	const toPayload = (data: SurveyFormData) => ({
		title: data.title.trim(),
		description: data.description.trim() || null,
		status: data.status,
		target_role: data.target_role || null,
		questions: data.questions
			.filter((q) => q.question_text.trim())
			.map((q) => ({
				question_text: q.question_text.trim(),
				question_type: q.question_type,
				options: q.question_type === 'text' ? [] : q.options.filter((o) => o.trim()),
			})),
	});

	const handleAdd = useCallback(
		async (data: SurveyFormData) => {
			setLoading(true);
			try {
				const createdItem = await surveyApi.create(toPayload(data));
				setItems((prev) => [createdItem, ...prev]);
				setModal(null);
				showToast('success', `Đã tạo khảo sát "${createdItem.title}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Tạo thất bại');
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	const handleEdit = useCallback(
		async (data: SurveyFormData) => {
			if (!editingItem) return;
			setLoading(true);
			try {
				const updated = await surveyApi.update(editingItem.id, toPayload(data));
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
			await surveyApi.remove(deletingItem.id);
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
				const { okIds, failedCount } = await runBulk(ids, (id) => surveyApi.remove(id));
				setItems((prev) => prev.filter((d) => !okIds.has(d.id)));
				setModal(null);
				showToast(
					failedCount ? 'error' : 'success',
					bulkToast('xoá', okIds.size, failedCount, 'khảo sát'),
				);
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	const openResults = useCallback(
		async (survey: Survey) => {
			setModal('results');
			setResults(null);
			try {
				setResults(await surveyApi.getResults(survey.id));
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Không thể tải kết quả');
				setModal(null);
			}
		},
		[showToast],
	);

	const copyRespondLink = useCallback(
		async (survey: Survey) => {
			const link = publicUrl(`/user/khao-sat/${survey.id}`);
			try {
				await navigator.clipboard.writeText(link);
				showToast(
					'success',
					survey.status === 'active'
						? 'Đã sao chép link khảo sát'
						: 'Đã sao chép link — khảo sát chưa ở trạng thái "Đang mở" nên người dùng chưa trả lời được',
				);
			} catch {
				showToast('error', `Không sao chép được, link: ${link}`);
			}
		},
		[showToast],
	);

	return {
		items,
		roles,
		isLoadingData,
		search,
		modal,
		editingItem,
		deletingItem,
		results,
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
		openResults,
		copyRespondLink,
	};
}
