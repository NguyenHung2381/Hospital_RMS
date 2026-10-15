import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import {
	addTopicMember,
	createTopic,
	deleteTopic as deleteTopicApi,
	getCategories,
	getDepts,
	getLevels,
	getRounds,
	getTopics,
	updateTopic as updateTopicApi,
	type SimpleItem,
} from '../api/topicApi';
import type { PendingMember } from '../components/TopicModal';
import type { Topic, TopicForm, TopicStatus } from '../types/topic.type';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import { notify } from '../../../shared/utils/feedback';
import type { UpdateTopicPayload } from '../api/topicApi';
import { DEFAULT_PAGE_SIZE } from '@/shared/utils/constants';

export type TopicBulkPatch = Pick<
	UpdateTopicPayload,
	'status' | 'category_id' | 'level_id' | 'department_id'
>;

type TabKey = 'all' | TopicStatus;

const EMPTY_STATS = {
	total: 0,
	submitted: 0,
	approved: 0,
	rejected: 0,
	supplement: 0,
};

// Set bộ lọc → "a,b,c" cho query string; rỗng → undefined (bỏ khỏi query)
const joinSet = (s: Set<string>) => (s.size ? Array.from(s).join(',') : undefined);

export function useTopicPage() {
	// Chỉ chứa các dòng của TRANG hiện tại — server lo lọc & phân trang
	const [topics, setTopics] = useState<Topic[]>([]);
	const [total, setTotal] = useState(0);
	const [stats, setStats] = useState<typeof EMPTY_STATS>(EMPTY_STATS);
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [categories, setCategories] = useState<SimpleItem[]>([]);
	const [levels, setLevels] = useState<SimpleItem[]>([]);
	const [rounds, setRounds] = useState<SimpleItem[]>([]);
	const [departments, setDepartments] = useState<SimpleItem[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [loadError, setLoadError] = useState('');

	const [search, setSearch] = useState('');
	const [yearFilters, setYearFilters] = useState<Set<string>>(new Set());
	const [roundFilters, setRoundFiltersRaw] = useState<Set<string>>(new Set());
	const [levelFilters, setLevelFilters] = useState<Set<string>>(new Set());
	const [catFilters, setCatFilters] = useState<Set<string>>(new Set());
	const [deptFilters, setDeptFilters] = useState<Set<string>>(new Set());
	const [articleTypeFilters, setArticleTypeFilters] = useState<Set<string>>(
		new Set(),
	);
	const [activeTab, setActiveTab] = useState<TabKey>('all');
	const [page, setPage] = useState(1);
	const [rowsPerPage, setRowsPerPageRaw] = useState<number>(DEFAULT_PAGE_SIZE);

	// Đổi số dòng/trang → về trang 1, tránh đứng ở trang không còn tồn tại
	const setRowsPerPage = useCallback((n: number) => {
		setRowsPerPageRaw(n);
		setPage(1);
	}, []);


	const [showCreate, setShowCreate] = useState(false);
	const [showExport, setShowExport] = useState(false);
	const [editTopic, setEditTopic] = useState<Topic | null>(null);
	const [deleteTopic, setDeleteTopic] = useState<Topic | null>(null);
	const [viewTopic, setViewTopic] = useState<Topic | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);
	const [bulkBusy, setBulkBusy] = useState(false);
	const [bulkNotice, setBulkNotice] = useState<{
		type: 'success' | 'error';
		msg: string;
	} | null>(null);

	const refreshData = useCallback(() => setRefreshKey((prev) => prev + 1), []);
	useRealtimeUpdate('topic', refreshData);

	useEffect(() => {
		if (!bulkNotice) return;
		const t = setTimeout(() => setBulkNotice(null), 3000);
		return () => clearTimeout(t);
	}, [bulkNotice]);

	// Danh mục — tải một lần, không phụ thuộc bộ lọc
	useEffect(() => {
		Promise.all([getCategories(), getLevels(), getRounds(), getDepts()])
			.then(([catsRes, lvlsRes, rdsRes, deptsRes]) => {
				setCategories(catsRes.data);
				setLevels(lvlsRes.data);
				setRounds(rdsRes.data);
				setDepartments(deptsRes.data);
			})
			.catch(() => {
				// Không chặn danh sách đề tài nếu danh mục lỗi
			});
	}, []);

	// Debounce ô tìm kiếm 300ms rồi mới gọi API
	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(t);
	}, [search]);

	// Tham số lọc gửi lên server (Set → "a,b,c")
	const listParams = useMemo(
		() => ({
			search: debouncedSearch || undefined,
			status: activeTab === 'all' ? undefined : activeTab,
			round_id: joinSet(roundFilters),
			level_id: joinSet(levelFilters),
			category_id: joinSet(catFilters),
			department_id: joinSet(deptFilters),
			article_type: joinSet(articleTypeFilters),
			year: joinSet(yearFilters),
		}),
		[
			debouncedSearch,
			activeTab,
			roundFilters,
			levelFilters,
			catFilters,
			deptFilters,
			articleTypeFilters,
			yearFilters,
		],
	);

	// Danh sách đề tài — phân trang + lọc phía server
	useEffect(() => {
		const controller = new AbortController();
		void (async () => {
			setIsLoadingData(true);
			setLoadError('');
			try {
				const res = await getTopics({
					...listParams,
					page,
					limit: rowsPerPage,
				});
				if (controller.signal.aborted) return;
				setTopics(res.data);
				setTotal(res.pagination.total);
				setStats(res.global_stats);
				// Trang hiện tại vượt quá số trang thực tế (vd. vừa xoá) — về trang 1
				const lastPage = Math.max(
					1,
					Math.ceil(res.pagination.total / rowsPerPage),
				);
				if (page > lastPage) setPage(1);
			} catch (err: unknown) {
				if (controller.signal.aborted) return;
				setLoadError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu');
			} finally {
				if (!controller.signal.aborted) setIsLoadingData(false);
			}
		})();
		return () => controller.abort();
	}, [listParams, page, rowsPerPage, refreshKey]);

	const availableYears = useMemo(() => {
		const years = rounds
			.map((r) => r.year)
			.filter((y): y is number => y !== undefined);
		return Array.from(new Set(years)).sort((a, b) => b - a);
	}, [rounds]);

	const visibleRounds = useMemo(
		() =>
			yearFilters.size > 0
				? rounds.filter(
						(r) => r.year != null && yearFilters.has(r.year.toString()),
					)
				: rounds,
		[rounds, yearFilters],
	);

	const handleYearChange = useCallback(
		(next: Set<string>) => {
			setYearFilters(next);
			if (next.size > 0) {
				setRoundFiltersRaw((prev) => {
					const kept = new Set<string>();
					for (const id of prev) {
						const r = rounds.find((r) => r.id === id);
						if (r?.year != null && next.has(r.year.toString())) kept.add(id);
					}
					return kept;
				});
			}
			setPage(1);
		},
		[rounds],
	);

	const TABS: { key: TabKey; label: string; count: number }[] = [
		{ key: 'all', label: 'Tất cả', count: stats.total },
		{ key: 'submitted', label: 'Chờ duyệt', count: stats.submitted },
		{ key: 'approved', label: 'Đã duyệt', count: stats.approved },
		{ key: 'rejected', label: 'Từ chối', count: stats.rejected },
		{ key: 'supplement', label: 'Bổ sung', count: stats.supplement },
	];

	const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));
	const safePage = Math.min(page, totalPages);
	// Server đã lọc + cắt trang, không slice lại ở client
	const pageSlice = topics;
	const resetPage = () => setPage(1);

	// Đổi bộ lọc luôn kéo về trang 1 — nếu không sẽ đứng ở trang không còn tồn tại
	// (trước đây client tự clamp được vì giữ cả danh sách, giờ server cắt trang).
	const filterSetter =
		<T,>(set: Dispatch<SetStateAction<T>>) =>
		(v: T) => {
			set(v);
			setPage(1);
		};

	// Export cần danh sách id — lấy đúng lúc bấm xuất, không giữ cả bảng trong bộ nhớ.
	// ponytail: 1 request limit=0; nếu tập xuất lên tới hàng trăm nghìn thì chuyển
	// sang cho server tự xuất theo bộ lọc thay vì gửi mảng id.
	const fetchExportIds = useCallback(
		async (scope: 'filtered' | 'all') => {
			const res = await getTopics(
				scope === 'all' ? { limit: 0 } : { ...listParams, limit: 0 },
			);
			return res.data.map((t) => t.id);
		},
		[listParams],
	);

	const handleCreate = useCallback(
		async (form: TopicForm, pendingMembers: PendingMember[]): Promise<void> => {
			const created = await createTopic({
				title: form.title,
				description: form.description || undefined,
				round_id: form.round_id,
				category_id: form.category_id || undefined,
				level_id: form.level_id || undefined,
				department_id: form.department_id || undefined,
				status: form.status,
				article_type: form.article_type,
				journal_name: form.journal_name || undefined,
				doi: form.doi || undefined,
				publish_date: form.publish_date || undefined,
				budget_estimated: form.budget_estimated
					? Number(form.budget_estimated)
					: undefined,
			});
			if (pendingMembers.length > 0) {
				await Promise.allSettled(
					pendingMembers.map((m) =>
						addTopicMember(created.id, {
							ho_ten: m.ho_ten,
							staff_number: m.staff_number || null,
							email: m.email || undefined,
							so_dien_thoai: m.so_dien_thoai || null,
							chuc_vu: m.chuc_vu ?? null,
							department_id: m.department_id ?? null,
							role: m.role,
						}),
					),
				);
			}
			// Chỉ giữ trang hiện tại nên tải lại từ server thay vì chèn tay
			refreshData();
			setShowCreate(false);
			notify.success(`Đã thêm đề tài "${created.title}"`);
		},
		[refreshData],
	);

	const handleEdit = useCallback(
		async (form: TopicForm): Promise<void> => {
			if (!editTopic) return;
			await updateTopicApi(editTopic.id, {
				title: form.title,
				description: form.description || undefined,
				round_id: form.round_id,
				category_id: form.category_id || undefined,
				level_id: form.level_id || undefined,
				department_id: form.department_id || undefined,
				status: form.status,
				article_type: form.article_type,
				journal_name: form.journal_name || undefined,
				doi: form.doi || undefined,
				publish_date: form.publish_date || undefined,
				budget_estimated: form.budget_estimated
					? Number(form.budget_estimated)
					: undefined,
				budget_actual: form.budget_actual
					? Number(form.budget_actual)
					: undefined,
				approval_decision_no: form.approval_decision_no || undefined,
				approval_decision_date: form.approval_decision_date || undefined,
				recognition_decision_no: form.recognition_decision_no || undefined,
				recognition_decision_date: form.recognition_decision_date || undefined,
				is_featured: form.is_featured,
			});
			refreshData();
			setEditTopic(null);
			setViewTopic(null);
			notify.success('Đã cập nhật đề tài');
		},
		[editTopic, refreshData],
	);

	const handleDelete = useCallback(async (): Promise<void> => {
		if (!deleteTopic) return;
		await deleteTopicApi(deleteTopic.id);
		refreshData();
		setDeleteTopic(null);
		setViewTopic(null);
		notify.success('Đã xoá đề tài');
	}, [deleteTopic, refreshData]);

	const handleBulkDelete = useCallback(
		async (ids: string[]): Promise<void> => {
			if (!ids.length) return;
			setBulkBusy(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, deleteTopicApi);
				refreshData();
				setBulkNotice({
					type: failedCount ? 'error' : 'success',
					msg: bulkToast('xoá', okIds.size, failedCount, 'đề tài'),
				});
			} finally {
				setBulkBusy(false);
			}
		},
		[refreshData],
	);

	const handleBulkEdit = useCallback(
		async (ids: string[], patch: TopicBulkPatch): Promise<void> => {
			if (!ids.length || !Object.keys(patch).length) return;
			setBulkBusy(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, (id) =>
					updateTopicApi(id, patch),
				);
				refreshData();
				setBulkNotice({
					type: failedCount ? 'error' : 'success',
					msg: bulkToast('cập nhật', okIds.size, failedCount, 'đề tài'),
				});
			} finally {
				setBulkBusy(false);
			}
		},
		[refreshData],
	);

	return {
		topics,
		categories,
		levels,
		rounds,
		departments,
		isLoadingData,
		loadError,
		search,
		yearFilters,
		roundFilters,
		levelFilters,
		catFilters,
		deptFilters,
		articleTypeFilters,
		activeTab,
		page,
		rowsPerPage,
		showCreate,
		showExport,
		refreshData,
		editTopic,
		deleteTopic,
		viewTopic,
		availableYears,
		visibleRounds,
		stats,
		TABS,
		total,
		fetchExportIds,
		totalPages,
		safePage,
		pageSlice,
		setSearch,
		setYearFilters,
		setRoundFilters: filterSetter(setRoundFiltersRaw),
		setLevelFilters: filterSetter(setLevelFilters),
		setCatFilters: filterSetter(setCatFilters),
		setDeptFilters: filterSetter(setDeptFilters),
		setArticleTypeFilters: filterSetter(setArticleTypeFilters),
		setActiveTab,
		setPage,
		setRowsPerPage,
		setShowCreate,
		setShowExport,
		setEditTopic,
		setDeleteTopic,
		setViewTopic,
		handleYearChange,
		handleCreate,
		handleEdit,
		handleDelete,
		handleBulkDelete,
		handleBulkEdit,
		bulkBusy,
		bulkNotice,
		resetPage,
	};
}
