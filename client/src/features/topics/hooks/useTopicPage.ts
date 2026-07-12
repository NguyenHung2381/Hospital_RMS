import { useCallback, useEffect, useMemo, useState } from 'react';
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

type TabKey = 'all' | TopicStatus;
const PAGE_SIZE_OPTIONS = [9, 20, 50, 100] as const;

export function useTopicPage() {
	const [topics, setTopics] = useState<Topic[]>([]);
	const [categories, setCategories] = useState<SimpleItem[]>([]);
	const [levels, setLevels] = useState<SimpleItem[]>([]);
	const [rounds, setRounds] = useState<SimpleItem[]>([]);
	const [departments, setDepartments] = useState<SimpleItem[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [loadError, setLoadError] = useState('');

	const [search, setSearch] = useState('');
	const [yearFilters, setYearFilters] = useState<Set<string>>(new Set());
	const [roundFilters, setRoundFilters] = useState<Set<string>>(new Set());
	const [levelFilters, setLevelFilters] = useState<Set<string>>(new Set());
	const [catFilters, setCatFilters] = useState<Set<string>>(new Set());
	const [deptFilters, setDeptFilters] = useState<Set<string>>(new Set());
	const [activeTab, setActiveTab] = useState<TabKey>('all');
	const [page, setPage] = useState(1);
	const [rowsPerPage, setRowsPerPage] = useState<number>(PAGE_SIZE_OPTIONS[0]);

	const [showCreate, setShowCreate] = useState(false);
	const [showExport, setShowExport] = useState(false);
	const [editTopic, setEditTopic] = useState<Topic | null>(null);
	const [deleteTopic, setDeleteTopic] = useState<Topic | null>(null);
	const [viewTopic, setViewTopic] = useState<Topic | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((prev) => prev + 1), []);
	useRealtimeUpdate('topic', refreshData);

	useEffect(() => {
		Promise.all([
			getTopics({ limit: 500 }),
			getCategories(),
			getLevels(),
			getRounds(),
			getDepts(),
		])
			.then(([topicsRes, catsRes, lvlsRes, rdsRes, deptsRes]) => {
				setTopics(topicsRes.data);
				setCategories(catsRes.data);
				setLevels(lvlsRes.data);
				setRounds(rdsRes.data);
				setDepartments(deptsRes.data);
			})
			.catch((err: unknown) =>
				setLoadError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu'),
			)
			.finally(() => setIsLoadingData(false));
	}, [refreshKey]);

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
				setRoundFilters((prev) => {
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

	const stats = useMemo(
		() => ({
			total: topics.length,
			submitted: topics.filter((t) => t.status === 'submitted').length,
			approved: topics.filter((t) => t.status === 'approved').length,
			rejected: topics.filter((t) => t.status === 'rejected').length,
			supplement: topics.filter((t) => t.status === 'supplement').length,
		}),
		[topics],
	);

	const TABS: { key: TabKey; label: string; count: number }[] = [
		{ key: 'all', label: 'Tất cả', count: stats.total },
		{ key: 'submitted', label: 'Chờ duyệt', count: stats.submitted },
		{ key: 'approved', label: 'Đã duyệt', count: stats.approved },
		{ key: 'rejected', label: 'Từ chối', count: stats.rejected },
		{ key: 'supplement', label: 'Bổ sung', count: stats.supplement },
	];

	const filtered = useMemo(() => {
		return topics.filter((t) => {
			if (activeTab !== 'all' && t.status !== activeTab) return false;
			if (yearFilters.size > 0) {
				const round = rounds.find((r) => r.id === t.round_id);
				const y = round?.year ?? t.round_year;
				if (!y || !yearFilters.has(y.toString())) return false;
			}
			if (roundFilters.size > 0 && !roundFilters.has(t.round_id ?? ''))
				return false;
			if (levelFilters.size > 0 && !levelFilters.has(t.level_id ?? ''))
				return false;
			if (catFilters.size > 0 && !catFilters.has(t.category_id ?? ''))
				return false;
			if (deptFilters.size > 0 && !deptFilters.has(t.department_id ?? ''))
				return false;
			if (search) {
				const q = search.toLowerCase();
				if (
					!t.title.toLowerCase().includes(q) &&
					!t.id.toLowerCase().includes(q)
				)
					return false;
			}
			return true;
		});
	}, [
		topics,
		rounds,
		activeTab,
		yearFilters,
		roundFilters,
		levelFilters,
		catFilters,
		deptFilters,
		search,
	]);

	const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
	const safePage = Math.min(page, totalPages);
	const pageSlice = filtered.slice(
		(safePage - 1) * rowsPerPage,
		safePage * rowsPerPage,
	);
	const resetPage = () => setPage(1);

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
			setTopics((prev) => [
				{ ...created, member_count: pendingMembers.length },
				...prev,
			]);
			setShowCreate(false);
		},
		[],
	);

	const handleEdit = useCallback(
		async (form: TopicForm): Promise<void> => {
			if (!editTopic) return;
			const updated = await updateTopicApi(editTopic.id, {
				title: form.title,
				description: form.description || undefined,
				round_id: form.round_id,
				category_id: form.category_id || undefined,
				level_id: form.level_id || undefined,
				department_id: form.department_id || undefined,
				status: form.status,
			});
			setTopics((prev) =>
				prev.map((t) => (t.id === editTopic.id ? updated : t)),
			);
			setEditTopic(null);
			setViewTopic(null);
		},
		[editTopic],
	);

	const handleDelete = useCallback(async (): Promise<void> => {
		if (!deleteTopic) return;
		await deleteTopicApi(deleteTopic.id);
		setTopics((prev) => prev.filter((t) => t.id !== deleteTopic.id));
		setDeleteTopic(null);
		setViewTopic(null);
	}, [deleteTopic]);

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
		activeTab,
		page,
		rowsPerPage,
		showCreate,
		showExport,
		editTopic,
		deleteTopic,
		viewTopic,
		availableYears,
		visibleRounds,
		stats,
		TABS,
		filtered,
		totalPages,
		safePage,
		pageSlice,
		PAGE_SIZE_OPTIONS,
		setSearch,
		setYearFilters,
		setRoundFilters,
		setLevelFilters,
		setCatFilters,
		setDeptFilters,
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
		resetPage,
	};
}
