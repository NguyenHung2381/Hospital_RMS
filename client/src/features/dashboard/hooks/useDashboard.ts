import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import {
	getDepts,
	getLevels,
	getTopics,
	type SimpleItem,
} from '../../topics/api/topicApi';
import { getDashboardStats, type DashboardStats } from '../api/dashboardApi';
import {
	ROWS_PER_PAGE,
	type TabKey,
	type TopicRow,
} from '../utils/dashboardHelpers';

export interface DashboardState {
	// Stats
	stats: DashboardStats | null;
	statsLoading: boolean;
	statsError: boolean;

	// Topics table
	topics: TopicRow[];
	topicsLoading: boolean;
	topicsError: boolean;
	topicsTotal: number;

	// Filter options
	departments: SimpleItem[];
	levels: SimpleItem[];

	// Filter state
	searchInput: string;
	deptFilter: string;
	levelFilter: string;
	activeTab: TabKey;
	currentPage: number;

	// Derived
	totalPages: number;
	safePage: number;
	pieData: { name: string; value: number; key: string }[];
	deptBarData: Record<string, string | number>[];
	deptCats: string[];
	trendRows: Record<string, string | number>[];
	trendCats: string[];

	// Handlers
	handleSearchInput: (v: string) => void;
	handleTab: (tab: TabKey) => void;
	handlePageChange: (page: number) => void;
	handleFilter: (field: 'dept' | 'level', val: string) => void;
}

export function useDashboard(): DashboardState {
	// Stats
	const [stats, setStats] = useState<DashboardStats | null>(null);
	const [statsLoading, setStatsLoading] = useState(true);
	const [statsError, setStatsError] = useState(false);

	// Topics
	const [topics, setTopics] = useState<TopicRow[]>([]);
	const [topicsLoading, setTopicsLoading] = useState(true);
	const [topicsError, setTopicsError] = useState(false);
	const [topicsTotal, setTopicsTotal] = useState(0);

	// Filter options
	const [departments, setDepartments] = useState<SimpleItem[]>([]);
	const [levels, setLevels] = useState<SimpleItem[]>([]);

	// Filter state
	const [searchInput, setSearchInput] = useState('');
	const [searchTerm, setSearchTerm] = useState('');
	const [deptFilter, setDeptFilter] = useState('');
	const [levelFilter, setLevelFilter] = useState('');
	const [activeTab, setActiveTab] = useState<TabKey>('all');
	const [currentPage, setCurrentPage] = useState(1);

	// Debounce search
	const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const handleSearchInput = (v: string) => {
		setSearchInput(v);
		if (searchTimer.current) clearTimeout(searchTimer.current);
		searchTimer.current = setTimeout(() => {
			setTopicsLoading(true);
			setSearchTerm(v);
			setCurrentPage(1);
		}, 400);
	};

	// Initial load
	useEffect(() => {
		let cancelled = false;
		getDashboardStats()
			.then((d) => {
				if (!cancelled) {
					setStats(d);
					setStatsLoading(false);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setStatsError(true);
					setStatsLoading(false);
				}
			});
		getDepts()
			.then((d) => {
				if (!cancelled) setDepartments(d.data);
			})
			.catch(() => {});
		getLevels()
			.then((d) => {
				if (!cancelled) setLevels(d.data);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	// Fetch topics
	useEffect(() => {
		let cancelled = false;
		getTopics({
			page: currentPage,
			limit: ROWS_PER_PAGE,
			search: searchTerm || undefined,
			department_id: deptFilter || undefined,
			level_id: levelFilter || undefined,
			status: activeTab !== 'all' ? activeTab : undefined,
		})
			.then((res) => {
				if (!cancelled) {
					setTopics(res.data as unknown as TopicRow[]);
					setTopicsTotal(res.pagination.total);
					setTopicsError(false);
					setTopicsLoading(false);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setTopicsError(true);
					setTopicsLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [currentPage, searchTerm, deptFilter, levelFilter, activeTab]);

	// Manual refresh
	const refreshAll = useCallback(() => {
		setStatsLoading(true);
		setStatsError(false);
		getDashboardStats()
			.then((d) => {
				setStats(d);
			})
			.catch(() => {
				setStatsError(true);
			})
			.finally(() => {
				setStatsLoading(false);
			});

		setTopicsLoading(true);
		setTopicsError(false);
		getTopics({
			page: currentPage,
			limit: ROWS_PER_PAGE,
			search: searchTerm || undefined,
			department_id: deptFilter || undefined,
			level_id: levelFilter || undefined,
			status: activeTab !== 'all' ? activeTab : undefined,
		})
			.then((res) => {
				setTopics(res.data as unknown as TopicRow[]);
				setTopicsTotal(res.pagination.total);
			})
			.catch(() => {
				setTopicsError(true);
			})
			.finally(() => {
				setTopicsLoading(false);
			});
	}, [currentPage, searchTerm, deptFilter, levelFilter, activeTab]);

	useRealtimeUpdate(
		['topic', 'user', 'department', 'round', 'category', 'level'],
		refreshAll,
	);

	// Handlers
	const handleTab = (tab: TabKey) => {
		setTopicsLoading(true);
		setActiveTab(tab);
		setCurrentPage(1);
	};
	const handlePageChange = (page: number) => {
		setTopicsLoading(true);
		setCurrentPage(page);
	};
	const handleFilter = (field: 'dept' | 'level', val: string) => {
		setTopicsLoading(true);
		if (field === 'dept') {
			setDeptFilter(val);
			setCurrentPage(1);
		}
		if (field === 'level') {
			setLevelFilter(val);
			setCurrentPage(1);
		}
	};

	// Derived
	const kpi = stats?.overview ?? {
		total: 0,
		by_status: {
			draft: 0,
			submitted: 0,
			approved: 0,
			rejected: 0,
			supplement: 0,
			completed: 0,
		},
	};
	const totalPages = Math.max(1, Math.ceil(topicsTotal / ROWS_PER_PAGE));
	const safePage = Math.min(currentPage, totalPages);

	const pieData = stats
		? [
				{ name: 'Nháp', value: kpi.by_status.draft, key: 'draft' },
				{ name: 'Chờ duyệt', value: kpi.by_status.submitted, key: 'submitted' },
				{
					name: 'Đã phê duyệt',
					value: kpi.by_status.approved,
					key: 'approved',
				},
				{ name: 'Từ chối', value: kpi.by_status.rejected, key: 'rejected' },
				{ name: 'Bổ sung', value: kpi.by_status.supplement, key: 'supplement' },
				{
					name: 'Hoàn thành',
					value: kpi.by_status.completed,
					key: 'completed',
				},
			].filter((d) => d.value > 0)
		: [];

	const deptBarData = (stats?.by_department ?? []).slice(0, 8).map((d) => {
		const row: Record<string, string | number> = { name: d.name };
		for (const cat of d.categories) row[cat.name] = cat.count;
		return row;
	});
	const deptCats = Array.from(
		new Set(
			(stats?.by_department ?? []).flatMap((d) =>
				d.categories.map((c) => c.name),
			),
		),
	);
	const trendRows = stats?.trend_by_category?.rows ?? [];
	const trendCats = stats?.trend_by_category?.categories ?? [];

	return {
		stats,
		statsLoading,
		statsError,
		topics,
		topicsLoading,
		topicsError,
		topicsTotal,
		departments,
		levels,
		searchInput,
		deptFilter,
		levelFilter,
		activeTab,
		currentPage,
		totalPages,
		safePage,
		pieData,
		deptBarData,
		deptCats,
		trendRows,
		trendCats,
		handleSearchInput,
		handleTab,
		handlePageChange,
		handleFilter,
	};
}
