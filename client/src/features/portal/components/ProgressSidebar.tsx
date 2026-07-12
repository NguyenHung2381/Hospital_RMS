import type { ProgressTopic } from '../../council/api/councilApi';
import { SEAT_ROLE_LABELS } from '../../council/types/council.type';
import { groupBySession, SESSION_LABELS } from '../utils/councilProgressHelpers';
import styles from '../pages/CouncilProgress.module.css';

interface ProgressSidebarProps {
	councils: ProgressTopic[][];
	stats: { total: number; reviewed: number; pending: number };
	selectedTopicId: string | null;
	setSelectedTopicId: (id: string) => void;
	userId: string | undefined;
}

export function ProgressSidebar({
	councils,
	stats,
	selectedTopicId,
	setSelectedTopicId,
	userId,
}: ProgressSidebarProps) {
	return (
		<aside className={styles.sidebarPane}>
			<div className={styles.sidebarHeader}>
				<h3 className={styles.sidebarTitle}>Đề tài được giao</h3>
				<div className={styles.sidebarStats}>
					<span
						className={styles.statTag}
						title='Tổng số đề tài'
					>
						📋 <strong>{stats.total}</strong>
					</span>
					<span
						className={`${styles.statTag} ${styles.statReviewedTag}`}
						title='Đã đánh giá'
					>
						✅ <strong>{stats.reviewed}</strong>
					</span>
					<span
						className={`${styles.statTag} ${styles.statPendingTag}`}
						title='Chờ đánh giá'
					>
						⏳ <strong>{stats.pending}</strong>
					</span>
				</div>
			</div>

			{councils.map((councilTopics) => {
				const c = councilTopics[0];
				return (
					<div
						key={c.council_id}
						className={styles.sidebarCouncilGroup}
					>
						<div className={styles.sidebarCouncilHeader}>
							<h3
								className={styles.sidebarCouncilName}
								title={c.council_name}
							>
								{c.council_name}
							</h3>
							<div className={styles.sidebarCouncilMeta}>
								{c.round_name && <span>{c.round_name}</span>}
								{c.defense_date && <span>Ngày: {c.defense_date}</span>}
							</div>
						</div>

						{groupBySession(councilTopics).map(({ session, items }) => (
							<div
								key={session ?? 'none'}
								className={styles.sidebarSessionSection}
							>
								<div className={styles.sidebarSessionTitle}>
									{session === 'morning' ? (
										<span className={styles.sessionMorningIcon}>
											☀️ {SESSION_LABELS[session]}
										</span>
									) : session === 'afternoon' ? (
										<span className={styles.sessionAfternoonIcon}>
											⛅ {SESSION_LABELS[session]}
										</span>
									) : (
										<span>Chưa xếp phiên</span>
									)}
								</div>
								<div className={styles.sidebarTopicList}>
									{items.map((t, idx) => {
										const isSelected = t.id === selectedTopicId;
										const mine = t.reviews.find((r) => r.user_id === userId);
										const isReviewed =
											mine &&
											(mine.rating != null || mine.progress_percent != null);
										return (
											<div
												key={t.id}
												className={`${styles.sidebarTopicCard} ${isSelected ? styles.activeTopicCard : ''}`}
												onClick={() => setSelectedTopicId(t.id)}
											>
												<div className={styles.sidebarTopicCardHeader}>
													<span className={styles.sidebarTopicIndex}>
														{idx + 1}
													</span>
													<div
														className={styles.sidebarTopicTitle}
														title={t.title}
													>
														{t.title}
													</div>
												</div>
												<div className={styles.sidebarTopicMeta}>
													<span className={styles.sidebarRoleBadge}>
														{SEAT_ROLE_LABELS[t.my_role]}
													</span>
													<div className={styles.sidebarTopicStatus}>
														{isReviewed ? (
															<span
																className={styles.statusDotReviewed}
																title='Đã đánh giá'
															/>
														) : (
															<span
																className={styles.statusDotPending}
																title='Chờ đánh giá'
															/>
														)}
														<span className={styles.statusText}>
															{mine?.progress_percent != null
																? `${mine.progress_percent}%`
																: 'Chờ'}
														</span>
													</div>
												</div>
												{mine?.progress_percent != null && (
													<div className={styles.sidebarProgressTrack}>
														<div
															className={styles.sidebarProgressFill}
															style={{ width: `${mine.progress_percent}%` }}
														/>
													</div>
												)}
											</div>
										);
									})}
								</div>
							</div>
						))}
					</div>
				);
			})}
		</aside>
	);
}
