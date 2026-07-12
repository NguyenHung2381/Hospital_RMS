import { AlertSvg, RefreshSvg } from '@/assets/icons';
import type { DashboardStats } from '../types/report.type';
import { fmtDate } from '../utils/reportHelpers';
import styles from '../pages/Reports.module.css';

const IcAlert = () => (
	<AlertSvg
		style={{ width: 13, height: 13, verticalAlign: 'middle', marginRight: 4 }}
	/>
);
const IcRefresh = () => <RefreshSvg style={{ width: 13, height: 13 }} />;

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
		recent_approvals,
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

	return (
		<div className={styles.statsRoot}>
			{/* Overview cards */}
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

			{/* Theo phân hệ: đề tài NCKH vs bài báo / tập san */}
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

			{/* Main grid: dept table + category / level */}
			<div className={styles.statsMainGrid}>
				<div className={styles.statsCard}>
					<div className={styles.statsCardHead}>
						Theo khoa / phòng / trung tâm
					</div>
					<div className={styles.statsCardBody}>
						{by_department.length === 0 ? (
							<p className={styles.statsEmpty}>Chưa có dữ liệu</p>
						) : (
							<table className={styles.deptTable}>
								<thead>
									<tr>
										<th className={styles.dtTh}>#</th>
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
										<th className={styles.dtTh}>Tỷ lệ duyệt</th>
									</tr>
								</thead>
								<tbody>
									{by_department.map((d, i) => (
										<tr
											key={d.name}
											className={styles.dtRow}
										>
											<td className={`${styles.dtTd} ${styles.dtNum}`}>
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
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>
				</div>

				<div className={styles.statsRightCol}>
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

			{/* Recent approvals */}
			{recent_approvals.length > 0 && (
				<div className={styles.statsCard}>
					<div className={styles.statsCardHead}>Xét duyệt gần đây</div>
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
			)}
		</div>
	);
}
