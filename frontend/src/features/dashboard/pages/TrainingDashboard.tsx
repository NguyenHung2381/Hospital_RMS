import { useEffect, useState } from 'react';
import { DISPLAY_STATUS_CFG } from '@/features/course/types/course.type';
import { formatDateVN } from '../../../shared/utils/formatDate';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getTrainingStats } from '../api/trainingDashboardApi';
import { DashboardTabs } from '../components/DashboardTabs';
import {
	ActivityRows,
	AttentionStrip,
	KpiBand,
	Panel,
	RankBars,
	ShareBar,
	ShortList,
} from '../components/DashKit';
import { dk, fmt, last12Months, monthLabel, panelState } from '../components/dashKitHelpers';
import type { TrainingStats, UpcomingSession } from '../types/trainingDashboard.type';
import { CHART_COLORS } from '../utils/dashboardHelpers';

// Trạng thái hiển thị suy ra từ ngày tháng — cùng nhãn với màn Khóa học (DISPLAY_STATUS_CFG).
const COURSE_STATUS: Record<string, { label: string; color: string }> = {
	enrolling: { label: DISPLAY_STATUS_CFG.enrolling.label, color: '#0A9B4A' },
	in_progress: { label: DISPLAY_STATUS_CFG.in_progress.label, color: '#378ADD' },
	upcoming: { label: DISPLAY_STATUS_CFG.upcoming.label, color: '#EF9F27' },
	completed: { label: DISPLAY_STATUS_CFG.completed.label, color: '#64748B' },
	cancelled: { label: DISPLAY_STATUS_CFG.cancelled.label, color: '#E24B4A' },
};

const isoDay = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Gom buổi học theo ngày, nhãn "Hôm nay"/"Ngày mai" cho 2 ngày đầu. */
function groupByDay(sessions: UpcomingSession[]) {
	const today = new Date();
	const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
	const groups = new Map<string, UpcomingSession[]>();
	for (const s of sessions) {
		const k = s.session_date.slice(0, 10);
		groups.set(k, [...(groups.get(k) ?? []), s]);
	}
	return [...groups.entries()].map(([day, items]) => {
		const rel = day === isoDay(today) ? 'Hôm nay' : day === isoDay(tomorrow) ? 'Ngày mai' : null;
		return { day, isToday: rel === 'Hôm nay', label: rel ? `${rel} · ${formatDateVN(day)}` : formatDateVN(day), items };
	});
}

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

	const kpi = stats?.kpi;
	const year = new Date().getFullYear();

	const months = last12Months();
	const trendMap = new Map((stats?.enrollment_trend ?? []).map((r) => [r.month, r.cnt]));
	const trendValues = months.map((m) => trendMap.get(m) ?? 0);
	const hasTrend = trendValues.some((v) => v > 0);

	const fullCourses = (stats?.top_full_courses ?? []).filter((c) => c.fill_rate >= 100).length;
	const fillData = (stats?.top_full_courses ?? []).map((c) => ({
		label: c.name,
		value: c.fill_rate,
		warn: c.fill_rate >= 100,
		display: (
			<>
				{c.fill_rate}% <small>· {c.approved_count}/{c.capacity}</small>
			</>
		),
	}));

	const traineeShare = (stats?.trainees_by_type ?? []).map((t, i) => ({
		key: t.name,
		name: t.name,
		value: t.cnt,
		color: CHART_COLORS[i % CHART_COLORS.length],
	}));
	const courseShare = (stats?.courses_by_status ?? []).map((c) => ({
		key: c.status,
		name: COURSE_STATUS[c.status]?.label ?? c.status,
		value: c.cnt,
		color: COURSE_STATUS[c.status]?.color ?? '#94A3B8',
	}));

	const days = groupByDay(stats?.upcoming_sessions ?? []);

	return (
		<AdminLayout
			pageTitle='Tổng quan đào tạo'
			pageSubtitle='Đăng ký chờ duyệt, lịch học sắp tới, sĩ số lớp và xu hướng đăng ký'
		>
			<DashboardTabs />

			<AttentionStrip
				loading={loading}
				error={error}
				items={[
					{
						kind: 'pending',
						count: kpi?.pending_enrollments ?? 0,
						label: 'đăng ký khóa học chờ duyệt',
						to: '/admin/dtlt',
					},
					{
						kind: 'warn',
						count: kpi?.certificates_expiring ?? 0,
						label: 'chứng chỉ hết hạn trong 30 ngày',
						to: '/admin/dtlt/hoc-vien',
					},
					{
						kind: 'warn',
						count: fullCourses,
						label: 'lớp đã đủ sĩ số',
						to: '/admin/dtlt',
					},
					{
						kind: 'info',
						count: kpi?.sessions_next_7_days ?? 0,
						label: 'buổi học trong 7 ngày tới',
						to: '/admin/dtlt/lich-hoc',
					},
				]}
			/>

			<KpiBand
				loading={loading}
				items={[
					{
						label: 'Khóa học đang mở',
						value: fmt(kpi?.open_courses),
						context: `trên ${fmt(kpi?.total_courses)} khóa trong hệ thống`,
						to: '/admin/dtlt',
					},
					{
						label: 'Học viên đang hoạt động',
						value: fmt(kpi?.total_trainees),
						context: `${fmt(kpi?.trainees_this_year)} học viên mới năm ${year}`,
						to: '/admin/trainees',
					},
					{
						label: 'Giảng viên, báo cáo viên',
						value: fmt(kpi?.total_lecturers),
						to: '/admin/lecturers',
					},
					{
						label: 'Chứng chỉ còn hiệu lực',
						value: fmt(kpi?.certificates_issued),
					},
				]}
			/>

			<div className={dk.grid2}>
				<Panel
					title='Lịch học 7 ngày tới'
					action={{ label: 'Lịch học', to: '/admin/dtlt/lich-hoc' }}
				>
					{panelState(loading, error, days.length === 0, 'Không có buổi học nào trong 7 ngày tới', 200) ??
						days.map((g) => (
							<div
								key={g.day}
								className={dk.dayGroup}
							>
								<h3 className={`${dk.dayLabel} ${g.isToday ? dk.dayLabelToday : ''}`}>{g.label}</h3>
								<ShortList
									items={g.items.map((s) => ({
										id: s.id,
										title: s.course_name,
										meta: [s.subject_name, s.lecturer_name].filter(Boolean).join(' · ') || undefined,
										side: s.start_time ? `${s.start_time}–${s.end_time ?? ''}` : undefined,
										sideSub: s.room ?? undefined,
									}))}
								/>
							</div>
						))}
				</Panel>

				<Panel
					title='Lớp đầy chỗ nhất'
					subtitle='Tỷ lệ học viên đã duyệt trên sĩ số tối đa'
					action={{ label: 'Khóa học', to: '/admin/dtlt' }}
				>
					{panelState(
						loading,
						error,
						fillData.length === 0,
						'Chưa có chương trình nào đặt sĩ số tối đa',
						200,
					) ?? (
						<RankBars
							data={fillData}
							max={100}
						/>
					)}
				</Panel>
			</div>

			<div className={dk.grid2}>
				<Panel
					title='Lượt đăng ký khóa học'
					subtitle='12 tháng gần nhất; cột đậm là tháng hiện tại'
				>
					{panelState(loading, error, !hasTrend, 'Chưa có lượt đăng ký nào trong 12 tháng qua', 200) ?? (
						<ActivityRows
							labels={months.map(monthLabel)}
							series={[{ name: 'Lượt đăng ký', values: trendValues, unit: 'lượt' }]}
							rowHeight={140}
							totalLabel='12 tháng'
						/>
					)}
				</Panel>

				<Panel title='Cơ cấu'>
					{panelState(loading, error, traineeShare.length + courseShare.length === 0, undefined, 200) ?? (
						<>
							{traineeShare.length > 0 && (
								<div className={dk.shareGroup}>
									<h3 className={dk.shareGroupTitle}>Học viên theo đối tượng</h3>
									<ShareBar
										data={traineeShare}
										unit='học viên'
									/>
								</div>
							)}
							{courseShare.length > 0 && (
								<div className={dk.shareGroup}>
									<h3 className={dk.shareGroupTitle}>Khóa học theo trạng thái</h3>
									<ShareBar
										data={courseShare}
										unit='khóa học'
									/>
								</div>
							)}
						</>
					)}
				</Panel>
			</div>
		</AdminLayout>
	);
}
