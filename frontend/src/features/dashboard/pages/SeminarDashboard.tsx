import { useEffect, useState } from 'react';
import { BadgeSvg, CalendarSvg, ClipboardCheckSvg, UsersSvg } from '@/assets/icons';
import { EVENT_TYPE_LABELS } from '@/features/seminar/types/seminar.type';
import { Badge } from '@/shared/components';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getSeminarStats } from '../api/seminarDashboardApi';
import { DashboardTabs } from '../components/DashboardTabs';
import {
	ActivityChart,
	AttentionStrip,
	KpiBand,
	Panel,
	RankBars,
	ShareDonut,
	ShortList,
} from '../components/DashKit';
import { dk, fmt, panelState } from '../components/dashKitHelpers';
import type { SeminarStats } from '../types/seminarDashboard.type';
import { CHART_COLORS, formatDate } from '../utils/dashboardHelpers';

export default function SeminarDashboard() {
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

	const kpi = stats?.kpi;
	const now = new Date();
	const year = kpi?.current_year ?? now.getFullYear();

	// Trục 12 tháng của năm hiện tại; tô đậm tháng đang diễn ra.
	const monthly = new Map((stats?.monthly ?? []).map((m) => [m.month, m]));
	const monthNums = Array.from({ length: 12 }, (_, i) => i + 1);
	const hasMonthly = (stats?.monthly ?? []).some((m) => m.seminars + m.participants > 0);

	const typeShare = (stats?.by_event_type ?? []).map((t, i) => ({
		key: t.event_type,
		name: EVENT_TYPE_LABELS[t.event_type] ?? t.event_type,
		value: t.cnt,
		color: CHART_COLORS[i % CHART_COLORS.length],
	}));

	const deptData = (stats?.top_departments ?? []).map((d) => ({
		label: d.name,
		value: d.cnt,
		display: (
			<>
				{fmt(d.cnt)} <small>· {fmt(d.cme_cnt)} CME</small>
			</>
		),
	}));

	const upcoming = stats?.upcoming ?? [];

	return (
		<AdminLayout
			pageTitle='Tổng quan hội nghị & tín chỉ CME'
			pageSubtitle={`Hồ sơ CME chờ cấp, sự kiện sắp diễn ra và tình hình tham dự năm ${year}`}
		>
			<DashboardTabs />

			<AttentionStrip
				loading={loading}
				error={error}
				items={[
					{
						kind: 'pending',
						count: kpi?.cme_pending ?? 0,
						label: 'hồ sơ CME chờ cấp',
						to: '/admin/cme-register',
					},
					{
						kind: 'info',
						count: kpi?.upcoming_total ?? 0,
						label: 'hội thảo sắp diễn ra',
						to: '/admin/seminars',
					},
				]}
			/>

			<KpiBand
				loading={loading}
				items={[
					{
						icon: BadgeSvg,
						label: `Hội thảo, hội nghị ${year}`,
						value: fmt(kpi?.seminars_this_year),
						context: `${fmt(kpi?.hosted_this_year)} BV tổ chức · ${fmt(kpi?.external_this_year)} cử người dự`,
						to: '/admin/seminars',
					},
					{
						icon: UsersSvg,
						label: `Lượt tham dự ${year}`,
						value: fmt(kpi?.participants_this_year),
						context: `${fmt(kpi?.internal_participants_this_year)} lượt nhân sự nội viện`,
					},
					{
						icon: ClipboardCheckSvg,
						label: `Chứng nhận CME đã cấp ${year}`,
						value: fmt(kpi?.cme_issued_this_year),
						context: `${(kpi?.cme_credits_this_year ?? 0).toLocaleString('vi-VN')} tiết/tín chỉ`,
						to: '/admin/cme-register',
					},
					{
						icon: CalendarSvg,
						label: `Sự kiện có cấp CME ${year}`,
						value: fmt(kpi?.cme_seminars_this_year),
						to: '/admin/seminars',
					},
				]}
			/>

			<div className={dk.grid2}>
				<Panel
					title='Hội thảo sắp diễn ra'
					action={{ label: 'Hội thảo', to: '/admin/seminars' }}
				>
					{panelState(loading, error, upcoming.length === 0, 'Chưa có hội thảo nào sắp diễn ra', 200) ?? (
						<ShortList
							items={upcoming.map((s) => ({
								id: s.id,
								title: s.title,
								meta: `${s.location ?? 'Chưa có địa điểm'} · ${fmt(s.participant_count)} người tham dự`,
								date: s.start_date,
								side:
									formatDate(s.start_date) +
									(s.end_date && s.end_date !== s.start_date ? ` – ${formatDate(s.end_date)}` : ''),
								sideSub: (
									<>
										<Badge tone={s.scope === 'hosted' ? 'green' : 'blue'}>
											{s.scope === 'hosted' ? 'BV tổ chức' : 'Cử người dự'}
										</Badge>
										{s.grants_cme && <Badge tone='teal'>CME</Badge>}
									</>
								),
								to: `/admin/seminars/${s.id}`,
							}))}
						/>
					)}
				</Panel>

				<Panel
					title='Khoa/phòng tham dự nhiều nhất'
					subtitle={`Lượt tham dự của nhân sự nội viện năm ${year}`}
				>
					{panelState(loading, error, deptData.length === 0, undefined, 200) ?? <RankBars data={deptData} />}
				</Panel>
			</div>

			<div className={dk.grid2}>
				<Panel
					title={`Hoạt động theo tháng năm ${year}`}
					subtitle='Chọn chỉ số để xem; cột đậm là tháng hiện tại'
				>
					{panelState(loading, error, !hasMonthly, 'Chưa có sự kiện nào trong năm', 160) ?? (
						<ActivityChart
							labels={monthNums.map((m) => `T${m}`)}
							highlightIndex={year === now.getFullYear() ? now.getMonth() : null}
							totalLabel='Cả năm'
							series={[
								{
									name: 'Hội thảo',
									values: monthNums.map((m) => monthly.get(m)?.seminars ?? 0),
									unit: 'hội thảo',
								},
								{
									name: 'Lượt tham dự',
									values: monthNums.map((m) => monthly.get(m)?.participants ?? 0),
									unit: 'lượt',
								},
							]}
						/>
					)}
				</Panel>

				<Panel
					title='Sự kiện theo loại hình'
					subtitle={`Năm ${year}`}
				>
					{panelState(loading, error, typeShare.length === 0, undefined, 160) ?? (
						<ShareDonut
							data={typeShare}
							unit='sự kiện'
						/>
					)}
				</Panel>
			</div>
		</AdminLayout>
	);
}
