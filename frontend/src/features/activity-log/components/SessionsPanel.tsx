import type { ActivitySession } from '../api/activityLogApi';
import styles from '../pages/ActivityLogs.module.css';
import {
	actorDisplay,
	formatDayOnly,
	formatDuration,
	formatTimeOnly,
	parseUserAgent,
} from '../utils';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { Pagination } from '@/shared/components/Table/Pagination';

interface Props {
	sessions: ActivitySession[];
	gapMinutes: number;
	onOpen: (s: ActivitySession) => void;
}

export function SessionsPanel({ sessions, gapMinutes, onOpen }: Props) {
	const pg = useClientPaging(sessions);
	if (!sessions.length)
		return <div className={styles.emptyState}>Không có phiên truy cập nào trong khoảng đã chọn</div>;

	return (
		<>
			<div className={styles.panelNote}>
				Mỗi phiên là chuỗi thao tác liên tục của 1 người; nghỉ quá {gapMinutes} phút thì tính là phiên
				mới. Bấm vào một phiên để xem toàn bộ thao tác trong phiên đó.
			</div>
			<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th className={`${styles.th} ${tbl.thIdx}`}>STT</th>
							<th className={styles.th}>Người dùng</th>
							<th className={styles.th}>Bắt đầu → Kết thúc</th>
							<th className={styles.th}>Thời lượng</th>
							<th className={styles.th}>Lượt gọi</th>
							<th className={styles.th}>Thay đổi dữ liệu</th>
							<th className={styles.th}>Lỗi</th>
							<th className={styles.th}>Làm việc chủ yếu ở</th>
							<th className={styles.th}>IP · Thiết bị</th>
						</tr>
					</thead>
					<tbody>
						{pg.paged.map((s, i) => {
							const ua = parseUserAgent(s.user_agents[0]);
							return (
								<tr
									key={s.id}
									className={`${styles.tr} ${styles.clickable}`}
									onClick={() => onOpen(s)}
								>
									<td className={`${styles.td} ${tbl.tdIdx}`}>{pg.offset + i + 1}</td>
									<td className={styles.td}>
										<div className={styles.actorName}>{actorDisplay(s)}</div>
										<div className={styles.actorId}>
											{[s.actor_username, s.actor_id].filter(Boolean).join(' · ')}
										</div>
									</td>
									<td className={styles.td}>
										<div className={styles.timeMain}>
											{formatTimeOnly(s.started_at)} → {formatTimeOnly(s.ended_at)}
										</div>
										<div className={styles.timeText}>{formatDayOnly(s.started_at)}</div>
									</td>
									<td className={styles.td}>
										<strong>{formatDuration(s.duration_ms)}</strong>
										<div className={styles.timeText}>
											{s.login && 'Có đăng nhập'}
											{s.login && s.logout && ' · '}
											{s.logout && 'Đã đăng xuất'}
										</div>
									</td>
									<td className={styles.td}>{s.request_count}</td>
									<td className={styles.td}>
										{s.write_count ? <strong>{s.write_count}</strong> : <span className={styles.dMuted}>0</span>}
									</td>
									<td className={styles.td}>
										{s.error_count ? (
											<span className={styles.statusErr}>{s.error_count}</span>
										) : (
											<span className={styles.dMuted}>0</span>
										)}
									</td>
									<td className={styles.td}>
										<div className={styles.chips}>
											{s.top_modules.slice(0, 3).map((m) => (
												<span
													key={m.label}
													className={styles.chip}
												>
													{m.label} <b>{m.count}</b>
												</span>
											))}
										</div>
									</td>
									<td className={styles.td}>
										<div>{s.ips.join(', ')}</div>
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
			<Pagination
				{...pg.pagination}
				itemLabel='phiên'
			/>
		</>
	);
}
