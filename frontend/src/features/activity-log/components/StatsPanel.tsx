import type { ActivityStats, EndpointStat } from '../api/activityLogApi';
import styles from '../pages/ActivityLogs.module.css';
import { relativeTime } from '../../../shared/utils/formatDate';
import { actorDisplay, formatDuration } from '../utils';

interface Props {
	stats: ActivityStats;
	onFilterActor: (actor: string) => void;
	onFilterModule: (module: string) => void;
}

// Danh sách xếp hạng có thanh độ dài tỉ lệ (1 màu — chỉ thể hiện độ lớn).
function RankList<T>({
	items,
	value,
	label,
	sub,
	onClick,
}: {
	items: T[];
	value: (t: T) => number;
	label: (t: T) => string;
	sub?: (t: T) => string;
	onClick?: (t: T) => void;
}) {
	const max = Math.max(1, ...items.map(value));
	if (!items.length) return <div className={styles.dMuted}>Không có dữ liệu</div>;
	return (
		<ul className={styles.rankList}>
			{items.map((t, i) => (
				<li
					key={i}
					className={onClick ? styles.clickable : undefined}
					onClick={onClick ? () => onClick(t) : undefined}
					title={`${label(t)}: ${value(t).toLocaleString('vi-VN')}`}
				>
					<div className={styles.rankHead}>
						<span className={styles.rankLabel}>{label(t)}</span>
						<span className={styles.rankValue}>{value(t).toLocaleString('vi-VN')}</span>
					</div>
					<div className={styles.rankTrack}>
						<div
							className={styles.rankBar}
							style={{ width: `${(value(t) / max) * 100}%` }}
						/>
					</div>
					{sub && <div className={styles.rankSub}>{sub(t)}</div>}
				</li>
			))}
		</ul>
	);
}

function EndpointTable({ items, mode }: { items: EndpointStat[]; mode: 'slow' | 'error' }) {
	if (!items.length) return <div className={styles.dMuted}>Không có dữ liệu</div>;
	return (
		<table className={styles.miniTable}>
			<thead>
				<tr>
					<th>Endpoint</th>
					<th>Lượt</th>
					{mode === 'slow' ? (
						<>
							<th>TB</th>
							<th>P95</th>
							<th>Lâu nhất</th>
						</>
					) : (
						<th>Lỗi</th>
					)}
				</tr>
			</thead>
			<tbody>
				{items.map((e) => (
					<tr key={e.endpoint}>
						<td>
							<div className={styles.rankLabel}>{e.summary}</div>
							<code className={styles.pathSmall}>{e.endpoint}</code>
						</td>
						<td>{e.count}</td>
						{mode === 'slow' ? (
							<>
								<td>{formatDuration(e.avg_ms)}</td>
								<td>
									<strong>{formatDuration(e.p95_ms)}</strong>
								</td>
								<td>{formatDuration(e.max_ms)}</td>
							</>
						) : (
							<td>
								<span className={styles.statusErr}>{e.errors}</span>
							</td>
						)}
					</tr>
				))}
			</tbody>
		</table>
	);
}

export function StatsPanel({ stats, onFilterActor, onFilterModule }: Props) {
	const maxHour = Math.max(1, ...stats.by_hour);
	return (
		<div className={styles.statsGrid}>
			<div className={`${styles.statBox} ${styles.span2}`}>
				<h4 className={styles.statBoxTitle}>Lượt truy cập theo giờ trong ngày</h4>
				<div className={styles.hourChart}>
					{stats.by_hour.map((n, h) => (
						<div
							key={h}
							className={styles.hourCol}
							title={`${h}h – ${h + 1}h: ${n.toLocaleString('vi-VN')} lượt`}
						>
							<div
								className={styles.hourBar}
								style={{ height: `${(n / maxHour) * 100}%` }}
							/>
							<span className={styles.hourLabel}>{h % 3 === 0 ? `${h}h` : ''}</span>
						</div>
					))}
				</div>
			</div>

			<div className={styles.statBox}>
				<h4 className={styles.statBoxTitle}>Người dùng hoạt động nhiều nhất</h4>
				<RankList
					items={stats.top_users}
					value={(u) => u.count}
					label={(u) => actorDisplay(u)}
					sub={(u) =>
						`${u.writes} thay đổi · ${u.errors} lỗi · lần cuối ${relativeTime(u.last_at)}`
					}
					onClick={(u) => onFilterActor(u.actor_id || u.actor_username || '')}
				/>
			</div>

			<div className={styles.statBox}>
				<h4 className={styles.statBoxTitle}>Phân hệ được dùng nhiều nhất</h4>
				<RankList
					items={stats.top_modules}
					value={(m) => m.count}
					label={(m) => m.label}
					sub={(m) => `${m.writes} lượt thay đổi dữ liệu`}
					onClick={(m) => onFilterModule(m.module)}
				/>
			</div>

			<div className={styles.statBox}>
				<h4 className={styles.statBoxTitle}>API chậm nhất (theo P95)</h4>
				<EndpointTable
					items={stats.slowest_endpoints}
					mode='slow'
				/>
			</div>

			<div className={styles.statBox}>
				<h4 className={styles.statBoxTitle}>API lỗi nhiều nhất</h4>
				<EndpointTable
					items={stats.error_endpoints}
					mode='error'
				/>
			</div>
		</div>
	);
}
