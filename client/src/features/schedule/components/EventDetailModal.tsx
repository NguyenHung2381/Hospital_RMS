import type { RoundDeadline } from '../../round/types/round.type';
import type { EventDetailData } from '../types/calendarView.type';
import type { RoundRow } from '../types/schedule.type';
import styles from './CalendarView.module.css';

interface EventDetailModalProps {
	detail: EventDetailData;
	onClose: () => void;
	onEditDeadline: (round: RoundRow, deadline: RoundDeadline) => void;
	onAddDeadline: (round: RoundRow) => void;
}

export function EventDetailModal({ detail, onClose, onEditDeadline, onAddDeadline }: EventDetailModalProps) {
	return (
		<div className={styles.popoverOverlay} onClick={onClose}>
			<div className={styles.detailCard} onClick={(e) => e.stopPropagation()}>
				<div className={styles.detailHead} style={{ borderLeftColor: detail.color }}>
					<div>
						<span className={styles.detailBadge} style={{ background: `${detail.color}20`, color: detail.color }}>
							{detail.typeLabel || detail.statusLabel || 'Sự kiện'}
						</span>
						<h3 className={styles.detailTitle}>{detail.title}</h3>
					</div>
					<button className={styles.popoverClose} onClick={onClose}>✕</button>
				</div>

				<div className={styles.detailBody}>
					<div className={styles.detailRow}>
						<span className={styles.detailLabel}>📅 Thời gian:</span>
						<span className={styles.detailVal}>
							{detail.endDateStr ? `${detail.startDateStr} — ${detail.endDateStr}` : detail.startDateStr}
						</span>
					</div>
					<div className={styles.detailRow}>
						<span className={styles.detailLabel}>🏥 Đợt nghiên cứu:</span>
						<span className={styles.detailVal}>
							<strong>{detail.round.id}</strong> — {detail.round.name}
						</span>
					</div>
				</div>

				<div className={styles.detailFoot}>
					{detail.deadline?.phase === -1 ? null : detail.deadline ? (
						<button
							className={styles.detailEditBtn}
							onClick={() => {
								if (detail.deadline) {
									onEditDeadline(detail.round, detail.deadline);
									onClose();
								}
							}}
						>
							✏️ Chỉnh sửa mốc thời gian
						</button>
					) : (
						<button
							className={styles.detailEditBtn}
							onClick={() => {
								onClose();
								onAddDeadline(detail.round);
							}}
						>
							+ Thêm mốc cho đợt này
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
