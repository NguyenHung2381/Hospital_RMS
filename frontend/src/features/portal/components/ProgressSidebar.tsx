import { useState } from 'react';
import { formatDateVN } from '../../../shared/utils/formatDate';
import { PROGRESS_RATING_LABELS, type ProgressTopic } from '../../council/api/councilApi';
import { SEAT_ROLE_LABELS } from '../../council/types/council.type';
import {
	findMyReview,
	groupBySession,
	hasScore,
	RATING_TONE,
	SESSION_LABELS,
} from '../utils/councilProgressHelpers';
import styles from '../pages/CouncilProgress.module.css';

type Filter = 'all' | 'pending' | 'done';

interface ProgressSidebarProps {
	councils: ProgressTopic[][];
	stats: { total: number; reviewed: number; pending: number };
	selectedTopicId: string | null;
	setSelectedTopicId: (id: string) => void;
	userId: string | undefined;
	/** Đề tài có phiếu nháp chưa lưu. */
	dirtyIds: Set<string>;
}

export function ProgressSidebar({
	councils,
	stats,
	selectedTopicId,
	setSelectedTopicId,
	userId,
	dirtyIds,
}: ProgressSidebarProps) {
	const [filter, setFilter] = useState<Filter>('all');
	const pct = stats.total ? Math.round((stats.reviewed / stats.total) * 100) : 0;

	const keep = (t: ProgressTopic) => {
		if (filter === 'all') return true;
		const done = hasScore(findMyReview(t, userId));
		return filter === 'done' ? done : !done;
	};

	const filters: { key: Filter; label: string; count: number }[] = [
		{ key: 'all', label: 'Tất cả', count: stats.total },
		{ key: 'pending', label: 'Chưa chấm', count: stats.pending },
		{ key: 'done', label: 'Đã chấm', count: stats.reviewed },
	];

	const visible = councils
		.map((ct) => ({ council: ct[0], groups: groupBySession(ct.filter(keep)) }))
		.filter((c) => c.groups.length > 0);

	return (
		<aside
			className={styles.listPanel}
			aria-label='Đề tài được giao'
		>
			<div className={styles.listHeader}>
				<div className={styles.listHeaderTop}>
					<h2 className={styles.listTitle}>Đề tài được giao</h2>
					<span className={styles.listCount}>
						Đã chấm <strong>{stats.reviewed}</strong>/{stats.total}
					</span>
				</div>
				<div
					className={styles.overallTrack}
					role='progressbar'
					aria-label='Số đề tài bạn đã chấm'
					aria-valuemin={0}
					aria-valuemax={stats.total}
					aria-valuenow={stats.reviewed}
				>
					<div
						className={styles.overallFill}
						style={{ width: `${pct}%` }}
					/>
				</div>
			</div>

			<div
				className={styles.listTabs}
				role='group'
				aria-label='Lọc đề tài'
			>
				{filters.map((f) => (
					<button
						key={f.key}
						type='button'
						aria-pressed={filter === f.key}
						className={`${styles.listTab} ${filter === f.key ? styles.listTabActive : ''}`}
						onClick={() => setFilter(f.key)}
					>
						{f.label}
						{/* "Chưa chấm" là việc đang chờ chính người dùng → hồng khi > 0 */}
						<span
							className={`${styles.tabCount} ${f.key === 'pending' && f.count > 0 ? styles.tabCountAttention : ''}`}
						>
							{f.count}
						</span>
					</button>
				))}
			</div>

			<div className={styles.listBody}>
				{visible.length === 0 ? (
					<div className={styles.listEmpty}>
						{filter === 'pending'
							? 'Bạn đã chấm hết các đề tài được giao.'
							: 'Bạn chưa chấm đề tài nào.'}
					</div>
				) : (
					visible.map(({ council: c, groups }) => (
						<section
							key={c.council_id}
							className={styles.councilGroup}
						>
							<div className={styles.councilHead}>
								<h3
									className={styles.councilName}
									title={c.council_name}
								>
									{c.council_name}
								</h3>
								<div className={styles.councilMeta}>
									{c.defense_date && <span>Họp {formatDateVN(c.defense_date)}</span>}
									{c.round_name && <span>{c.round_name}</span>}
								</div>
							</div>

							{groups.map(({ session, items }) => (
								<div key={session ?? 'none'}>
									<div className={styles.sessionLabel}>
										{session ? SESSION_LABELS[session] : 'Chưa xếp phiên'}
									</div>
									<ul className={styles.topicList}>
										{items.map((t) => {
											const isSelected = t.id === selectedTopicId;
											const mine = findMyReview(t, userId);
											const done = hasScore(mine);
											const dirty = dirtyIds.has(t.id);
											return (
												<li key={t.id}>
													<button
														type='button'
														aria-current={isSelected ? 'true' : undefined}
														className={`${styles.topicItem} ${isSelected ? styles.topicItemSelected : ''}`}
														onClick={() => setSelectedTopicId(t.id)}
													>
														<span
															className={`${styles.topicTitle}`}
															title={t.title}
														>
															{t.title}
														</span>
														<span className={styles.topicMeta}>
															<span className={styles.topicRole}>
																{SEAT_ROLE_LABELS[t.my_role]}
															</span>
															{dirty ? (
																<span className={styles.topicDirty}>Chưa lưu</span>
															) : done ? (
																<span className={styles.topicScore}>
																	{mine?.rating && (
																		<span
																			className={`${styles.dot} ${styles['dot_' + RATING_TONE[mine.rating]]}`}
																			aria-hidden
																		/>
																	)}
																	{mine?.progress_percent != null && (
																		<span className={styles.num}>
																			{mine.progress_percent}%
																		</span>
																	)}
																	{mine?.rating && (
																		<span className={styles.topicRating}>
																			{PROGRESS_RATING_LABELS[mine.rating]}
																		</span>
																	)}
																</span>
															) : (
																<span className={styles.topicPending}>Chưa chấm</span>
															)}
														</span>
													</button>
												</li>
											);
										})}
									</ul>
								</div>
							))}
						</section>
					))
				)}
			</div>
		</aside>
	);
}
