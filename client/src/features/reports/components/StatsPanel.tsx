import { AlertSvg, RefreshSvg } from '@/assets/icons';
import {
	DeptBarChart,
	StatusPieChart,
	TrendBarChart,
} from '../../dashboard/components/DashboardCharts';
import { CATEGORY_COLORS, STATUS_COLORS } from '../../dashboard/utils/dashboardHelpers';
import { PROGRESS_RATING_LABELS } from '../../council/api/councilApi';
import type { DashboardStats, ProgressRating } from '../types/report.type';
import { fmtDate, STATUS_LABELS } from '../utils/reportHelpers';
import styles from '../pages/Reports.module.css';

const IcAlert = () => (
	<AlertSvg
		style={{ width: 13, height: 13, verticalAlign: 'middle', marginRight: 4 }}
	/>
);
const IcRefresh = () => <RefreshSvg style={{ width: 13, height: 13 }} />;

const DEPT_STATUS_KEYS = ['submitted', 'rejected', 'supplement', 'cancelled'] as const;

const RATING_COLORS: Record<ProgressRating, string> = {
	on_track: '#2EB87A',
	behind: '#EF9F27',
	at_risk: '#E24B4A',
};

interface StatsPanelProps {
	stats: DashboardStats | null;
	loading: boolean;
	error: string;
	onRetry: () => void;
}

export function StatsPanel({
	stats,
	loading,
	error,
	onRetry,
}: StatsPanelProps) {
	if (loading)
		return (
			<div className={styles.statsState}>
				<span className={styles.dotSpin} />
				Đang tải thống kê...
			</div>
		);
	if (error)
		return (
			<div className={`${styles.statsState} ${styles.statsErr}`}>
				<IcAlert />
				{error}
				<button
					className={styles.retryBtn}
					onClick={onRetry}
				>
					<IcRefresh /> Thử lại
				</button>
			</div>
		);
	if (!stats) return null;

	const {
		overview,
		by_department,
		by_article_type,
		by_category,
		by_level,
		trend_by_category,
		recent_approvals,
		council_progress,
	} = stats;
	const s = overview.by_status;

	const cards = [
		{ label: 'Tổng số đề tài', value: overview.total, cls: styles.scTotal },
		{ label: 'Đã phê duyệt', value: s.approved, cls: styles.scApproved },
		{ label: 'Chờ duyệt', value: s.submitted, cls: styles.scSubmitted },
		{ label: 'Bổ sung', value: s.supplement, cls: styles.scCompleted },
		{ label: 'Từ chối', value: s.rejected, cls: styles.scRejected },
		{ label: 'Huỷ', value: s.cancelled, cls: styles.scDraft },
	];

	const deTaiCount = by_article_type.find((a) => a.type === 'de_tai')?.count ?? 0;
	const baiBaoCount = by_article_type.find((a) => a.type === 'bai_bao')?.count ?? 0;

	const maxCat = Math.max(...by_category.map((c) => c.count), 1);
	const maxLvl = Math.max(...by_level.map((l) => l.count), 1);

	const pieData = (
		[
			{ name: 'Chờ duyệt', key: 'submitted' },
			{ name: 'Đã phê duyệt', key: 'approved' },
			{ name: 'Từ chối', key: 'rejected' },
			{ name: 'Bổ sung', key: 'supplement' },
			{ name: 'Đã hủy', key: 'cancelled' },
		] as const
	)
		.map((d) => ({ ...d, value: s[d.key] }))
		.filter((d) => d.value > 0);

	const categoryPieData = by_category
		.filter((c) => c.count > 0)
		.map((c) => ({ name: c.name, key: c.name, value: c.count }));
	const categoryColors: Record<string, string> = Object.fromEntries(
		categoryPieData.map((c, i) => [c.key, CATEGORY_COLORS[i % CATEGORY_COLORS.length]]),
	);

	const councilCompletionRate =
		council_progress.expected > 0
			? Math.round((council_progress.completed / council_progress.expected) * 100)
			: 0;

	const deptBarData = by_department.map((d) => {
		const row: Record<string, string | number> = { name: d.name };
		for (const cat of d.categories) row[cat.name] = cat.count;
		return row;
	});
	const deptCats = Array.from(
		new Set(by_department.flatMap((d) => d.categories.map((c) => c.name))),
	);

	return (
		<div className={styles.statsRoot}>
			{/* ── Tổng quan ──────────────────────── */}
			<div className={styles.statsSection}>
				<div className={styles.statsSectionHead}>
					<span className={styles.statsSectionTitle}>Tổng quan</span>
					<span className={styles.statsSectionSub}>
						Số lượng đề tài theo trạng thái xét duyệt
					</span>
				</div>
				<div className={styles.overviewGrid}>
					{cards.map((c) => (
						<div
							key={c.label}
							className={`${styles.statCard} ${c.cls}`}
						>
							<div className={styles.statValue}>{c.value}</div>
							<div className={styles.statLabel}>{c.label}</div>
						</div>
					))}
				</div>
				<div className={styles.phanHeGrid}>
					<div className={`${styles.statCard} ${styles.scTotal}`}>
						<div className={styles.statValue}>{deTaiCount}</div>
						<div className={styles.statLabel}>Đề tài NCKH</div>
					</div>
					<div className={`${styles.statCard} ${styles.scApproved}`}>
						<div className={styles.statValue}>{baiBaoCount}</div>
						<div className={styles.statLabel}>Bài báo & Tập san</div>
					</div>
				</div>
				<div className={styles.tongQuanRow}>
					<StatusPieChart
						pieData={pieData}
						loading={false}
						error={false}
					/>
					<StatusPieChart
						pieData={categoryPieData}
						loading={false}
						error={false}
						title='Phân bố theo phân loại'
						subtitle='Đề tài, sáng kiến và các phân loại khác'
						colors={categoryColors}
					/>
					<div className={styles.completionCard}>
						<div className={styles.completionLabel}>
							Tỷ lệ đánh giá hoàn thành (hội đồng chấm)
						</div>
						<div className={styles.completionSub}>
							Đánh giá tiến độ đã được hội đồng nhập trên tổng số cần chấm
						</div>
						<div className={styles.completionValue}>
							{councilCompletionRate}%
						</div>
						<div className={styles.barTrack}>
							<div
								className={styles.barFill}
								style={{ width: `${councilCompletionRate}%` }}
							/>
						</div>
						<div className={styles.completionSub}>
							{council_progress.completed} / {council_progress.expected} đánh
							giá đã hoàn thành
						</div>
						{council_progress.by_rating.length > 0 && (
							<div className={styles.completionBreakdown}>
								{council_progress.by_rating.map((r) => (
									<span
										key={r.rating}
										className={styles.completionBreakdownItem}
									>
										<span
											className={styles.completionDot}
											style={{ background: RATING_COLORS[r.rating] }}
										/>
										{PROGRESS_RATING_LABELS[r.rating]}: {r.count}
									</span>
								))}
							</div>
						)}
					</div>
				</div>
			</div>

			{/* ── Theo phòng ban ─────────────────── */}
			<div className={styles.statsSection}>
				<div className={styles.statsSectionHead}>
					<span className={styles.statsSectionTitle}>Theo phòng ban</span>
					<span className={styles.statsSectionSub}>
						Khối lượng và tình trạng xét duyệt của từng khoa / phòng / trung tâm
					</span>
				</div>
				<div className={styles.statsCard}>
					<div className={styles.statsCardBody}>
						{by_department.length === 0 ? (
							<p className={styles.statsEmpty}>Chưa có dữ liệu</p>
						) : (
							<div style={{ overflowX: 'auto' }}>
								<table className={styles.deptTable}>
									<thead>
										<tr>
											<th className={`${styles.dtTh} ${styles.dtThIdx}`}>
												#
											</th>
											<th className={`${styles.dtTh} ${styles.dtThName}`}>
												Khoa / Phòng / Trung tâm
											</th>
											<th className={`${styles.dtTh} ${styles.dtThNum}`}>
												Đề tài
											</th>
											<th className={`${styles.dtTh} ${styles.dtThNum}`}>
												Bài báo
											</th>
											<th className={`${styles.dtTh} ${styles.dtThNum}`}>
												Tổng
											</th>
											<th className={`${styles.dtTh} ${styles.dtThNum}`}>
												Đã duyệt
											</th>
											<th className={`${styles.dtTh} ${styles.dtThRate}`}>
												Tỷ lệ duyệt
											</th>
											<th className={`${styles.dtTh} ${styles.dtThRate}`}>
												Đánh giá HĐ
											</th>
											<th className={`${styles.dtTh} ${styles.dtThStatus}`}>
												Trạng thái khác
											</th>
										</tr>
									</thead>
									<tbody>
										{by_department.map((d, i) => {
											const otherStatuses = DEPT_STATUS_KEYS.filter(
												(k) => d.by_status[k] > 0,
											);
											return (
												<tr
													key={d.name}
													className={styles.dtRow}
												>
													<td className={`${styles.dtTd} ${styles.dtIdx}`}>
														{i + 1}
													</td>
													<td className={styles.dtTd}>{d.name}</td>
													<td className={`${styles.dtTd} ${styles.dtNum}`}>
														{d.de_tai}
													</td>
													<td className={`${styles.dtTd} ${styles.dtNum}`}>
														{d.bai_bao}
													</td>
													<td className={`${styles.dtTd} ${styles.dtNum}`}>
														<strong>{d.total}</strong>
													</td>
													<td className={`${styles.dtTd} ${styles.dtNum}`}>
														{d.approved}
													</td>
													<td className={styles.dtTd}>
														<div className={styles.rateCell}>
															<div className={styles.barTrack}>
																<div
																	className={styles.barFill}
																	style={{
																		width: `${d.approval_rate * 100}%`,
																	}}
																/>
															</div>
															<span className={styles.rateText}>
																{Math.round(d.approval_rate * 100)}%
															</span>
														</div>
													</td>
													<td className={styles.dtTd}>
														{d.council_progress.expected === 0 ? (
															<span style={{ color: 'var(--color-gray-300)' }}>
																—
															</span>
														) : (
															<div className={styles.rateCell}>
																<div className={styles.barTrack}>
																	<div
																		className={styles.barFill}
																		style={{
																			width: `${
																				(d.council_progress.completed /
																					d.council_progress.expected) *
																				100
																			}%`,
																		}}
																	/>
																</div>
																<span className={styles.rateText}>
																	{Math.round(
																		(d.council_progress.completed /
																			d.council_progress.expected) *
																			100,
																	)}
																	%
																</span>
															</div>
														)}
													</td>
													<td className={styles.dtTd}>
														{otherStatuses.length === 0 ? (
															<span style={{ color: 'var(--color-gray-300)' }}>
																—
															</span>
														) : (
															<div
																style={{
																	display: 'flex',
																	flexWrap: 'wrap',
																	gap: 4,
																}}
															>
																{otherStatuses.map((k) => (
																	<span
																		key={k}
																		style={{
																			fontSize: 11,
																			fontWeight: 600,
																			padding: '1px 7px',
																			borderRadius: 999,
																			color: '#fff',
																			whiteSpace: 'nowrap',
																			background: STATUS_COLORS[k],
																		}}
																	>
																		{STATUS_LABELS[k]} {d.by_status[k]}
																	</span>
																))}
															</div>
														)}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
				<DeptBarChart
					deptBarData={deptBarData}
					deptCats={deptCats}
					loading={false}
					error={false}
					subtitle={`Toàn bộ ${by_department.length} khoa / phòng / trung tâm`}
				/>
			</div>

			{/* ── Theo phân loại & cấp độ ─────────── */}
			<div className={styles.statsSection}>
				<div className={styles.statsSectionHead}>
					<span className={styles.statsSectionTitle}>
						Theo phân loại & cấp độ
					</span>
				</div>
				<div className={styles.statsMainGrid}>
					<div className={styles.statsCard}>
						<div className={styles.statsCardHead}>Theo phân loại</div>
						<div className={styles.statsCardBody}>
							{by_category.length === 0 ? (
								<p className={styles.statsEmpty}>Chưa có dữ liệu</p>
							) : (
								<ul className={styles.barList}>
									{by_category.map((c) => (
										<li
											key={c.name}
											className={styles.barItem}
										>
											<div className={styles.barMeta}>
												<span className={styles.barName}>{c.name}</span>
												<span className={styles.barCount}>{c.count}</span>
											</div>
											<div className={styles.barTrack}>
												<div
													className={styles.barFill}
													style={{ width: `${(c.count / maxCat) * 100}%` }}
												/>
											</div>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
					<div className={styles.statsCard}>
						<div className={styles.statsCardHead}>Theo cấp độ</div>
						<div className={styles.statsCardBody}>
							{by_level.length === 0 ? (
								<p className={styles.statsEmpty}>Chưa có dữ liệu</p>
							) : (
								<ul className={styles.barList}>
									{by_level.map((l) => (
										<li
											key={l.name}
											className={styles.barItem}
										>
											<div className={styles.barMeta}>
												<span className={styles.barName}>{l.name}</span>
												<span className={styles.barCount}>{l.count}</span>
											</div>
											<div className={styles.barTrack}>
												<div
													className={styles.barFill}
													style={{ width: `${(l.count / maxLvl) * 100}%` }}
												/>
											</div>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* ── Xu hướng theo năm ────────────────── */}
			{trend_by_category.rows.length > 0 && (
				<div className={styles.statsSection}>
					<div className={styles.statsSectionHead}>
						<span className={styles.statsSectionTitle}>Xu hướng theo năm</span>
						<span className={styles.statsSectionSub}>
							So sánh số lượng đề tài giữa các năm theo phân loại
						</span>
					</div>
					<TrendBarChart
						trendRows={trend_by_category.rows}
						trendCats={trend_by_category.categories}
						loading={false}
						error={false}
					/>
				</div>
			)}

			{/* ── Xét duyệt gần đây ────────────────── */}
			{recent_approvals.length > 0 && (
				<div className={styles.statsSection}>
					<div className={styles.statsSectionHead}>
						<span className={styles.statsSectionTitle}>Xét duyệt gần đây</span>
					</div>
					<div className={styles.statsCard}>
						<div className={styles.statsCardBody}>
							<ul className={styles.approvalList}>
								{recent_approvals.map((a) => (
									<li
										key={a.id}
										className={styles.approvalItem}
									>
										<span
											className={`${styles.approvalBadge} ${
												a.status === 'approved'
													? styles.badgeApproved
													: styles.badgeRejected
											}`}
										>
											{a.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
										</span>
										<span className={styles.approvalTitle}>{a.topic_title}</span>
										<span className={styles.approvalMeta}>
											{a.approver_name ?? '—'} · {fmtDate(a.created_at)}
										</span>
									</li>
								))}
							</ul>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
