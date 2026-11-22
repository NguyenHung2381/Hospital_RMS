import { ApproveSvg, ProgressSvg, RoundSvg, TopicSvg } from '@/assets/icons';
import { Badge } from '@/shared/components';
import AdminLayout from '../../../layouts/AdminLayout';
import { DashboardTabs } from '../components/DashboardTabs';
import {
	ActivityChart,
	AttentionStrip,
	KpiBand,
	Panel,
	RankBars,
	RankTable,
	ShareDonut,
	ShortList,
} from '../components/DashKit';
import { dk, fmt, panelState } from '../components/dashKitHelpers';
import { useDashboard } from '../hooks/useDashboard';
import { useUpcomingCouncils } from '../hooks/useUpcomingCouncils';
import type { DeptStat } from '../types/dashboard.type';
import {
	APPROVAL_CONFIG,
	STATUS_COLORS,
	STATUS_CONFIG,
	formatDate,
} from '../utils/dashboardHelpers';

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function ResearchDashboard() {
	const { stats, statsLoading: loading, statsError: error } = useDashboard();
	const { upcomingCouncils, councilsLoading, councilsError } = useUpcomingCouncils();

	const year = new Date().getFullYear();
	const st = stats?.overview.by_status;
	const total = stats?.overview.total ?? 0;
	const summary = stats?.summary;
	const progress = stats?.council_progress;
	const atRisk = progress?.by_rating.find((r) => r.rating === 'at_risk')?.count ?? 0;
	const behind = progress?.by_rating.find((r) => r.rating === 'behind')?.count ?? 0;
	const progressPct =
		progress && progress.expected > 0 ? Math.round((progress.completed / progress.expected) * 100) : null;
	const articleCount = (type: 'de_tai' | 'bai_bao') =>
		stats?.by_article_type?.find((a) => a.type === type)?.count ?? 0;

	const statusShare = (['submitted', 'supplement', 'approved', 'rejected', 'cancelled'] as const).map(
		(k) => ({
			key: k,
			name: STATUS_CONFIG[k].label,
			value: st?.[k] ?? 0,
			color: STATUS_COLORS[k],
		}),
	);

	const levels = [...(stats?.by_level ?? [])]
		.filter((l) => l.count > 0)
		.sort((a, b) => b.count - a.count)
		.map((l) => ({ label: l.name, value: l.count }));

	// Xu hướng theo lĩnh vực: 6 lĩnh vực nhiều đề tài nhất, mỗi lĩnh vực một dải theo năm.
	const trendRows = stats?.trend_by_category?.rows ?? [];
	const trendYears = trendRows.map((r) => String(r.year));
	const trendSeries = (stats?.trend_by_category?.categories ?? [])
		.map((cat) => ({
			name: cat,
			values: trendRows.map((r) => Number(r[cat] ?? 0)),
			unit: 'đề tài',
		}))
		.sort((a, b) => b.values.reduce((x, y) => x + y, 0) - a.values.reduce((x, y) => x + y, 0))
		.slice(0, 6);
	const lastIsThisYear = trendYears[trendYears.length - 1] === String(year);

	const depts = stats?.by_department ?? [];
	const approvals = stats?.recent_approvals ?? [];

	return (
		<AdminLayout
			pageTitle='Tổng quan nghiên cứu khoa học'
			pageSubtitle='Hồ sơ cần xử lý, tiến độ hội đồng và phân bố đề tài theo khoa/phòng'
		>
			<DashboardTabs />

			<AttentionStrip
				loading={loading}
				error={error}
				items={[
					{
						kind: 'pending',
						count: st?.submitted ?? 0,
						label: 'đề tài chờ thẩm định',
						to: '/admin/approvals',
					},
					{
						kind: 'warn',
						count: atRisk,
						label: 'đề tài cần đôn đốc tiến độ',
						to: '/admin/councils',
					},
					{
						kind: 'warn',
						count: st?.supplement ?? 0,
						label: 'hồ sơ đang chờ bổ sung',
						to: '/admin/topics',
					},
					{
						kind: 'info',
						count: summary?.councils_upcoming ?? 0,
						label: 'hội đồng sắp bảo vệ',
						to: '/admin/councils',
					},
				]}
			/>

			<KpiBand
				loading={loading}
				items={[
					{
						icon: TopicSvg,
						label: 'Tổng hồ sơ NCKH',
						value: fmt(total),
						context: `${fmt(articleCount('de_tai'))} đề tài · ${fmt(articleCount('bai_bao'))} bài báo · ${fmt(summary?.topics_this_year)} năm ${year}`,
						to: '/admin/topics',
					},
					{
						icon: ApproveSvg,
						label: 'Đã phê duyệt',
						value: fmt(st?.approved),
						context: total > 0 ? `${pct((st?.approved ?? 0) / total)} tổng số hồ sơ` : undefined,
					},
					{
						icon: RoundSvg,
						label: 'Đợt nghiên cứu đang mở',
						value: fmt(summary?.rounds_active),
						context: `${fmt(summary?.councils_total)} hội đồng khoa học`,
						to: '/admin/rounds',
					},
					{
						icon: ProgressSvg,
						label: 'Đánh giá tiến độ của hội đồng',
						value: progressPct === null ? '—' : <>{progressPct}<small>%</small></>,
						context:
							progress && progress.expected > 0
								? `${fmt(progress.completed)}/${fmt(progress.expected)} lượt hoàn tất${behind > 0 ? ` · ${fmt(behind)} chậm tiến độ` : ''}`
								: 'Chưa có kế hoạch đánh giá',
						to: '/admin/councils',
					},
				]}
			/>

			<div className={dk.grid2even}>
				<Panel
					title='Hồ sơ theo trạng thái'
					subtitle='Toàn bộ đề tài và bài báo trong hệ thống'
				>
					{panelState(loading, error, total === 0) ?? (
						<ShareDonut
							data={statusShare}
							unit='hồ sơ'
						/>
					)}
				</Panel>
				<Panel
					title='Đề tài theo cấp quản lý'
					subtitle='Cơ sở, tỉnh, bộ…'
				>
					{panelState(loading, error, levels.length === 0) ?? <RankBars data={levels} />}
				</Panel>
			</div>

			<Panel
				title='Đề tài đăng ký theo lĩnh vực'
				subtitle='Theo năm đăng ký; 6 lĩnh vực nhiều đề tài nhất, chọn lĩnh vực để xem'
			>
				{panelState(loading, error, trendSeries.length === 0 || trendYears.length === 0) ?? (
					<ActivityChart
						labels={trendYears}
						series={trendSeries}
						highlightIndex={lastIsThisYear ? trendYears.length - 1 : null}
						totalLabel='Tổng'
					/>
				)}
			</Panel>

			<Panel
				title='Khoa/phòng chủ trì'
				subtitle='Bấm tiêu đề cột để xếp hạng lại'
				action={{ label: 'Khoa/phòng', to: '/admin/departments' }}
			>
				{panelState(loading, error, depts.length === 0, 'Chưa có dữ liệu khoa/phòng', 240) ?? (
					<RankTable<DeptStat & Record<string, unknown>>
						rows={depts as (DeptStat & Record<string, unknown>)[]}
						nameKey='name'
						nameLabel='Khoa / Phòng'
						defaultSort='total'
						itemLabel='khoa/phòng'
						caption='Hồ sơ NCKH theo khoa/phòng chủ trì'
						columns={[
							{ key: 'total', label: 'Tổng hồ sơ' },
							{ key: 'de_tai', label: 'Đề tài' },
							{ key: 'bai_bao', label: 'Bài báo' },
							{ key: 'approved', label: 'Đã duyệt' },
							{ key: 'approval_rate', label: 'Tỷ lệ duyệt', render: (r) => pct(r.approval_rate) },
						]}
					/>
				)}
			</Panel>

			<div className={dk.grid2even}>
				<Panel
					title='Hội đồng sắp bảo vệ'
					subtitle='Hội đồng đã chốt, theo ngày bảo vệ gần nhất'
					action={{ label: 'Hội đồng', to: '/admin/councils' }}
				>
					{panelState(
						councilsLoading,
						councilsError,
						upcomingCouncils.length === 0,
						'Chưa có lịch bảo vệ nào sắp tới',
					) ?? (
						<ShortList
							items={upcomingCouncils.map((c) => ({
								id: String(c.id),
								title: c.name,
								meta: [c.round_name, c.chairman_name && `Chủ tịch: ${c.chairman_name}`]
									.filter(Boolean)
									.join(' · '),
								date: c.defense_date,
								side: c.defense_date ? formatDate(c.defense_date) : '—',
								sideSub: `${fmt(c.topic_count)} đề tài`,
								to: '/admin/councils',
							}))}
						/>
					)}
				</Panel>

				<Panel
					title='Thẩm định gần đây'
					action={{ label: 'Phê duyệt', to: '/admin/approvals' }}
				>
					{panelState(loading, error, approvals.length === 0, 'Chưa có lượt thẩm định nào') ?? (
						<ShortList
							items={approvals.map((a) => {
								const cfg = APPROVAL_CONFIG[a.status] ?? { label: a.status, tone: 'gray' as const };
								return {
									id: a.id,
									title: a.topic_title,
									meta: [a.approver_name, a.comment].filter(Boolean).join(' · '),
									side: <Badge tone={cfg.tone}>{cfg.label}</Badge>,
									sideSub: formatDate(a.created_at),
								};
							})}
						/>
					)}
				</Panel>
			</div>
		</AdminLayout>
	);
}
