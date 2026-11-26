import { useEffect, useState } from 'react';
import { BadgeSvg, BookOpenSvg, TopicSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getOverviewStats } from '../api/overviewDashboardApi';
import { DashboardTabs } from '../components/DashboardTabs';
import {
	ActivityChart,
	AttentionStrip,
	KpiBand,
	Panel,
	RankTable,
} from '../components/DashKit';
import { fmt, last12Months, monthLabel, panelState } from '../components/dashKitHelpers';
import styles from './OverviewDashboard.module.css';
import type { OverviewStats } from '../types/overviewDashboard.type';

type DeptRow = OverviewStats['top_departments'][number];

export default function OverviewDashboard() {
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

	const kpi = stats?.kpi;
	const year = kpi?.current_year ?? new Date().getFullYear();

	// Lấp đủ 12 tháng để các dải cùng trục.
	const months = last12Months();
	const byMonth = new Map((stats?.monthly_activity ?? []).map((m) => [m.month, m]));
	const pick = (k: 'topics' | 'enrollments' | 'seminars') =>
		months.map((m) => byMonth.get(m)?.[k] ?? 0);
	const hasActivity = (stats?.monthly_activity ?? []).some(
		(m) => m.topics + m.enrollments + m.seminars > 0,
	);

	const depts = stats?.top_departments ?? [];

	return (
		<AdminLayout
			pageTitle='Tổng quan hệ thống'
		>
			<DashboardTabs wrap />

			<AttentionStrip
				compactWhenEmpty
				loading={loading}
				error={error}
				items={[
					{
						kind: 'pending',
						count: kpi?.topics_pending ?? 0,
						label: 'đề tài chờ thẩm định',
						action: 'Xem đề tài',
						to: '/admin/approvals',
					},
					{
						kind: 'pending',
						count: kpi?.enrollments_pending ?? 0,
						label: 'đăng ký khóa học chờ duyệt',
						action: 'Xem đăng ký',
						to: '/admin/courses/pending-enrollments',
					},
				]}
			/>

			{!error && (
				<div className={styles.metrics} aria-label="Chỉ số chính" role="group">
					<KpiBand
						loading={loading}
						items={[
							{
								icon: TopicSvg,
								label: `Đề tài đăng ký năm ${year}`,
								value: fmt(kpi?.topics_this_year),
								context: `${fmt(kpi?.topics_total)} đề tài từ trước đến nay`,
								to: '/admin/dashboard/research',
							},
							{
								icon: BookOpenSvg,
								label: 'Học viên đang đào tạo',
								value: fmt(kpi?.trainees_active),
								context: `${fmt(kpi?.courses_open)} khóa đang mở`,
								to: '/admin/dashboard/training',
							},
							{
								icon: BadgeSvg,
								label: `Hội thảo, hội nghị ${year}`,
								value: fmt(kpi?.seminars_this_year),
								context: `${fmt(kpi?.participants_this_year)} lượt tham dự`,
								to: '/admin/dashboard/seminar',
							},
						]}
					/>
				</div>
			)}

			<Panel
				title='Hoạt động 12 tháng gần nhất'
				subtitle='Chọn chỉ số để xem; cột đậm là tháng hiện tại'
			>
				{panelState(loading, error, !hasActivity, 'Chưa có hoạt động nào trong 12 tháng qua') ?? (
					<ActivityChart
						labels={months.map(monthLabel)}
						totalLabel='12 tháng'
							height={220}
						series={[
							{ name: 'Đề tài mới', values: pick('topics'), unit: 'đề tài' },
							{ name: 'Đăng ký khóa học', values: pick('enrollments'), unit: 'lượt' },
							{ name: 'Hội thảo diễn ra', values: pick('seminars'), unit: 'hội thảo' },
						]}
					/>
				)}
			</Panel>

			<Panel
				title='Hoạt động theo khoa/phòng'
				subtitle={`Bấm tiêu đề cột để xếp hạng lại. Hội thảo và CME tính trong năm ${year}.`}
				action={{ label: 'Khoa/phòng', to: '/admin/departments' }}
			>
				{panelState(loading, error, depts.length === 0, 'Chưa có dữ liệu khoa/phòng', 240) ?? (
					<RankTable<DeptRow>
						rows={depts}
						nameKey='name'
						nameLabel='Khoa / Phòng'
						defaultSort='topics_cnt'
						itemLabel='khoa/phòng'
						caption='Hoạt động theo khoa/phòng'
						columns={[
							{ key: 'topics_cnt', label: 'Đề tài NCKH' },
							{ key: 'trainees_cnt', label: 'Học viên' },
							{ key: 'participants_cnt', label: 'Lượt dự hội thảo' },
							{ key: 'cme_cnt', label: 'CME' },
							{ key: 'certificates_cnt', label: 'Chứng chỉ' },
							{ key: 'users_cnt', label: 'Tài khoản' },
						]}
					/>
				)}
			</Panel>
		{kpi && !error && (
				<Panel title='Quản trị hệ thống' action={{ label: 'Xem tài khoản', to: '/admin/users' }}>
					{fmt(kpi.users_active)} tài khoản đang hoạt động · {fmt(kpi.users_locked)} tài khoản bị khóa · {fmt(kpi.departments_total)} khoa/phòng
				</Panel>
			)}
		</AdminLayout>
	);
}
