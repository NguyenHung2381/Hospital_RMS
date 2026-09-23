import type { RoundDeadline } from '../../round/types/round.type';
import type { PopoverData } from '../types/calendarView.type';
import type { RoundRow } from '../types/schedule.type';
import styles from './CalendarView.module.css';

interface EventPopoverProps {
	popover: PopoverData;
	onClose: () => void;
	onSelectEvent: (round: RoundRow, deadline: RoundDeadline, color: string) => void;
	onAddDeadline: (round: RoundRow) => void;
}

export function EventPopover({ popover, onClose, onSelectEvent, onAddDeadline }: EventPopoverProps) {
	return (
		<div className={styles.popoverOverlay} onClick={onClose}>
			<div className={styles.popoverCard} onClick={(e) => e.stopPropagation()}>
				<div className={styles.popoverHead}>
					<h4 className={styles.popoverTitle}>{popover.title}</h4>
					<button className={styles.popoverClose} onClick={onClose}>✕</button>
				</div>
				<div className={styles.popoverBody}>
					{popover.events.map((ev, idx) => (
						<button
							key={idx}
							className={styles.popoverItem}
							onClick={() => onSelectEvent(ev.round, ev.deadline, ev.color)}
						>
							<span className={styles.popoverDot} style={{ background: ev.color }} />
							<div className={styles.popoverItemInfo}>
								<span className={styles.popoverItemName}>{ev.deadline.name}</span>
								<span className={styles.popoverItemRound}>Đợt: {ev.round.id} — {ev.round.name}</span>
							</div>
						</button>
					))}
				</div>
				{popover.roundForAdd && (
					<div className={styles.popoverFoot}>
						<button
							className={styles.popoverAddBtn}
							onClick={() => onAddDeadline(popover.roundForAdd!)}
						>
							+ Thêm mốc mới
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
