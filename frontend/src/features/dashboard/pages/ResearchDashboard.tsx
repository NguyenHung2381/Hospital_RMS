import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActivitySvg, ClipboardCheckSvg, DocSvg, InfoSvg } from '@/assets/icons';
import { Badge } from '@/shared/components';
import AdminLayout from '../../../layouts/AdminLayout';
import { CouncilProgressStrip } from '../components/CouncilProgressStrip';
import { DashboardTabs } from '../components/DashboardTabs';
import {
	DeptBarChart,
	StatusPieChart,
	TrendBarChart,
} from '../components/DashboardCharts';
import { MetricCard } from '../components/MetricCard';
import { ModuleOverviewChart } from '../components/ModuleOverviewChart';
import { TopicTable } from '../components/TopicTable';
import { UpcomingCouncilsTable } from '../components/UpcomingCouncilsTable';
import { useDashboard } from '../hooks/useDashboard';
import { useModuleOverview } from '../hooks/useModuleOverview';
import {
	APPROVAL_CONFIG,
	DEPT_COLORS,
	formatDate,
} from '../utils/dashboardHelpers';
import styles from './Dashboard.module.css';

type TableMode = 'topics' | 'councils';

export default function ResearchDashboard() {
	const navigate = useNavigate();
	const [tableMode, setTableMode] = useState<TableMode>('topics');
	const {
		items: moduleItems,
		loading: moduleLoading,
		upcomingCouncils,
		councilsLoading,
		councilsError,
	} = useModuleOverview();
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
			pageTitle='Tổng quan Nghiên cứu khoa học'
			pageSubtitle='Đề tài NCKH, tiến độ Hội đồng đánh giá, phân bố theo khoa/phòng & nhật ký thẩm định'
		>
			<DashboardTabs />

			{/* ── TẦNG 1: CHỈ SỐ ĐIỀU HÀNH & TIẾN ĐỘ HỘI ĐỒNG ── */}
			<div className={styles.metricsGrid}>
				<MetricCard
					label='Tổng số đề tài NCKH'
					value={kpi.total}
					loading={statsLoading}
					deltaType='neutral'
					compare={statsError ? 'Lỗi tải dữ liệu' : undefined}
					icon={<DocSvg />}
					iconClass='iconGreen'
					accent='accentGreen'
				/>
				<MetricCard
					label='Đã phê duyệt / Đạt'
					value={kpi.by_status.approved}
					loading={statsLoading}
					delta={
						kpi.total > 0
							? `${((kpi.by_status.approved / kpi.total) * 100).toFixed(1)}% tổng số hồ sơ`
							: undefined
					}
					deltaType='up'
					icon={<ActivitySvg />}
					iconClass='iconBlue'
					accent='accentBlue'
				/>
				<MetricCard
					label='Đang chờ thẩm định'
					value={kpi.by_status.submitted}
					loading={statsLoading}
					delta={
						kpi.by_status.submitted > 0
							? `${kpi.by_status.submitted} hồ sơ chờ xét duyệt`
							: 'Không có hồ sơ tồn đọng'
					}
					deltaType={kpi.by_status.submitted > 5 ? 'down' : 'neutral'}
					icon={<InfoSvg />}
					iconClass='iconAmber'
					accent='accentAmber'
				/>
				<MetricCard
					label='Chưa thông qua / Bổ sung'
					value={kpi.by_status.rejected + kpi.by_status.supplement}
					loading={statsLoading}
					delta={
						kpi.total > 0
							? `${(((kpi.by_status.rejected + kpi.by_status.supplement) / kpi.total) * 100).toFixed(1)}% cần hoàn thiện lại`
							: undefined
					}
					deltaType={kpi.by_status.rejected > 0 ? 'down' : 'neutral'}
					icon={<ClipboardCheckSvg />}
					iconClass='iconPink'
					accent='accentPink'
				/>
			</div>

			{/* Tiến độ đánh giá của Hội đồng Khoa học */}
			<CouncilProgressStrip
				data={stats?.council_progress}
				loading={statsLoading}
				error={statsError}
			/>

			{/* ── TẦNG 2: HỆ THỐNG BIỂU ĐỒ PHÂN TÍCH (2x2 CÂN ĐỐI) ── */}
			<div className={styles.chartsGridSection}>
				{/* Hàng 1: Cơ cấu trạng thái & Xu hướng đăng ký theo lĩnh vực */}
				<div className={styles.chartsGridPair}>
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

				{/* Hàng 2: Phân bố theo Khoa/Phòng & Quy mô dữ liệu các phân hệ */}
				<div className={styles.chartsGridPairReverse}>
					<DeptBarChart
						deptBarData={deptBarData}
						deptCats={deptCats}
						loading={statsLoading}
						error={statsError}
					/>
					<ModuleOverviewChart
						topicsTotal={kpi.total}
						topicsLoading={statsLoading}
						items={moduleItems}
						loading={moduleLoading}
					/>
				</div>
			</div>

			{/* ── TẦNG 4: NGHIỆP VỤ CHI TIẾT & NHẬT KÝ THẨM ĐỊNH ── */}
			<div className={styles.operationsGrid}>
				{/* Thanh chuyển đổi tab: hàng riêng phía trên bảng, không tính vào chiều cao đối chiếu với cột phụ */}
				<div className={styles.sectionSwitcher}>
					<button
						type='button'
						className={`${styles.switcherBtn} ${tableMode === 'topics' ? styles.switcherBtnActive : ''}`}
						onClick={() => setTableMode('topics')}
					>
						Danh mục Đề tài Nghiên cứu
					</button>
					<button
						type='button'
						className={`${styles.switcherBtn} ${tableMode === 'councils' ? styles.switcherBtnActive : ''}`}
						onClick={() => setTableMode('councils')}
					>
						Kế hoạch Hội đồng Đánh giá & Bảo vệ
					</button>
				</div>

				{/* Cột chính: Bảng tác vụ — cùng hàng lưới với cột phụ nên cao bằng nhau */}
				<div className={styles.operationsMain}>
					{tableMode === 'topics' ? (
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
					) : (
						<UpcomingCouncilsTable
							councils={upcomingCouncils}
							loading={councilsLoading}
							error={councilsError}
						/>
					)}
				</div>

				{/* Cột phụ: Nhật ký thẩm định & Đơn vị nghiên cứu tiêu biểu */}
				<div className={styles.operationsSidebar}>
					{/* Recent approvals */}
					<div className={styles.approvalCard}>
						<div className={styles.cardHeader}>
							<span className={styles.cardTitle}>Nhật ký Thẩm định Gần đây</span>
							<span
								className={styles.cardViewAll}
								onClick={() => navigate('/admin/approvals')}
							>
								Xem toàn bộ →
							</span>
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
										: 'Chưa có nhật ký thẩm định nào'}
								</div>
							) : (
								stats.recent_approvals.map((apv) => {
									const cfg = APPROVAL_CONFIG[apv.status] ?? {
										label: apv.status,
										tone: 'gray' as const,
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
												<Badge tone={cfg.tone}>{cfg.label}</Badge>
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
							<span className={styles.cardTitle}>Đơn vị Nghiên cứu Tiêu biểu</span>
							<span
								className={styles.cardViewAll}
								onClick={() => navigate('/admin/departments')}
							>
								Chi tiết →
							</span>
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
								: (stats?.by_department ?? []).map((dept, i) => {
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
			</div>
		</AdminLayout>
	);
}
