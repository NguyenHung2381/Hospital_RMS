import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenSvg, CalendarSvg, DocSvg, UsersSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getOverviewStats } from '../api/overviewDashboardApi';
import { StatusPieChart, TrendBarChart } from '../components/DashboardCharts';
import { DashboardTabs } from '../components/DashboardTabs';
import { MetricCard } from '../components/MetricCard';
import { QuickAccess } from '../components/QuickAccess';
import type { OverviewKpi, OverviewStats } from '../types/overviewDashboard.type';
import { CHART_COLORS } from '../utils/dashboardHelpers';
import styles from './Dashboard.module.css';

const EMPTY_KPI: OverviewKpi = {
	users_total: 0,
	users_active: 0,
	users_locked: 0,
	departments_total: 0,
	topics_total: 0,
	topics_this_year: 0,
	topics_pending: 0,
	topics_approved: 0,
	rounds_active: 0,
	councils_total: 0,
	courses_total: 0,
	courses_open: 0,
	trainees_active: 0,
	lecturers_active: 0,
	enrollments_pending: 0,
	certificates_active: 0,
	seminars_this_year: 0,
	participants_this_year: 0,
	cme_issued_this_year: 0,
	current_year: new Date().getFullYear(),
};

const SERIES = {
	topics: 'Đề tài mới',
	enrollments: 'Lượt đăng ký khóa học',
	seminars: 'Hội thảo diễn ra',
} as const;

const fmt = (n: number) => n.toLocaleString('vi-VN');

interface ModuleCardProps {
	title: string;
	subtitle: string;
	rows: { label: string; value: number }[];
	loading: boolean;
	linkLabel: string;
	onOpen: () => void;
}

function ModuleCard({ title, subtitle, rows, loading, linkLabel, onOpen }: ModuleCardProps) {
	return (
		<div className={styles.chartCard}>
			<div className={styles.chartCardHeader}>
				<div>
					<div className={styles.chartTitle}>{title}</div>
					<div className={styles.chartSubtitle}>{subtitle}</div>
				</div>
				<button
					type='button'
					className={styles.moduleLink}
					onClick={onOpen}
				>
					{linkLabel} →
				</button>
			</div>
			<div className={styles.moduleStatList}>
				{rows.map((r) => (
					<div
						key={r.label}
						className={styles.moduleStatRow}
					>
						<span>{r.label}</span>
						{loading ? (
							<span
								className={styles.skeleton}
								style={{ width: 40, height: 18, borderRadius: 4 }}
							/>
						) : (
							<span className={styles.moduleStatValue}>{fmt(r.value)}</span>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

export default function OverviewDashboard() {
	const navigate = useNavigate();
	const [stats, setStats] = useState<OverviewStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);
	useRealtimeUpdate(
		[
			'user',
			'department',
			'topic',
			'round',
			'council',
			'course',
			'trainee',
			'lecturer',
			'course_enrollment',
			'certificate',
			'seminar',
		],
		() => setRefreshKey((k) => k + 1),
	);

	useEffect(() => {
		let alive = true;
		getOverviewStats()
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

	const trendRows = (stats?.monthly_activity ?? []).map((m) => ({
		month: `${m.month.slice(5)}/${m.month.slice(2, 4)}`,
		[SERIES.topics]: m.topics,
		[SERIES.enrollments]: m.enrollments,
		[SERIES.seminars]: m.seminars,
	}));
	const hasActivity = (stats?.monthly_activity ?? []).some(
		(m) => m.topics + m.enrollments + m.seminars > 0,
	);

	const rolePie = (stats?.users_by_role ?? []).map((r) => ({
		name: r.name,
		value: r.cnt,
		key: r.name,
	}));
	const roleColors = Object.fromEntries(
		rolePie.map((d, i) => [d.key, CHART_COLORS[i % CHART_COLORS.length]]),
	);

	return (
		<AdminLayout
			pageTitle='Tổng quan Hệ thống'
			pageSubtitle='Số liệu chung toàn hệ thống: tài khoản, Nghiên cứu khoa học, Đào tạo và Hội thảo - CME'
		>
			<DashboardTabs />

			{/* ── TẦNG 1: CHỈ SỐ CHUNG ── */}
			<div className={styles.metricsGrid}>
				<MetricCard
					label='Tài khoản đang hoạt động'
					value={fmt(kpi.users_active)}
					loading={loading}
					compare={
						error
							? 'Lỗi tải dữ liệu'
							: `${fmt(kpi.users_total)} tài khoản · ${fmt(kpi.departments_total)} khoa/phòng`
					}
					delta={kpi.users_locked > 0 ? `${kpi.users_locked} đang bị khóa` : undefined}
					deltaType='down'
					icon={<UsersSvg />}
					iconClass='iconBlue'
					accent='accentBlue'
				/>
				<MetricCard
					label='Đề tài NCKH'
					value={fmt(kpi.topics_total)}
					loading={loading}
					delta={`${fmt(kpi.topics_this_year)} đăng ký năm ${year}`}
					deltaType='neutral'
					icon={<DocSvg />}
					iconClass='iconGreen'
					accent='accentGreen'
				/>
				<MetricCard
					label='Học viên đang đào tạo'
					value={fmt(kpi.trainees_active)}
					loading={loading}
					compare={`${fmt(kpi.courses_open)} khóa đang mở / ${fmt(kpi.courses_total)} khóa`}
					deltaType='neutral'
					icon={<BookOpenSvg />}
					iconClass='iconAmber'
					accent='accentAmber'
				/>
				<MetricCard
					label={`Hội thảo - Hội nghị ${year}`}
					value={fmt(kpi.seminars_this_year)}
					loading={loading}
					compare={`${fmt(kpi.cme_issued_this_year)} chứng nhận CME đã cấp`}
					deltaType='neutral'
					icon={<CalendarSvg />}
					iconClass='iconPink'
					accent='accentPink'
				/>
			</div>

			{/* ── TẦNG 2: TÓM TẮT THEO PHÂN HỆ ── */}
			<div className={styles.moduleGrid}>
				<ModuleCard
					title='Nghiên cứu khoa học'
					subtitle='Đề tài, đợt nghiên cứu & hội đồng'
					loading={loading}
					linkLabel='Dashboard NCKH'
					onOpen={() => navigate('/admin/dashboard/research')}
					rows={[
						{ label: 'Đề tài chờ thẩm định', value: kpi.topics_pending },
						{ label: 'Đề tài đã phê duyệt', value: kpi.topics_approved },
						{ label: 'Đợt nghiên cứu đang mở', value: kpi.rounds_active },
						{ label: 'Hội đồng khoa học', value: kpi.councils_total },
					]}
				/>
				<ModuleCard
					title='Đào tạo'
					subtitle='Khóa học, học viên & giảng viên'
					loading={loading}
					linkLabel='Dashboard Đào tạo'
					onOpen={() => navigate('/admin/dashboard/training')}
					rows={[
						{ label: 'Khóa học đang mở', value: kpi.courses_open },
						{ label: 'Giảng viên', value: kpi.lecturers_active },
						{ label: 'Đăng ký chờ duyệt', value: kpi.enrollments_pending },
						{ label: 'Chứng chỉ còn hiệu lực', value: kpi.certificates_active },
					]}
				/>
				<ModuleCard
					title={`Hội thảo - CME ${year}`}
					subtitle='Hội nghị, hội thảo & tín chỉ CME trong năm'
					loading={loading}
					linkLabel='Hội thảo'
					onOpen={() => navigate('/admin/seminars')}
					rows={[
						{ label: 'Hội thảo - Hội nghị', value: kpi.seminars_this_year },
						{ label: 'Lượt tham dự', value: kpi.participants_this_year },
						{ label: 'Chứng nhận CME đã cấp', value: kpi.cme_issued_this_year },
					]}
				/>
			</div>

			{/* ── TẦNG 3: BIỂU ĐỒ ── */}
			<div className={styles.chartsGridSection}>
				<div className={styles.chartsGridPairReverse}>
					<TrendBarChart
						trendRows={hasActivity ? trendRows : []}
						trendCats={[SERIES.topics, SERIES.enrollments, SERIES.seminars]}
						loading={loading}
						error={error}
						title='Hoạt động hệ thống theo tháng'
						subtitle='Đề tài mới, lượt đăng ký khóa học và hội thảo trong 12 tháng gần nhất'
						xKey='month'
						unitLabel=''
						stacked={false}
					/>
					<StatusPieChart
						pieData={rolePie}
						loading={loading}
						error={error}
						title='Tài khoản theo vai trò'
						subtitle='Cơ cấu tài khoản đang hoạt động theo vai trò'
						colors={roleColors}
						centerLabel='tài khoản'
					/>
				</div>
			</div>

			{/* ── TẦNG 4: KHOA/PHÒNG & TRUY CẬP NHANH ── */}
			<div className={styles.chartCard}>
				<div className={styles.chartCardHeader}>
					<div>
						<div className={styles.chartTitle}>Khoa / Phòng hoạt động nổi bật</div>
						<div className={styles.chartSubtitle}>
							Top 10 đơn vị theo số đề tài NCKH và tài khoản đang hoạt động
						</div>
					</div>
					<button
						type='button'
						className={styles.moduleLink}
						onClick={() => navigate('/admin/departments')}
					>
						Chi tiết →
					</button>
				</div>
				{loading ? (
					<div
						className={styles.skeleton}
						style={{ height: 200, borderRadius: 12 }}
					/>
				) : error || !stats?.top_departments.length ? (
					<div style={{ padding: 16, color: 'var(--color-gray-400)', fontSize: 13 }}>
						{error ? 'Không tải được dữ liệu' : 'Chưa có dữ liệu'}
					</div>
				) : (
					<div style={{ overflowX: 'auto' }}>
						<table className={styles.deptTable}>
							<thead>
								<tr>
									<th>#</th>
									<th>Khoa / Phòng</th>
									<th className={styles.num}>Đề tài NCKH</th>
									<th className={styles.num}>Tài khoản</th>
								</tr>
							</thead>
							<tbody>
								{stats.top_departments.map((d, i) => (
									<tr key={d.name}>
										<td>{i + 1}</td>
										<td>{d.name}</td>
										<td className={styles.num}>{fmt(d.topics_cnt)}</td>
										<td className={styles.num}>{fmt(d.users_cnt)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			<QuickAccess />
		</AdminLayout>
	);
}
