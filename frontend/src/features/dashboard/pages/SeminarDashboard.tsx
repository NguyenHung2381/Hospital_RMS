import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeSvg, CalendarSvg, ClockSvg, UsersSvg } from '@/assets/icons';
import { EVENT_TYPE_LABELS } from '@/features/seminar/types/seminar.type';
import { Badge } from '@/shared/components';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getSeminarStats } from '../api/seminarDashboardApi';
import { StatusPieChart, TrendBarChart } from '../components/DashboardCharts';
import { DashboardTabs } from '../components/DashboardTabs';
import { HorizontalBarChart } from '../components/HorizontalBarChart';
import { MetricCard } from '../components/MetricCard';
import type { SeminarKpi, SeminarStats } from '../types/seminarDashboard.type';
import { CHART_COLORS, formatDate } from '../utils/dashboardHelpers';
import styles from './Dashboard.module.css';

const EMPTY_KPI: SeminarKpi = {
	seminars_this_year: 0,
	hosted_this_year: 0,
	external_this_year: 0,
	cme_seminars_this_year: 0,
	upcoming_total: 0,
	participants_this_year: 0,
	internal_participants_this_year: 0,
	cme_issued_this_year: 0,
	cme_pending: 0,
	cme_credits_this_year: 0,
	current_year: new Date().getFullYear(),
};

const SERIES = { seminars: 'Hội thảo', participants: 'Lượt tham dự' } as const;

const fmt = (n: number) => n.toLocaleString('vi-VN');

export default function SeminarDashboard() {
	const navigate = useNavigate();
	const [stats, setStats] = useState<SeminarStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);
	useRealtimeUpdate(['seminar'], () => setRefreshKey((k) => k + 1));

	useEffect(() => {
		let alive = true;
		getSeminarStats()
			.then((s) => {
				if (!alive) return;
				setStats(s);
				setError(false);
			})
			.catch(() => alive && setError(true))
			.finally(() => alive && setLoading(false));
		return () => {
			alive = false;
		};
	}, [refreshKey]);

	const kpi = stats?.kpi ?? EMPTY_KPI;
	const year = kpi.current_year;

	const typePie = (stats?.by_event_type ?? []).map((t) => ({
		name: EVENT_TYPE_LABELS[t.event_type] ?? t.event_type,
		value: t.cnt,
		key: t.event_type,
	}));
	const typeColors = Object.fromEntries(
		typePie.map((d, i) => [d.key, CHART_COLORS[i % CHART_COLORS.length]]),
	);

	const monthly = stats?.monthly ?? [];
	const hasMonthly = monthly.some((m) => m.seminars + m.participants > 0);
	const trendRows = monthly.map((m) => ({
		month: `T${m.month}`,
		[SERIES.seminars]: m.seminars,
		[SERIES.participants]: m.participants,
	}));

	const deptData = (stats?.top_departments ?? []).map((d) => ({
		label: d.name,
		value: d.cnt,
	}));

	return (
		<AdminLayout
			pageTitle='Tổng quan Hội thảo - CME'
			pageSubtitle={`Hội thảo, hội nghị, lượt tham dự và chứng nhận CME năm ${year}`}
		>
			<DashboardTabs />

			<div className={styles.metricsGrid}>
				<MetricCard
					label={`Hội thảo - Hội nghị ${year}`}
					value={fmt(kpi.seminars_this_year)}
					loading={loading}
					compare={
						error
							? 'Lỗi tải dữ liệu'
							: `${fmt(kpi.hosted_this_year)} BV tổ chức · ${fmt(kpi.external_this_year)} cử người dự`
					}
					deltaType='neutral'
					icon={<CalendarSvg />}
					iconClass='iconGreen'
					accent='accentGreen'
				/>
				<MetricCard
					label={`Lượt tham dự ${year}`}
					value={fmt(kpi.participants_this_year)}
					loading={loading}
					compare={`${fmt(kpi.internal_participants_this_year)} lượt nhân sự nội viện`}
					deltaType='neutral'
					icon={<UsersSvg />}
					iconClass='iconBlue'
					accent='accentBlue'
				/>
				<MetricCard
					label={`Chứng nhận CME đã cấp ${year}`}
					value={fmt(kpi.cme_issued_this_year)}
					loading={loading}
					compare={`${kpi.cme_credits_this_year.toLocaleString('vi-VN')} tiết/tín chỉ CME`}
					deltaType='neutral'
					icon={<BadgeSvg />}
					iconClass='iconPink'
					accent='accentPink'
				/>
				<MetricCard
					label='CME chờ cấp'
					value={fmt(kpi.cme_pending)}
					loading={loading}
					delta={kpi.cme_pending > 0 ? 'Cần hoàn tất hồ sơ cấp CME' : 'Không có hồ sơ tồn đọng'}
					deltaType={kpi.cme_pending > 0 ? 'down' : 'neutral'}
					icon={<ClockSvg />}
					iconClass='iconAmber'
					accent='accentAmber'
				/>
			</div>

			<div className={styles.summaryStrip}>
				{[
					{ label: 'Hội thảo sắp diễn ra', value: kpi.upcoming_total, to: '/admin/seminars' },
					{ label: `Sự kiện có cấp CME ${year}`, value: kpi.cme_seminars_this_year, to: '/admin/seminars' },
					{ label: 'Sổ cấp CME', value: kpi.cme_issued_this_year, to: '/admin/cme-register' },
					{ label: 'Theo dõi tuân thủ CME', value: null, to: '/admin/cme-compliance' },
				].map((it) => (
					<button
						key={it.label}
						type='button'
						className={styles.summaryItem}
						onClick={() => navigate(it.to)}
					>
						<span className={styles.summaryValue}>
							{it.value === null ? '→' : loading ? '…' : fmt(it.value)}
						</span>
						<span className={styles.summaryLabel}>{it.label}</span>
					</button>
				))}
			</div>

			<div className={styles.chartsGridSection}>
				<div className={styles.chartsGridPair}>
					<StatusPieChart
						pieData={typePie}
						loading={loading}
						error={error}
						title='Sự kiện theo loại hình'
						subtitle={`Cơ cấu hội thảo - hội nghị năm ${year}`}
						colors={typeColors}
						centerLabel='sự kiện'
					/>
					<TrendBarChart
						trendRows={hasMonthly ? trendRows : []}
						trendCats={[SERIES.seminars, SERIES.participants]}
						loading={loading}
						error={error}
						title='Hoạt động theo tháng'
						subtitle={`Số hội thảo và lượt tham dự theo tháng diễn ra, năm ${year}`}
						xKey='month'
						unitLabel=''
						stacked={false}
					/>
				</div>

				<div className={styles.chartsGridPairReverse}>
					<div className={styles.chartCard}>
						<div className={styles.chartCardHeader}>
							<div>
								<div className={styles.chartTitle}>Hội thảo sắp diễn ra</div>
								<div className={styles.chartSubtitle}>Các sự kiện gần nhất tính từ hôm nay</div>
							</div>
							<button
								type='button'
								className={styles.moduleLink}
								onClick={() => navigate('/admin/seminars')}
							>
								Tất cả →
							</button>
						</div>
						{loading ? (
							<div
								className={styles.skeleton}
								style={{ height: 200, borderRadius: 12 }}
							/>
						) : error || !stats?.upcoming.length ? (
							<div className={styles.emptyNote}>
								{error ? 'Không tải được dữ liệu' : 'Chưa có hội thảo nào sắp diễn ra.'}
							</div>
						) : (
							<div style={{ maxHeight: 320, overflow: 'auto' }}>
								{stats.upcoming.map((s) => (
									<div
										key={s.id}
										className={styles.listRow}
										style={{ cursor: 'pointer' }}
										onClick={() => navigate(`/admin/seminars/${s.id}`)}
									>
										<div style={{ minWidth: 0 }}>
											<div className={styles.listRowTitle}>{s.title}</div>
											<div className={styles.listRowMeta}>
												{s.location ?? 'Chưa có địa điểm'} · {fmt(s.participant_count)} người tham dự
											</div>
										</div>
										<div className={styles.listRowSide}>
											<div>
												{formatDate(s.start_date)}
												{s.end_date && s.end_date !== s.start_date ? ` – ${formatDate(s.end_date)}` : ''}
											</div>
											<div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
												<Badge tone={s.scope === 'hosted' ? 'green' : 'blue'}>
													{s.scope === 'hosted' ? 'BV tổ chức' : 'Cử người dự'}
												</Badge>
												{s.grants_cme && <Badge tone='pink'>CME</Badge>}
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					<HorizontalBarChart
						title='Khoa/Phòng tham dự nhiều nhất'
						subtitle={`Lượt tham dự của nhân sự nội viện năm ${year}`}
						data={deptData}
						loading={loading}
						error={error}
						unitLabel='lượt'
						labelWidth={170}
					/>
				</div>
			</div>
		</AdminLayout>
	);
}
