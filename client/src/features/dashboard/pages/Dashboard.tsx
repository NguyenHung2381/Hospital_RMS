import { ActivitySvg, ClipboardCheckSvg, DocSvg, InfoSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import {
	DeptBarChart,
	StatusPieChart,
	TrendBarChart,
} from '../components/DashboardCharts';
import { MetricCard } from '../components/MetricCard';
import { TopicTable } from '../components/TopicTable';
import { useDashboard } from '../hooks/useDashboard';
import {
	APPROVAL_CONFIG,
	DEPT_COLORS,
	formatDate,
} from '../utils/dashboardHelpers';
import styles from './Dashboard.module.css';

export default function Dashboard() {
	const {
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
	} = useDashboard();

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

	return (
		<AdminLayout
			pageTitle='Dashboard tổng quan'
			pageSubtitle='Hệ thống Quản lý Nghiên cứu Khoa học — Đợt 1 năm 2026'
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
						<DocSvg />
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
						<ActivitySvg />
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
						<InfoSvg />
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
						<ClipboardCheckSvg />
					}
					iconClass='iconPink'
					accent='accentPink'
				/>
			</div>

			{/* ── CHARTS ROW ───────────────────── */}
			<div className={styles.chartsRow}>
				<StatusPieChart
					pieData={pieData}
					loading={statsLoading}
					error={statsError}
				/>
				<TrendBarChart
					trendRows={trendRows}
					trendCats={trendCats}
					loading={statsLoading}
					error={statsError}
				/>
			</div>

			{/* ── DEPT BAR CHART ───────────────── */}
			<DeptBarChart
				deptBarData={deptBarData}
				deptCats={deptCats}
				loading={statsLoading}
				error={statsError}
			/>

			{/* ── TOPIC TABLE ──────────────────── */}
			<TopicTable
				topics={topics}
				loading={topicsLoading}
				error={topicsError}
				total={topicsTotal}
				safePage={safePage}
				totalPages={totalPages}
				searchInput={searchInput}
				levelFilter={levelFilter}
				deptFilter={deptFilter}
				levels={levels}
				departments={departments}
				activeTab={activeTab}
				stats={stats}
				onSearch={handleSearchInput}
				onFilter={handleFilter}
				onTab={handleTab}
				onPageChange={handlePageChange}
			/>

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
												<div
													style={{
														display: 'flex',
														flexWrap: 'wrap',
														gap: '4px 8px',
														marginTop: 4,
													}}
												>
													{dept.categories.map((cat, ci) => (
														<span
															key={cat.name}
															style={{
																fontSize: 11,
																color: 'var(--color-gray-500)',
															}}
														>
															<span
																style={{
																	display: 'inline-block',
																	width: 7,
																	height: 7,
																	borderRadius: '50%',
																	background:
																		DEPT_COLORS[ci % DEPT_COLORS.length],
																	marginRight: 3,
																	verticalAlign: 'middle',
																}}
															/>
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
