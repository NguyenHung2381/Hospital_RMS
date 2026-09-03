import { DocSvg, SearchSvg } from '@/assets/icons';
import { Badge, Pagination, SkeletonTable, TableEmpty } from '@/shared/components';
import { PAGE_SIZE_OPTIONS } from '@/shared/utils';
import type { SimpleItem } from '../../topics/api/topicApi';
import type { DashboardStats } from '../types/dashboard.type';
import {
	formatDate,
	ROWS_PER_PAGE,
	STATUS_CONFIG,
	TABS,
	type TabKey,
	type TopicRow,
} from '../utils/dashboardHelpers';
import styles from '../pages/Dashboard.module.css';

function StatusBadge({ status }: { status: string }) {
	const cfg = STATUS_CONFIG[status] ?? { label: status, tone: 'gray' as const };
	return (
		<Badge
			tone={cfg.tone}
			dot
		>
			{cfg.label}
		</Badge>
	);
}

interface TopicTableProps {
	topics: TopicRow[];
	loading: boolean;
	error: boolean;
	total: number;
	safePage: number;
	totalPages: number;
	searchInput: string;
	levelFilter: string;
	deptFilter: string;
	levels: SimpleItem[];
	departments: SimpleItem[];
	activeTab: TabKey;
	stats: DashboardStats | null;
	onSearch: (v: string) => void;
	onFilter: (field: 'dept' | 'level', val: string) => void;
	onTab: (tab: TabKey) => void;
	onPageChange: (p: number) => void;
}

export function TopicTable({
	topics,
	loading,
	error,
	total,
	safePage,
	totalPages,
	searchInput,
	levelFilter,
	deptFilter,
	levels,
	departments,
	activeTab,
	stats,
	onSearch,
	onFilter,
	onTab,
	onPageChange,
}: TopicTableProps) {
	const kpi = stats?.overview;
	const tabCount = (tab: TabKey) => {
		if (!kpi) return 0;
		if (tab === 'all') return kpi.total;
		return kpi.by_status[tab as keyof typeof kpi.by_status] ?? 0;
	};

	return (
		<div className={styles.tableSection}>
			<div className={styles.tableSectionHeader}>
				<div className={styles.tableSectionLeft}>
					<span className={styles.tableSectionTitle}>
						Danh sách đề tài nghiên cứu
					</span>
					<span className={styles.tableCount}>{total} đề tài</span>
				</div>
				<div className={styles.tableControls}>
					<div className={styles.searchWrap}>
						<SearchSvg className={styles.searchIcon} />
						<input
							className={styles.searchInput}
							placeholder='Tìm mã, tên đề tài...'
							value={searchInput}
							onChange={(e) => onSearch(e.target.value)}
						/>
					</div>
					<select
						className={styles.filterSelect}
						value={levelFilter}
						onChange={(e) => onFilter('level', e.target.value)}
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
						onChange={(e) => onFilter('dept', e.target.value)}
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
						onClick={() => onTab(key)}
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
						</tr>
					</thead>
					<tbody>
						{loading ? (
							<SkeletonTable
								rows={ROWS_PER_PAGE}
								cols={7}
							/>
						) : error ? (
							<TableEmpty
								colSpan={7}
								icon={<DocSvg />}
								title='Không tải được danh sách đề tài. Vui lòng thử lại.'
							/>
						) : topics.length === 0 ? (
							<TableEmpty
								colSpan={7}
								icon={<DocSvg />}
								title='Không tìm thấy đề tài nào phù hợp.'
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
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			<Pagination
				page={safePage}
				totalPages={totalPages}
				total={total}
				rowsPerPage={ROWS_PER_PAGE}
				pageSizeOptions={PAGE_SIZE_OPTIONS}
				onPageChange={onPageChange}
				onRowsPerPageChange={() => {}}
				itemLabel='đề tài'
				hideSizeSelect
			/>
		</div>
	);
}
