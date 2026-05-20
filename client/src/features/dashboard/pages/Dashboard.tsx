import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
	PieChart,
	Pie,
	Cell,
	Tooltip,
	ResponsiveContainer,
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Legend,
} from 'recharts';
import styles from './Dashboard.module.css';
import AdminLayout from '../../../layouts/AdminLayout';
import { Icon } from '../../../layouts/AdminLayout/icons';
import { getDashboardStats, type DashboardStats } from '../api/dashboardApi';
import {
	getTopics,
	getDepts,
	getLevels,
	type SimpleItem,
} from '../../topics/api/topicApi';
import { useRealtimeUpdate } from '../../../hooks/useRealtime';

// ─── Types ───────────────────────────────────
type RealStatus =
	| 'draft'
	| 'submitted'
	| 'approved'
	| 'rejected'
	| 'supplement'
	| 'completed';
type TabKey = 'all' | RealStatus;

interface TopicRow {
	id: string;
	title: string;
	status: string;
	created_at: string;
	created_by: string;
	created_by_name: string | null;
	category_name: string | null;
	level_name: string | null;
	department_name: string | null;
	member_count: number;
	progress: number;
}

// ─── Config ──────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
	draft: { label: 'Nháp', cls: 'badgeGray' },
	submitted: { label: 'Chờ duyệt', cls: 'badgeAmber' },
	approved: { label: 'Đã phê duyệt', cls: 'badgeGreen' },
	rejected: { label: 'Từ chối', cls: 'badgeRed' },
	supplement: { label: 'Bổ sung', cls: 'badgeBlue' },
	completed: { label: 'Hoàn thành', cls: 'badgePink' },
};

const STATUS_COLORS: Record<string, string> = {
	draft: '#9CA3AF',
	submitted: '#EF9F27',
	approved: '#2EB87A',
	rejected: '#E24B4A',
	supplement: '#378ADD',
	completed: '#E8457A',
};

const DEPT_COLORS = [
	'#2EB87A',
	'#378ADD',
	'#EF9F27',
	'#E8457A',
	'#7C3AED',
	'#06B6D4',
	'#F97316',
	'#84CC16',
	'#EC4899',
	'#6366F1',
];

const APPROVAL_CONFIG: Record<string, { label: string; cls: string }> = {
	pending: { label: 'Chờ duyệt', cls: 'badgeAmber' },
	approved: { label: 'Đã duyệt', cls: 'badgeGreen' },
	rejected: { label: 'Từ chối', cls: 'badgeRed' },
};

const TABS: { key: TabKey; label: string }[] = [
	{ key: 'all', label: 'Tất cả' },
	{ key: 'submitted', label: 'Chờ duyệt' },
	{ key: 'approved', label: 'Đã phê duyệt' },
	{ key: 'rejected', label: 'Từ chối' },
	{ key: 'supplement', label: 'Bổ sung' },
];

// ─── Helpers ─────────────────────────────────
const CATEGORY_COLORS = [
	'#2EB87A',
	'#378ADD',
	'#EF9F27',
	'#E8457A',
	'#7C3AED',
	'#06B6D4',
	'#F97316',
	'#84CC16',
	'#EC4899',
	'#6366F1',
];
function formatDate(iso: string) {
	if (!iso) return '';
	const d = new Date(iso);
	if (isNaN(d.getTime())) return '';
	return d.toLocaleDateString('vi-VN', {
		timeZone: 'Asia/Ho_Chi_Minh',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	});
}

// ─── Mini icons ───────────────────────────────
function IcTrendUp() {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2.5'
			strokeLinecap='round'
			strokeLinejoin='round'
			style={{ width: 12, height: 12 }}
		>
			<polyline points='23 6 13.5 15.5 8.5 10.5 1 18' />
			<polyline points='17 6 23 6 23 12' />
		</svg>
	);
}
function IcTrendDown() {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2.5'
			strokeLinecap='round'
			strokeLinejoin='round'
			style={{ width: 12, height: 12 }}
		>
			<polyline points='23 18 13.5 8.5 8.5 13.5 1 6' />
			<polyline points='17 18 23 18 23 12' />
		</svg>
	);
}
function IcChevron({ dir }: { dir: 'left' | 'right' }) {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2.5'
			strokeLinecap='round'
			strokeLinejoin='round'
			style={{ width: 13, height: 13 }}
		>
			{dir === 'right' ? (
				<polyline points='9 18 15 12 9 6' />
			) : (
				<polyline points='15 18 9 12 15 6' />
			)}
		</svg>
	);
}

// ─── Metric Card ─────────────────────────────
interface MetricCardProps {
	label: string;
	value: number | string;
	delta?: string;
	deltaType?: 'up' | 'down' | 'neutral';
	compare?: string;
	icon: React.ReactNode;
	iconClass: string;
	accent: 'accentGreen' | 'accentBlue' | 'accentAmber' | 'accentPink';
	loading?: boolean;
}
function MetricCard({
	label,
	value,
	delta,
	deltaType = 'up',
	compare,
	icon,
	iconClass,
	accent,
	loading,
}: MetricCardProps) {
	const deltaClass =
		deltaType === 'up'
			? styles.deltaUp
			: deltaType === 'down'
				? styles.deltaDown
				: styles.deltaNeutral;
	return (
		<div className={`${styles.metricCard} ${styles[accent]}`}>
			<div className={styles.metricHeader}>
				<span className={styles.metricLabel}>{label}</span>
				<div
					className={`${styles.metricIconWrap} ${styles[iconClass as keyof typeof styles]}`}
				>
					{icon}
				</div>
			</div>
			{loading ? (
				<div
					className={styles.skeleton}
					style={{ height: 36, width: 80, borderRadius: 8 }}
				/>
			) : (
				<div className={styles.metricValue}>{value}</div>
			)}
			<div className={styles.metricFooter}>
				{delta && (
					<span className={`${styles.metricDelta} ${deltaClass}`}>
						{deltaType === 'up' ? (
							<IcTrendUp />
						) : deltaType === 'down' ? (
							<IcTrendDown />
						) : null}
						{delta}
					</span>
				)}
				{compare && <span className={styles.metricCompare}>{compare}</span>}
			</div>
		</div>
	);
}

// ─── Chart Tooltips ───────────────────────────
function PieTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { name: string; value: number }[];
}) {
	if (!active || !payload?.length) return null;
	return (
		<div
			style={{
				background: '#fff',
				border: '1px solid #e5e7eb',
				borderRadius: 8,
				padding: '8px 12px',
				fontSize: 12,
				boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
			}}
		>
			<strong>{payload[0].name}</strong>: {payload[0].value}
		</div>
	);
}


// ─── Status Badge ─────────────────────────────
function StatusBadge({ status }: { status: string }) {
	const cfg = STATUS_CONFIG[status] ?? { label: status, cls: 'badgeGray' };
	return (
		<span
			className={`${styles.badge} ${styles[cfg.cls as keyof typeof styles]}`}
		>
			<span className={styles.badgeDot} />
			{cfg.label}
		</span>
	);
}

// ─── Empty State ──────────────────────────────
function EmptyRow({ cols, text }: { cols: number; text: string }) {
	return (
		<tr>
			<td colSpan={cols}>
				<div className={styles.emptyState}>
					<svg
						className={styles.emptyIcon}
						viewBox='0 0 24 24'
						fill='none'
						stroke='currentColor'
						strokeWidth='1.5'
						strokeLinecap='round'
						strokeLinejoin='round'
					>
						<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
						<polyline points='14 2 14 8 20 8' />
					</svg>
					<p className={styles.emptyText}>{text}</p>
				</div>
			</td>
		</tr>
	);
}

// ─── Skeleton rows ────────────────────────────
function SkeletonRows({ cols, rows }: { cols: number; rows: number }) {
	return (
		<>
			{Array.from({ length: rows }).map((_, i) => (
				<tr key={i}>
					{Array.from({ length: cols }).map((_, j) => (
						<td key={j}>
							<div
								className={styles.skeleton}
								style={{ height: 16, borderRadius: 4 }}
							/>
						</td>
					))}
				</tr>
			))}
		</>
	);
}

// ─── MAIN COMPONENT ──────────────────────────
const ROWS_PER_PAGE = 8;

export default function Dashboard() {
	// ── Stats (charts + KPI) ──────────────────
	const [stats, setStats] = useState<DashboardStats | null>(null);
	const [statsLoading, setStatsLoading] = useState(true);
	const [statsError, setStatsError] = useState(false);

	// ── Topics table ──────────────────────────
	const [topics, setTopics] = useState<TopicRow[]>([]);
	const [topicsLoading, setTopicsLoading] = useState(true);
	const [topicsError, setTopicsError] = useState(false);
	const [topicsTotal, setTopicsTotal] = useState(0);

	// ── Filter options ────────────────────────
	const [departments, setDepartments] = useState<SimpleItem[]>([]);
	const [levels, setLevels] = useState<SimpleItem[]>([]);

	// ── Filter state ──────────────────────────
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



	// ── Initial: load stats + filter options ──
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

	// ── Fetch topics (promise chain so no synchronous setState inside effect) ──
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

	// ── Manual refresh (called from button click — sync setState is fine) ──
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

	useRealtimeUpdate(['topic', 'user', 'department', 'round', 'category', 'level'], refreshAll);

	// ── Handlers — set topicsLoading=true from event so effect never does it synchronously ──
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

	// ── Derived ───────────────────────────────
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
		new Set((stats?.by_department ?? []).flatMap((d) => d.categories.map((c) => c.name))),
	);
	const trendRows = stats?.trend_by_category?.rows ?? [];
	const trendCats = stats?.trend_by_category?.categories ?? [];

	// Tab counts from stats overview (by_status)
	const tabCount = (tab: TabKey): number => {
		if (!stats) return 0;
		if (tab === 'all') return kpi.total;
		return kpi.by_status[tab as keyof typeof kpi.by_status] ?? 0;
	};

	// ── Header actions ────────────────────────
	const headerActions = (
		<>
			<button
				className={styles.btnSecondary}
				onClick={refreshAll}
			>
				<Icon.Refresh /> Làm mới
			</button>
			<button className={styles.btnSecondary}>
				<Icon.Download /> Xuất báo cáo
			</button>
			<button className={styles.btnPrimary}>
				<Icon.Plus /> Đăng ký đề tài
			</button>
		</>
	);

	return (
		<AdminLayout
			pageTitle='Dashboard tổng quan'
			pageSubtitle='Hệ thống Quản lý Nghiên cứu Khoa học — Đợt 1 năm 2026'
			headerActions={headerActions}
		>
			{/* ── KPI ──────────────────────────── */}
			<div className={styles.metricsGrid}>
				<MetricCard
					label='Tổng đề tài'
					value={kpi.total}
					loading={statsLoading}
					deltaType='neutral'
					compare={statsError ? 'Không tải được dữ liệu' : undefined}
					icon={
						<svg
							viewBox='0 0 24 24'
							fill='none'
							stroke='currentColor'
							strokeWidth='2'
							strokeLinecap='round'
							strokeLinejoin='round'
						>
							<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
							<polyline points='14 2 14 8 20 8' />
						</svg>
					}
					iconClass='iconGreen'
					accent='accentGreen'
				/>
				<MetricCard
					label='Đã phê duyệt'
					value={kpi.by_status.approved}
					loading={statsLoading}
					delta={
						kpi.total > 0
							? `${((kpi.by_status.approved / kpi.total) * 100).toFixed(1)}% tổng đề tài`
							: undefined
					}
					deltaType='up'
					icon={
						<svg
							viewBox='0 0 24 24'
							fill='none'
							stroke='currentColor'
							strokeWidth='2'
							strokeLinecap='round'
							strokeLinejoin='round'
						>
							<polyline points='22 12 18 12 15 21 9 3 6 12 2 12' />
						</svg>
					}
					iconClass='iconBlue'
					accent='accentBlue'
				/>
				<MetricCard
					label='Chờ phê duyệt'
					value={kpi.by_status.submitted}
					loading={statsLoading}
					delta={
						kpi.by_status.submitted > 0 ? 'Cần xử lý sớm' : 'Không có mục chờ'
					}
					deltaType={kpi.by_status.submitted > 5 ? 'down' : 'neutral'}
					icon={
						<svg
							viewBox='0 0 24 24'
							fill='none'
							stroke='currentColor'
							strokeWidth='2'
							strokeLinecap='round'
							strokeLinejoin='round'
						>
							<circle
								cx='12'
								cy='12'
								r='10'
							/>
							<line
								x1='12'
								y1='8'
								x2='12'
								y2='12'
							/>
							<line
								x1='12'
								y1='16'
								x2='12.01'
								y2='16'
							/>
						</svg>
					}
					iconClass='iconAmber'
					accent='accentAmber'
				/>
				<MetricCard
					label='Từ chối / Bổ sung'
					value={kpi.by_status.rejected + kpi.by_status.supplement}
					loading={statsLoading}
					delta={
						kpi.total > 0
							? `${(((kpi.by_status.rejected + kpi.by_status.supplement) / kpi.total) * 100).toFixed(1)}% tổng đề tài`
							: undefined
					}
					deltaType={kpi.by_status.rejected > 0 ? 'down' : 'neutral'}
					icon={
						<svg
							viewBox='0 0 24 24'
							fill='none'
							stroke='currentColor'
							strokeWidth='2'
							strokeLinecap='round'
							strokeLinejoin='round'
						>
							<polyline points='9 11 12 14 22 4' />
							<path d='M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' />
						</svg>
					}
					iconClass='iconPink'
					accent='accentPink'
				/>
			</div>

			{/* ── CHARTS ROW ───────────────────── */}
			<div className={styles.chartsRow}>
				{/* Pie — Status distribution */}
				<div className={styles.chartCard}>
					<div className={styles.chartCardHeader}>
						<div>
							<div className={styles.chartTitle}>Phân bố theo trạng thái</div>
							<div className={styles.chartSubtitle}>
								Tỷ lệ các trạng thái đề tài hiện tại
							</div>
						</div>
					</div>
					{statsLoading ? (
						<div
							className={styles.skeleton}
							style={{ height: 240, borderRadius: 12 }}
						/>
					) : statsError || pieData.length === 0 ? (
						<div
							style={{
								height: 240,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								color: 'var(--color-gray-400)',
								fontSize: 13,
							}}
						>
							{statsError ? 'Không tải được dữ liệu' : 'Chưa có dữ liệu'}
						</div>
					) : (
						<>
							<div className={styles.chartLegend}>
								{pieData.map((d) => (
									<div
										key={d.key}
										className={styles.legendItem}
									>
										<div
											className={styles.legendDot}
											style={{ background: STATUS_COLORS[d.key] }}
										/>
										{d.name} ({d.value})
									</div>
								))}
							</div>
							<ResponsiveContainer
								width='100%'
								height={180}
							>
								<PieChart>
									<Pie
										data={pieData}
										dataKey='value'
										nameKey='name'
										cx='50%'
										cy='50%'
										innerRadius={45}
										outerRadius={72}
										paddingAngle={3}
									>
										{pieData.map((d) => (
											<Cell
												key={d.key}
												fill={STATUS_COLORS[d.key]}
											/>
										))}
									</Pie>
									<Tooltip content={<PieTooltip />} />
								</PieChart>
							</ResponsiveContainer>
						</>
					)}
				</div>

				{/* Stacked Bar — Category trend by year */}
				<div className={styles.chartCard}>
					<div className={styles.chartCardHeader}>
						<div>
							<div className={styles.chartTitle}>Xu hướng đăng ký đề tài</div>
							<div className={styles.chartSubtitle}>
								Số đề tài theo phân loại trong từng năm
							</div>
						</div>
					</div>
					{statsLoading ? (
						<div
							className={styles.skeleton}
							style={{ height: 240, borderRadius: 12 }}
						/>
					) : statsError || trendRows.length === 0 ? (
						<div
							style={{
								height: 240,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								color: 'var(--color-gray-400)',
								fontSize: 13,
							}}
						>
							{statsError ? 'Không tải được dữ liệu' : 'Chưa có dữ liệu'}
						</div>
					) : (
						<ResponsiveContainer
							width='100%'
							height={240}
						>
							<BarChart
								data={trendRows}
								margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
							>
								<CartesianGrid
									strokeDasharray='3 3'
									stroke='#f0f0f0'
									vertical={false}
								/>
								<XAxis
									dataKey='year'
									tick={{ fontSize: 11, fill: '#9ca3af' }}
									axisLine={false}
									tickLine={false}
								/>
								<YAxis
									tick={{ fontSize: 11, fill: '#9ca3af' }}
									axisLine={false}
									tickLine={false}
									allowDecimals={false}
								/>
								<Tooltip
									formatter={(v, name) => [`${v ?? 0} đề tài`, name]}
									contentStyle={{
										borderRadius: 8,
										fontSize: 12,
										border: '1px solid #e5e7eb',
									}}
								/>
								<Legend wrapperStyle={{ fontSize: 11 }} />
								{trendCats.map((cat, i) => (
									<Bar
										key={String(cat)}
										dataKey={String(cat)}
										name={String(cat)}
										stackId='a'
										fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
										radius={
											i === trendCats.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
										}
									/>
								))}
							</BarChart>
						</ResponsiveContainer>
					)}
				</div>
			</div>

			{/* ── BAR CHART — Department ───────── */}
			<div className={styles.chartCard}>
				<div className={styles.chartCardHeader}>
					<div>
						<div className={styles.chartTitle}>Đề tài theo phòng ban</div>
						<div className={styles.chartSubtitle}>
							Top phòng ban có nhiều đề tài nhất
						</div>
					</div>
				</div>
				{statsLoading ? (
					<div
						className={styles.skeleton}
						style={{ height: 220, borderRadius: 12 }}
					/>
				) : statsError || deptBarData.length === 0 ? (
					<div
						style={{
							height: 220,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							color: 'var(--color-gray-400)',
							fontSize: 13,
						}}
					>
						{statsError ? 'Không tải được dữ liệu' : 'Chưa có dữ liệu'}
					</div>
				) : (
					<ResponsiveContainer
						width='100%'
						height={220}
					>
						<BarChart
							data={deptBarData}
							margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
						>
							<CartesianGrid
								strokeDasharray='3 3'
								stroke='#f0f0f0'
								vertical={false}
							/>
							<XAxis
								dataKey='name'
								tick={{ fontSize: 11, fill: '#9ca3af' }}
								axisLine={false}
								tickLine={false}
								interval={0}
							/>
							<YAxis
								tick={{ fontSize: 11, fill: '#9ca3af' }}
								axisLine={false}
								tickLine={false}
								allowDecimals={false}
							/>
							<Tooltip
								formatter={(v, name) => [`${v ?? 0} đề tài`, name]}
								contentStyle={{
									borderRadius: 8,
									fontSize: 12,
									border: '1px solid #e5e7eb',
								}}
							/>
							<Legend wrapperStyle={{ fontSize: 11 }} />
							{deptCats.map((cat, i) => (
								<Bar
									key={String(cat)}
									dataKey={String(cat)}
									name={String(cat)}
									stackId='a'
									fill={DEPT_COLORS[i % DEPT_COLORS.length]}
									radius={i === deptCats.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
								/>
							))}
						</BarChart>
					</ResponsiveContainer>
				)}
			</div>

			{/* ── TOPIC TABLE ──────────────────── */}
			<div className={styles.tableSection}>
				<div className={styles.tableSectionHeader}>
					<div className={styles.tableSectionLeft}>
						<span className={styles.tableSectionTitle}>
							Danh sách đề tài nghiên cứu
						</span>
						<span className={styles.tableCount}>{topicsTotal} đề tài</span>
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchWrap}>
							<svg
								className={styles.searchIcon}
								viewBox='0 0 24 24'
								fill='none'
								stroke='currentColor'
								strokeWidth='2'
								strokeLinecap='round'
								strokeLinejoin='round'
							>
								<circle
									cx='11'
									cy='11'
									r='8'
								/>
								<line
									x1='21'
									y1='21'
									x2='16.65'
									y2='16.65'
								/>
							</svg>
							<input
								className={styles.searchInput}
								placeholder='Tìm mã, tên đề tài...'
								value={searchInput}
								onChange={(e) => handleSearchInput(e.target.value)}
							/>
						</div>
						<select
							className={styles.filterSelect}
							value={levelFilter}
							onChange={(e) => handleFilter('level', e.target.value)}
						>
							<option value=''>Tất cả cấp độ</option>
							{levels.map((l) => (
								<option
									key={l.id}
									value={l.id}
								>
									{l.name}
								</option>
							))}
						</select>
						<select
							className={styles.filterSelect}
							value={deptFilter}
							onChange={(e) => handleFilter('dept', e.target.value)}
						>
							<option value=''>Tất cả phòng ban</option>
							{departments.map((d) => (
								<option
									key={d.id}
									value={d.id}
								>
									{d.name}
								</option>
							))}
						</select>
					</div>
				</div>

				{/* Tabs */}
				<div className={styles.tabsRow}>
					{TABS.map(({ key, label }) => (
						<div
							key={key}
							className={`${styles.tab} ${activeTab === key ? styles.tabActive : ''}`}
							onClick={() => handleTab(key)}
						>
							{label}
							<span className={styles.tabCount}>{tabCount(key)}</span>
						</div>
					))}
				</div>

				{/* Table */}
				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th className={styles.colId}>Mã đề tài</th>
								<th className={styles.colTitle}>Tên đề tài</th>
								<th className={styles.colLevel}>Cấp độ</th>
								<th className={styles.colCategory}>Phân loại</th>
								<th className={styles.colDept}>Phòng ban</th>
								<th className={styles.colStatus}>Trạng thái</th>
								<th className={styles.colDate}>Ngày tạo</th>
								<th className={styles.colActions}>Thao tác</th>
							</tr>
						</thead>
						<tbody>
							{topicsLoading ? (
								<SkeletonRows
									cols={8}
									rows={ROWS_PER_PAGE}
								/>
							) : topicsError ? (
								<EmptyRow
									cols={8}
									text='Không tải được danh sách đề tài. Vui lòng thử lại.'
								/>
							) : topics.length === 0 ? (
								<EmptyRow
									cols={8}
									text='Không tìm thấy đề tài nào phù hợp.'
								/>
							) : (
								topics.map((t) => (
									<tr key={t.id}>
										<td>
											<span className={styles.topicId}>{t.id}</span>
										</td>
										<td>
											<div
												className={styles.topicTitleText}
												title={t.title}
											>
												{t.title}
											</div>
											{t.created_by_name && (
												<div className={styles.topicMeta}>
													{t.created_by_name}
												</div>
											)}
										</td>
										<td>
											<span
												style={{ fontSize: 12, color: 'var(--color-gray-600)' }}
											>
												{t.level_name ?? '—'}
											</span>
										</td>
										<td>
											<span
												style={{ fontSize: 12, color: 'var(--color-gray-600)' }}
											>
												{t.category_name ?? '—'}
											</span>
										</td>
										<td>
											<span style={{ fontSize: 13 }}>
												{t.department_name ?? '—'}
											</span>
										</td>
										<td>
											<StatusBadge status={t.status} />
										</td>
										<td>
											<span
												style={{ fontSize: 12, color: 'var(--color-gray-500)' }}
											>
												{formatDate(t.created_at)}
											</span>
										</td>
										<td>
											<div className={styles.actionBtns}>
												<div
													className={styles.actionBtn}
													title='Xem chi tiết'
												>
													<svg
														viewBox='0 0 24 24'
														fill='none'
														stroke='currentColor'
														strokeWidth='2'
														strokeLinecap='round'
														strokeLinejoin='round'
													>
														<path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' />
														<circle
															cx='12'
															cy='12'
															r='3'
														/>
													</svg>
												</div>
												<div
													className={styles.actionBtn}
													title='Chỉnh sửa'
												>
													<svg
														viewBox='0 0 24 24'
														fill='none'
														stroke='currentColor'
														strokeWidth='2'
														strokeLinecap='round'
														strokeLinejoin='round'
													>
														<path d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' />
														<path d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' />
													</svg>
												</div>
											</div>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>

				{/* Pagination */}
				<div className={styles.pagination}>
					<span className={styles.pageInfo}>
						{topicsTotal > 0
							? `Hiển thị ${(safePage - 1) * ROWS_PER_PAGE + 1}–${Math.min(safePage * ROWS_PER_PAGE, topicsTotal)} trong tổng số ${topicsTotal} đề tài`
							: 'Không có dữ liệu'}
					</span>
					<div className={styles.pageBtns}>
						<button
							className={styles.pageBtn}
							onClick={() => handlePageChange(Math.max(1, safePage - 1))}
							disabled={safePage === 1 || topicsLoading}
						>
							<IcChevron dir='left' />
						</button>
						{Array.from({ length: totalPages }, (_, i) => i + 1)
							.filter(
								(p) =>
									p === 1 || p === totalPages || Math.abs(p - safePage) <= 1,
							)
							.reduce<(number | '...')[]>((acc, p, i, arr) => {
								if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...');
								acc.push(p);
								return acc;
							}, [])
							.map((p, i) =>
								p === '...' ? (
									<span
										key={`sep-${i}`}
										className={styles.pageBtn}
										style={{ border: 'none', cursor: 'default' }}
									>
										…
									</span>
								) : (
									<button
										key={p}
										className={`${styles.pageBtn} ${safePage === p ? styles.pageBtnActive : ''}`}
										onClick={() => handlePageChange(p as number)}
									>
										{p}
									</button>
								),
							)}
						<button
							className={styles.pageBtn}
							onClick={() =>
								handlePageChange(Math.min(totalPages, safePage + 1))
							}
							disabled={safePage === totalPages || topicsLoading}
						>
							<IcChevron dir='right' />
						</button>
					</div>
				</div>
			</div>

			{/* ── BOTTOM ROW ───────────────────── */}
			<div className={styles.bottomRow}>
				{/* Recent approvals */}
				<div className={styles.approvalCard}>
					<div className={styles.cardHeader}>
						<span className={styles.cardTitle}>Phê duyệt gần đây</span>
						<span className={styles.cardViewAll}>Xem tất cả →</span>
					</div>
					<div className={styles.approvalList}>
						{statsLoading ? (
							Array.from({ length: 4 }).map((_, i) => (
								<div
									key={i}
									className={styles.approvalItem}
								>
									<div
										className={`${styles.approvalAvatar} ${styles.skeleton}`}
									/>
									<div className={styles.approvalInfo}>
										<div
											className={styles.skeleton}
											style={{
												height: 10,
												width: 60,
												marginBottom: 4,
												borderRadius: 4,
											}}
										/>
										<div
											className={styles.skeleton}
											style={{
												height: 13,
												width: '70%',
												marginBottom: 4,
												borderRadius: 4,
											}}
										/>
										<div
											className={styles.skeleton}
											style={{ height: 10, width: '50%', borderRadius: 4 }}
										/>
									</div>
								</div>
							))
						) : statsError || !stats?.recent_approvals?.length ? (
							<div
								style={{
									padding: '24px',
									textAlign: 'center',
									color: 'var(--color-gray-400)',
									fontSize: 13,
								}}
							>
								{statsError
									? 'Không tải được dữ liệu'
									: 'Chưa có phê duyệt nào'}
							</div>
						) : (
							stats.recent_approvals.map((apv) => {
								const cfg = APPROVAL_CONFIG[apv.status] ?? {
									label: apv.status,
									cls: 'badgeGray',
								};
								const name = apv.approver_name ?? 'N/A';
								const initials =
									name
										.split(' ')
										.slice(-2)
										.map((w: string) => w[0])
										.join('')
										.toUpperCase() || 'NA';
								return (
									<div
										key={apv.id}
										className={styles.approvalItem}
									>
										<div className={styles.approvalAvatar}>{initials}</div>
										<div className={styles.approvalInfo}>
											<div className={styles.approvalTopicId}>
												{apv.topic_id}
											</div>
											<div className={styles.approvalTopicTitle}>
												{apv.topic_title}
											</div>
											<div className={styles.approvalMeta}>
												{name}
												{apv.comment ? ` · ${apv.comment}` : ''}
											</div>
										</div>
										<div className={styles.approvalRight}>
											<span
												className={`${styles.badge} ${styles[cfg.cls as keyof typeof styles]}`}
											>
												{cfg.label}
											</span>
											<span className={styles.approvalDate}>
												{formatDate(apv.created_at)}
											</span>
										</div>
									</div>
								);
							})
						)}
					</div>
				</div>

				{/* Department summary */}
				<div className={styles.deptSummaryCard}>
					<div className={styles.cardHeader}>
						<span className={styles.cardTitle}>Đề tài theo phòng ban</span>
						<span className={styles.cardViewAll}>Chi tiết →</span>
					</div>
					<div className={styles.deptList}>
						{statsLoading
							? Array.from({ length: 5 }).map((_, i) => (
									<div
										key={i}
										className={styles.deptItem}
									>
										<div
											className={styles.skeleton}
											style={{ width: 18, height: 14, borderRadius: 4 }}
										/>
										<div style={{ flex: 1, minWidth: 0 }}>
											<div
												className={styles.skeleton}
												style={{
													height: 13,
													width: '60%',
													marginBottom: 5,
													borderRadius: 4,
												}}
											/>
											<div
												className={styles.skeleton}
												style={{ height: 4, borderRadius: 4 }}
											/>
										</div>
									</div>
								))
							: (stats?.by_department ?? []).slice(0, 7).map((dept, i) => {
									const max = stats!.by_department[0]?.total ?? 1;
									return (
										<div
											key={dept.name}
											className={styles.deptItem}
										>
											<span className={styles.deptRank}>{i + 1}</span>
											<div className={styles.deptInfo}>
												<div className={styles.deptName}>{dept.name}</div>
												<div className={styles.deptBarWrap}>
													<div className={styles.deptBar}>
														<div
															className={styles.deptBarFill}
															style={{ width: `${(dept.total / max) * 100}%` }}
														/>
													</div>
													<span className={styles.deptCount}>{dept.total}</span>
												</div>
												<div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', marginTop: 4 }}>
													{dept.categories.map((cat, ci) => (
														<span key={cat.name} style={{ fontSize: 11, color: 'var(--color-gray-500)' }}>
															<span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: DEPT_COLORS[ci % DEPT_COLORS.length], marginRight: 3, verticalAlign: 'middle' }} />
															{cat.name}: {cat.count}
														</span>
													))}
												</div>
											</div>
										</div>
									);
								})}
					</div>
				</div>
			</div>
		</AdminLayout>
	);
}
