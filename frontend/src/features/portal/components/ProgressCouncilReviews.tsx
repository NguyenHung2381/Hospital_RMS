import { PROGRESS_RATING_LABELS, type ProgressTopic } from '../../council/api/councilApi';
import { SEAT_ROLE_LABELS } from '../../council/types/council.type';
import { sanitizeCommentHtml } from '../../../shared/utils/sanitizeHtml';
import { hasScore, RATING_TONE, SEAT_ORDER } from '../utils/councilProgressHelpers';
import styles from '../pages/CouncilProgress.module.css';

interface ProgressCouncilReviewsProps {
	topic: ProgressTopic;
	userId: string | undefined;
}

/** Ý kiến của cả 5 ghế hội đồng — ghế chưa chấm vẫn hiện để biết còn thiếu ai. */
export function ProgressCouncilReviews({ topic: t, userId }: ProgressCouncilReviewsProps) {
	const scored = t.reviews.filter(hasScore);
	const percents = scored.map((r) => r.progress_percent).filter((p): p is number => p != null);
	const avg = percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : null;

	return (
		<section className={styles.panel}>
			<header className={styles.panelHead}>
				<h3 className={styles.panelTitle}>Ý kiến hội đồng</h3>
				<span className={styles.panelHint}>
					<strong className={styles.num}>
						{scored.length}/{SEAT_ORDER.length}
					</strong>{' '}
					ghế đã chấm
					{avg != null && (
						<>
							{' · '}tiến độ trung bình <strong className={styles.num}>{avg}%</strong>
						</>
					)}
				</span>
			</header>

			<ul className={styles.seatList}>
				{SEAT_ORDER.map((role) => {
					const r = t.reviews.find((x) => x.role === role);
					const done = hasScore(r);
					const isMe = !!r && r.user_id === userId;
					return (
						<li
							key={role}
							className={styles.seat}
						>
							<div className={styles.seatHead}>
								<div className={styles.seatWho}>
									<span className={styles.seatRole}>{SEAT_ROLE_LABELS[role]}</span>
									{r?.full_name && <span className={styles.seatName}>{r.full_name}</span>}
									{isMe && <span className={styles.meTag}>Bạn</span>}
								</div>
								{done && r ? (
									<div className={styles.seatScore}>
										{r.progress_percent != null && (
											<span className={`${styles.seatPercent} ${styles.num}`}>
												{r.progress_percent}%
											</span>
										)}
										{r.rating && (
											<span className={`${styles.tag} ${styles['tag_' + RATING_TONE[r.rating]]}`}>
												{PROGRESS_RATING_LABELS[r.rating]}
											</span>
										)}
									</div>
								) : (
									<span className={styles.seatPending}>Chưa chấm</span>
								)}
							</div>
							{r?.comment && (
								<div
									className={`${styles.richText} ${styles.seatComment}`}
									dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(r.comment) }}
								/>
							)}
						</li>
					);
				})}
			</ul>
		</section>
	);
}
