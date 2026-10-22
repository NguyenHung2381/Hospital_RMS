import { formatDateVN } from '../../../shared/utils/formatDate';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeSvg, BookOpenSvg, ClockSvg, UserCheckSvg, UsersSvg } from '@/assets/icons';
import { DISPLAY_STATUS_CFG } from '@/features/course/types/course.type';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getTrainingStats } from '../api/trainingDashboardApi';
import { StatusPieChart, TrendBarChart } from '../components/DashboardCharts';
import { DashboardTabs } from '../components/DashboardTabs';
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
	certificates_expiring: 0,
	trainees_this_year: 0,
	sessions_next_7_days: 0,
};

// Trạng thái hiển thị suy ra từ ngày tháng — cùng nhãn với màn Khóa học (DISPLAY_STATUS_CFG).
const COURSE_STATUS: Record<string, { label: string; color: string }> = {
	upcoming: { label: DISPLAY_STATUS_CFG.upcoming.label, color: '#EF9F27' },
	enrolling: { label: DISPLAY_STATUS_CFG.enrolling.label, color: '#0A9B4A' },
	in_progress: { label: DISPLAY_STATUS_CFG.in_progress.label, color: '#7F77DD' },
	completed: { label: DISPLAY_STATUS_CFG.completed.label, color: '#378ADD' },
	cancelled: { label: DISPLAY_STATUS_CFG.cancelled.label, color: '#E24B4A' },
};

export default function TrainingDashboard() {
	const navigate = useNavigate();
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

	const courseStatusPie = (stats?.courses_by_status ?? []).map((c) => ({
		name: COURSE_STATUS[c.status]?.label ?? c.status,
		value: c.cnt,
		key: c.status,
	}));
	const courseStatusColors = Object.fromEntries(
		courseStatusPie.map((d) => [d.key, COURSE_STATUS[d.key]?.color ?? '#9CA3AF']),
	);

	const trendRows = (stats?.enrollment_trend ?? []).map((r) => ({ month: r.month, 'Lượt đăng ký': r.cnt }));

	return (
		<AdminLayout
			pageTitle='Tổng quan Đào tạo'
			pageSubtitle='Khóa học, học viên, giảng viên, lịch học & xu hướng đăng ký'
		>
			<DashboardTabs />

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
					label='Học viên đang hoạt động'
					value={kpi.total_trainees}
					loading={loading}
					delta={`${kpi.trainees_this_year} học viên mới năm ${new Date().getFullYear()}`}
					deltaType='neutral'
					icon={<UsersSvg />}
					iconClass='iconBlue'
					accent='accentBlue'
				/>
				<MetricCard
					label='Giảng viên / BCV'
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
					label='Chứng chỉ còn hiệu lực'
					value={kpi.certificates_issued}
					loading={loading}
					delta={
						kpi.certificates_expiring > 0
							? `${kpi.certificates_expiring} hết hạn trong 30 ngày`
							: undefined
					}
					deltaType='down'
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
				<div className={styles.moduleGrid}>
					<StatusPieChart
						pieData={courseStatusPie}
						loading={loading}
						error={error}
						title='Khóa học theo trạng thái'
						subtitle='Toàn bộ khóa đào tạo trong hệ thống'
						colors={courseStatusColors}
						centerLabel='khóa học'
					/>
					<div className={styles.chartCard}>
						<div className={styles.chartCardHeader}>
							<div>
								<div className={styles.chartTitle}>Lịch học 7 ngày tới</div>
								<div className={styles.chartSubtitle}>
									{loading ? 'Các buổi học sắp diễn ra' : `${kpi.sessions_next_7_days} buổi học sắp diễn ra`}
								</div>
							</div>
							<button
								type='button'
								className={styles.moduleLink}
								onClick={() => navigate('/admin/class-schedule')}
							>
								Lịch học →
							</button>
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
											<div>{formatDateVN(s.session_date)}</div>
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
								<div className={styles.chartTitle}>Top lớp đầy chỗ nhất</div>
								<div className={styles.chartSubtitle}>Tỷ lệ lấp đầy theo sĩ số tối đa của chương trình</div>
							</div>
							<button
								type='button'
								className={styles.moduleLink}
								onClick={() => navigate('/admin/courses')}
							>
								Khóa học →
							</button>
						</div>
						{loading ? (
							<div className={styles.skeleton} style={{ height: 200, borderRadius: 12 }} />
						) : (stats?.top_full_courses.length ?? 0) === 0 ? (
							<div style={{ padding: 16, color: 'var(--color-gray-400)', fontSize: 13 }}>
								Chưa có chương trình nào cấu hình sĩ số tối đa.
							</div>
						) : (
							<div style={{ maxHeight: 260, overflow: 'auto' }}>
								{stats!.top_full_courses.map((c) => (
									<div
										key={c.name}
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
