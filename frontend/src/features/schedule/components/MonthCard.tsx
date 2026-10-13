import type { RoundDeadline } from '../../round/types/round.type';
import type { DayEventItem, MonthData } from '../types/calendarView.type';
import type { RoundRow } from '../types/schedule.type';
import { DOW_SHORT } from '../utils/calendarViewHelpers';
import styles from './CalendarView.module.css';

/** Thẻ 1 tháng nhỏ trong chế độ Năm (chấm màu + danh sách mốc). Tuần/tháng dùng CalendarGrid. */
interface MonthCardProps {
	data: MonthData;
	monthName: string;
	rows: RoundRow[];
	onSelectMonth?: (month: number) => void;
	onAddDeadline: (round: RoundRow) => void;
	onOpenEventDetail: (round: RoundRow, deadline?: RoundDeadline, isRoundBar?: boolean, customColor?: string) => void;
}

export function MonthCard({
	data: { month, weeks, deadlinesByDay, monthDeadlines },
	monthName,
	rows,
	onSelectMonth,
	onAddDeadline,
	onOpenEventDetail,
}: MonthCardProps) {
	return (
		<div className={styles.card} onClick={() => onSelectMonth?.(month)}>
			<div className={styles.cardHead}>
				<span className={styles.cardTitle}>{monthName}</span>
				<span className={styles.zoomHint} title='Nhấp để phóng to tháng này'>🔍 Xem tháng</span>
			</div>

			<div className={styles.calGrid}>
				<div className={styles.dowRow}>
					{DOW_SHORT.map((d) => (
						<div key={d} className={styles.dowCell}>{d}</div>
					))}
				</div>

				{weeks.map((weekDays, wi) => (
					<div key={wi} className={styles.weekRow}>
						<div className={styles.weekDaysGrid}>
							{weekDays.map((day) => {
								const dayKey = `${day.year}-${day.month}-${day.dayNum}`;
								const evs: DayEventItem[] = deadlinesByDay.get(dayKey) ?? [];

								const cellClasses = [
									styles.dayCell,
									!day.isCurrentMonth && styles.dayCellOtherMonth,
									day.isToday && styles.dayCellToday,
								].filter(Boolean).join(' ');

								return (
									<div
										key={day.key}
										className={cellClasses}
										onClick={(e) => {
											if (e.target === e.currentTarget && rows.length > 0) {
												onAddDeadline(rows[0]);
											}
										}}
									>
										<span className={`${styles.dayNum}${day.isToday ? ` ${styles.dayNumBadge}` : ''}`}>
											{day.dayNum}
										</span>

										{evs.length > 0 && (
											<div className={styles.dotRow}>
												{evs.slice(0, 3).map((ev, ei) => (
													<button
														key={ei}
														className={styles.dot}
														style={{ background: ev.color }}
														title={`${ev.deadline.name} (${ev.round.id})`}
														onClick={(e) => {
															e.stopPropagation();
															onOpenEventDetail(ev.round, ev.deadline, false, ev.color);
														}}
													/>
												))}
												{evs.length > 3 && (
													<span className={styles.dotMore}>+</span>
												)}
											</div>
										)}
									</div>
								);
							})}
						</div>
					</div>
				))}
			</div>

			{monthDeadlines.length > 0 && (
				<div className={styles.dlList}>
					{monthDeadlines.map(({ round, deadline, day, color }) => (
						<button
							key={deadline.id}
							className={styles.dlItem}
							onClick={(e) => {
								e.stopPropagation();
								onOpenEventDetail(round, deadline, false, color);
							}}
						>
							<span className={styles.dlDay}>{String(day).padStart(2, '0')}</span>
							<span className={styles.dlDot} style={{ background: color }} />
							<span className={styles.dlName}>{deadline.name}</span>
							<span className={styles.dlRound}>{round.id}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
