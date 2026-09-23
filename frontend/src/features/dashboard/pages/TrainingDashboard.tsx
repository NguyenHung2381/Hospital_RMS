import { useEffect, useState } from 'react';
import { BadgeSvg, BookOpenSvg, ClockSvg, UserCheckSvg, UsersSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getTrainingStats } from '../api/trainingDashboardApi';
import { StatusPieChart, TrendBarChart } from '../components/DashboardCharts';
import { MetricCard } from '../components/MetricCard';
import type { TrainingStats } from '../types/trainingDashboard.type';
import { CHART_COLORS } from '../utils/dashboardHelpers';
import styles from './Dashboard.module.css';

const EMPTY_KPI: TrainingStats['kpi'] = {
	open_courses: 0,
	total_courses: 0,
	total_trainees: 0,
	total_lecturers: 0,
	pending_enrollments: 0,
	certificates_issued: 0,
};

export default function TrainingDashboard() {
	const [stats, setStats] = useState<TrainingStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);
	useRealtimeUpdate(['course', 'trainee', 'course_enrollment', 'certificate'], () =>
		setRefreshKey((k) => k + 1),
	);

	useEffect(() => {
		let alive = true;
		getTrainingStats()
			.then((s) => alive && setStats(s))
			.catch(() => alive && setError(true))
			.finally(() => alive && setLoading(false));
		return () => {
			alive = false;
		};
	}, [refreshKey]);

	const kpi = stats?.kpi ?? EMPTY_KPI;

	const pieData = (stats?.trainees_by_type ?? []).map((t) => ({
		name: t.name,
		value: t.cnt,
		key: t.name,
	}));
	const pieColors = Object.fromEntries(pieData.map((d, i) => [d.key, CHART_COLORS[i % CHART_COLORS.length]]));

	const trendRows = (stats?.enrollment_trend ?? []).map((r) => ({ month: r.month, 'Lượt đăng ký': r.cnt }));

	return (
		<AdminLayout
			pageTitle='Tổng quan Đào tạo'
			pageSubtitle='Khóa học, học viên, giảng viên, lịch học & xu hướng đăng ký'
		>
			<div className={styles.metricsGrid}>
				<MetricCard
					label='Khóa học đang mở'
					value={kpi.open_courses}
					loading={loading}
					compare={`${kpi.total_courses} tổng số khóa`}
					deltaType='neutral'
					icon={<BookOpenSvg />}
					iconClass='iconGreen'
					accent='accentGreen'
				/>
				<MetricCard
					label='Tổng học viên'
					value={kpi.total_trainees}
					loading={loading}
					icon={<UsersSvg />}
					iconClass='iconBlue'
					accent='accentBlue'
				/>
				<MetricCard
					label='Tổng giảng viên'
					value={kpi.total_lecturers}
					loading={loading}
					icon={<UserCheckSvg />}
					iconClass='iconPink'
					accent='accentPink'
				/>
				<MetricCard
					label='Đăng ký chờ duyệt'
					value={kpi.pending_enrollments}
					loading={loading}
					deltaType={kpi.pending_enrollments > 0 ? 'down' : 'neutral'}
					icon={<ClockSvg />}
					iconClass='iconAmber'
					accent='accentAmber'
				/>
				<MetricCard
					label='Chứng chỉ đã cấp'
					value={kpi.certificates_issued}
					loading={loading}
					icon={<BadgeSvg />}
					iconClass='iconGreen'
					accent='accentGreen'
				/>
			</div>

			<div className={styles.chartsGridSection}>
				<div className={styles.chartsGridPair}>
					<StatusPieChart
						pieData={pieData}
						loading={loading}
						error={error}
						title='Học viên theo đối tượng'
						subtitle='Cơ cấu học viên đang hoạt động theo đối tượng đào tạo'
						colors={pieColors}
						centerLabel='học viên'
					/>
					<TrendBarChart
						trendRows={trendRows}
						trendCats={['Lượt đăng ký']}
						loading={loading}
						error={error}
						title='Xu hướng đăng ký khóa học'
						subtitle='Số lượt đăng ký khóa học theo tháng (12 tháng gần nhất)'
						xKey='month'
						unitLabel='lượt đăng ký'
					/>
				</div>
			</div>

			<div className={styles.chartsGridSection}>
				<div className={styles.chartsGridPair}>
					<div className={styles.chartCard}>
						<div className={styles.chartCardHeader}>
							<div>
								<div className={styles.chartTitle}>Lịch học 7 ngày tới</div>
								<div className={styles.chartSubtitle}>Các buổi học sắp diễn ra</div>
							</div>
						</div>
						{loading ? (
							<div className={styles.skeleton} style={{ height: 200, borderRadius: 12 }} />
						) : (stats?.upcoming_sessions.length ?? 0) === 0 ? (
							<div style={{ padding: 16, color: 'var(--color-gray-400)', fontSize: 13 }}>
								Không có buổi học nào trong 7 ngày tới.
							</div>
						) : (
							<div style={{ maxHeight: 260, overflow: 'auto' }}>
								{stats!.upcoming_sessions.map((s) => (
									<div
										key={s.id}
										style={{
											display: 'flex',
											justifyContent: 'space-between',
											padding: '8px 4px',
											borderBottom: '1px solid var(--color-gray-100)',
											fontSize: 13,
										}}
									>
										<div>
											<div style={{ fontWeight: 600 }}>{s.course_name}</div>
											<div style={{ color: 'var(--color-gray-500)', fontSize: 12 }}>
												{s.subject_name ?? ''} {s.lecturer_name ? `· ${s.lecturer_name}` : ''}
											</div>
										</div>
										<div style={{ textAlign: 'right', color: 'var(--color-gray-600)' }}>
											<div>{s.session_date}</div>
											<div style={{ fontSize: 12 }}>
												{s.start_time ? `${s.start_time}-${s.end_time ?? ''}` : ''} {s.room ?? ''}
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					<div className={styles.chartCard}>
						<div className={styles.chartCardHeader}>
							<div>
								<div className={styles.chartTitle}>Top khóa đầy chỗ nhất</div>
								<div className={styles.chartSubtitle}>Tỷ lệ lấp đầy theo sĩ số tối đa</div>
							</div>
						</div>
						{loading ? (
							<div className={styles.skeleton} style={{ height: 200, borderRadius: 12 }} />
						) : (stats?.top_full_courses.length ?? 0) === 0 ? (
							<div style={{ padding: 16, color: 'var(--color-gray-400)', fontSize: 13 }}>
								Chưa có khóa học nào cấu hình sĩ số tối đa.
							</div>
						) : (
							<div style={{ maxHeight: 260, overflow: 'auto' }}>
								{stats!.top_full_courses.map((c) => (
									<div
										key={c.id}
										style={{
											display: 'flex',
											justifyContent: 'space-between',
											padding: '8px 4px',
											borderBottom: '1px solid var(--color-gray-100)',
											fontSize: 13,
										}}
									>
										<span>{c.name}</span>
										<span style={{ color: 'var(--color-gray-600)' }}>
											{c.approved_count}/{c.capacity} · {c.fill_rate}%
										</span>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
		</AdminLayout>
	);
}
