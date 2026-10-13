import { DownloadSvg, ListSvg, RefreshSvg } from '@/assets/icons';
import { useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import { InlineLoading, Pagination } from '../../../shared/components';
import type { ActivityLog, ActivitySession } from '../api/activityLogApi';
import { ActivityDetailModal } from '../components/ActivityDetailModal';
import { SessionsPanel } from '../components/SessionsPanel';
import { StatsPanel } from '../components/StatsPanel';
import { FilterPanel } from '../components/FilterPanel';
import { useActivityLogs } from '../hooks/useActivityLogs';
import {
	actorDisplay,
	durationLevel,
	exportCsv,
	formatDayOnly,
	formatDuration,
	formatTimeOnly,
	parseUserAgent,
} from '../utils';
import styles from './ActivityLogs.module.css';
import tbl from '@/shared/components/Table/Table.module.css';

type Tab = 'logs' | 'sessions' | 'stats';

function StatTile({
	label,
	value,
	sub,
	tone,
}: {
	label: string;
	value: React.ReactNode;
	sub?: React.ReactNode;
	tone?: 'bad';
}) {
	return (
		<div className={styles.kpi}>
			<div className={styles.kpiLabel}>{label}</div>
			<div className={`${styles.kpiValue} ${tone === 'bad' ? styles.kpiBad : ''}`}>{value}</div>
			{sub && <div className={styles.kpiSub}>{sub}</div>}
		</div>
	);
}

export default function ActivityLogs() {
	const {
		filters,
		patch,
		reset,
		rows,
		page,
		setPage,
		pageSize,
		setPageSize,
		total,
		totalPages,
		truncated,
		stats,
		loading,
		statsLoading,
		error,
		refresh,
	} = useActivityLogs();
	const [tab, setTab] = useState<Tab>('logs');
	const [selected, setSelected] = useState<ActivityLog | null>(null);

	const t = stats?.totals;
	const fmt = (n: number | undefined) => (n ?? 0).toLocaleString('vi-VN');
	const errRate = t && t.requests ? ((t.errors / t.requests) * 100).toFixed(1) : '0';
	const moduleOptions: [string, string][] = Object.entries(stats?.module_options ?? {}).sort((a, b) =>
		a[1].localeCompare(b[1], 'vi'),
	);

	const filterActor = (actor: string) => {
		patch({ actor });
		setSelected(null);
		setTab('logs');
	};
	const filterIp = (ip: string) => {
		patch({ ip });
		setSelected(null);
		setTab('logs');
	};
	const openSession = (s: ActivitySession) => {
		patch({
			actor: s.actor_id || s.actor_username || '',
			ip: s.actor_id ? '' : (s.ips[0] ?? ''),
			range: 'exact',
			fromIso: s.started_at,
			// +1ms: mốc "to" so sánh <=, created_at bị làm tròn tới ms.
			toIso: new Date(new Date(s.ended_at).getTime() + 1).toISOString(),
			excludeViews: false,
		});
		setTab('logs');
	};

	return (
		<AdminLayout
			pageTitle='Nhật ký hoạt động'
			pageSubtitle='Ai đã làm gì, lúc nào, từ đâu, mất bao lâu — lịch sử tác động của người dùng lên hệ thống'
		>
			{/* ── Chỉ số tổng quan cho khoảng thời gian + bộ lọc đang chọn ── */}
			<div className={styles.kpiRow}>
				<StatTile
					label='Lượt thao tác'
					value={fmt(t?.requests)}
					sub={stats?.truncated ? 'Đã chạm giới hạn quét — thu hẹp khoảng thời gian' : undefined}
				/>
				<StatTile
					label='Người dùng hoạt động'
					value={fmt(t?.users)}
					sub={`${fmt(t?.ips)} địa chỉ IP`}
				/>
				<StatTile
					label='Thay đổi dữ liệu'
					value={fmt(t?.writes)}
					sub='Thêm / sửa / xoá / duyệt…'
				/>
				<StatTile
					label='Lỗi'
					value={fmt(t?.errors)}
					sub={`${errRate}% · ${fmt(t?.server_errors)} lỗi hệ thống`}
					tone={t && t.server_errors > 0 ? 'bad' : undefined}
				/>
				<StatTile
					label='Đăng nhập'
					value={fmt(t?.logins)}
					sub={`${fmt(t?.failed_logins)} lần thất bại`}
					tone={t && t.failed_logins > 0 ? 'bad' : undefined}
				/>
				<StatTile
					label='Thời gian phản hồi TB'
					value={formatDuration(t?.avg_ms)}
					sub={`P95: ${formatDuration(t?.p95_ms)}`}
				/>
			</div>

			<section className={styles.tableCard}>
				<FilterPanel
					filters={filters}
					patch={patch}
					reset={reset}
					moduleOptions={moduleOptions}
				/>

				{/* ── Tabs ── */}
				<div className={styles.tabBar}>
					<div className={styles.tabs}>
						<button
							className={`${styles.tab} ${tab === 'logs' ? styles.tabActive : ''}`}
							onClick={() => setTab('logs')}
						>
							Nhật ký chi tiết <span className={styles.tableCount}>{total.toLocaleString('vi-VN')}</span>
						</button>
						<button
							className={`${styles.tab} ${tab === 'sessions' ? styles.tabActive : ''}`}
							onClick={() => setTab('sessions')}
						>
							Phiên truy cập <span className={styles.tableCount}>{stats?.sessions.length ?? 0}</span>
						</button>
						<button
							className={`${styles.tab} ${tab === 'stats' ? styles.tabActive : ''}`}
							onClick={() => setTab('stats')}
						>
							Thống kê
						</button>
					</div>
					<div className={styles.tableControls}>
						{tab === 'logs' && rows.length > 0 && (
							<button
								className={styles.btnGhost}
								onClick={() => exportCsv(rows)}
								title='Xuất các dòng của trang hiện tại ra file CSV (mở bằng Excel)'
							>
								<DownloadSvg style={{ width: 13, height: 13 }} /> Xuất CSV
							</button>
						)}
						<button
							className={styles.btnRefresh}
							onClick={refresh}
							title='Làm mới'
						>
							<RefreshSvg style={{ width: 14, height: 14 }} />
						</button>
					</div>
				</div>

				{tab === 'logs' &&
					(loading && rows.length === 0 ? (
						<InlineLoading />
					) : error ? (
						<div className={styles.emptyState}>{error}</div>
					) : rows.length === 0 ? (
						<div className={styles.emptyState}>
							<ListSvg style={{ width: 36, height: 36, color: 'var(--color-gray-300)' }} />
							<div className={styles.emptyTitle}>Không có thao tác nào khớp bộ lọc</div>
						</div>
					) : (
						<div className={`${styles.tableWrap} ${loading ? styles.tableLoading : ''}`}>
							<table className={styles.table}>
								<thead>
									<tr>
										<th className={`${styles.th} ${tbl.thIdx}`}>STT</th>
										<th className={styles.th}>Thời gian</th>
										<th className={styles.th}>Người dùng</th>
										<th className={styles.th}>Hành động</th>
										<th className={styles.th}>API</th>
										<th className={styles.th}>Kết quả</th>
										<th className={`${styles.th} ${styles.num}`}>Xử lý</th>
										<th className={styles.th}>IP · Thiết bị</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((row, i) => {
										const ua = parseUserAgent(row.user_agent);
										const code = row.status_code ?? 0;
										return (
											<tr
												key={row.id}
												className={`${styles.tr} ${styles.clickable} ${code >= 400 ? styles.rowErr : ''}`}
												onClick={() => setSelected(row)}
											>
												<td className={`${styles.td} ${tbl.tdIdx}`}>{(page - 1) * pageSize + i + 1}</td>
												<td className={styles.td}>
													<div className={styles.timeMain}>{formatTimeOnly(row.created_at)}</div>
													<div className={styles.timeText}>{formatDayOnly(row.created_at)}</div>
												</td>
												<td className={styles.td}>
													<div className={styles.actorName}>{actorDisplay(row)}</div>
													<div className={styles.actorId}>
														{[row.actor_name ? row.actor_username : null, row.actor_id]
															.filter(Boolean)
															.join(' · ')}
													</div>
												</td>
												<td className={styles.td}>
													<span className={`${styles.actionBadge} ${styles[`action_${row.action}`] ?? ''}`}>
														{row.action_label}
													</span>
													<div className={styles.summary}>{row.summary}</div>
												</td>
												<td className={styles.td}>
													<span className={`${styles.methodBadge} ${styles[`method_${row.method}`] ?? ''}`}>
														{row.method}
													</span>
													<span
														className={styles.path}
														title={row.path}
													>
														{row.path.replace(/^\/api\/v1/, '')}
													</span>
												</td>
												<td className={styles.td}>
													<span className={code && code < 400 ? styles.statusOk : styles.statusErr}>
														{code || '—'}
													</span>
													{row.error && (
														<div
															className={styles.errorText}
															title={row.error}
														>
															{row.error}
														</div>
													)}
												</td>
												<td className={`${styles.td} ${styles.num}`}>
													<span className={`${styles.duration} ${styles[`dur_${durationLevel(row.duration_ms)}`]}`}>
														{formatDuration(row.duration_ms)}
													</span>
												</td>
												<td className={styles.td}>
													<div className={styles.ip}>{row.ip_address ?? '—'}</div>
													{ua && (
														<div className={styles.timeText}>
															{ua.browser} · {ua.os}
														</div>
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					))}

				{tab === 'logs' && !error && total > 0 && (
					<div>
						{truncated && (
							<div className={styles.truncatedNote}>
								Dữ liệu quá nhiều nên chỉ đếm được một phần — hãy thu hẹp khoảng thời gian để có tổng chính xác.
							</div>
						)}
						<Pagination
							page={page}
							totalPages={totalPages}
							total={total}
							rowsPerPage={pageSize}
							onPageChange={setPage}
							onRowsPerPageChange={setPageSize}
							itemLabel='thao tác'
						/>
					</div>
				)}

				{tab === 'sessions' &&
					(statsLoading && !stats ? (
						<InlineLoading />
					) : (
						<SessionsPanel
							sessions={stats?.sessions ?? []}
							gapMinutes={stats?.session_gap_minutes ?? 30}
							onOpen={openSession}
						/>
					))}

				{tab === 'stats' &&
					(statsLoading && !stats ? (
						<InlineLoading />
					) : stats ? (
						<StatsPanel
							stats={stats}
							onFilterActor={filterActor}
							onFilterModule={(module) => {
								patch({ module: [module] });
								setTab('logs');
							}}
						/>
					) : (
						<div className={styles.emptyState}>Không tải được thống kê</div>
					))}
			</section>

			<ActivityDetailModal
				row={selected}
				onClose={() => setSelected(null)}
				onFilterActor={filterActor}
				onFilterIp={filterIp}
			/>
		</AdminLayout>
	);
}
