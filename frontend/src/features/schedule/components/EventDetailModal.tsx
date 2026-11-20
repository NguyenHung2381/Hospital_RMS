import { useId, useRef } from 'react';
import { useFocusTrap } from '@/shared/hooks/useFocusTrap';
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
	const cardRef = useRef<HTMLDivElement>(null);
	const titleId = useId();
	// Giữ focus trong thẻ chi tiết, Esc để đóng, trả focus về chỗ cũ khi đóng
	useFocusTrap(cardRef, { active: true, onEscape: onClose });

	return (
		<div className={styles.popoverOverlay} onClick={onClose}>
			<div
				ref={cardRef}
				className={styles.detailCard}
				role='dialog'
				aria-modal='true'
				aria-labelledby={titleId}
				tabIndex={-1}
				onClick={(e) => e.stopPropagation()}
			>
				<div className={styles.detailHead} style={{ borderLeftColor: detail.color }}>
					<div>
						<span className={styles.detailBadge} style={{ background: `${detail.color}20`, color: detail.color }}>
							{detail.typeLabel || detail.statusLabel || 'Sự kiện'}
						</span>
						<h3 id={titleId} className={styles.detailTitle}>{detail.title}</h3>
					</div>
					<button type='button' className={styles.popoverClose} onClick={onClose} aria-label='Đóng'>✕</button>
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
							type='button'
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
							type='button'
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
