import type { RoundDeadline } from '../../round/types/round.type';
import type { DayEventItem, MonthData, PopoverData } from '../types/calendarView.type';
import { MONTHS_LONG, type RoundRow } from '../types/schedule.type';
import { computeWeekEventsForDays, DOW, DOW_SHORT } from '../utils/calendarViewHelpers';
import styles from './CalendarView.module.css';

interface MonthCardProps {
	data: MonthData;
	monthName: string;
	isSingleMonthView: boolean;
	/** Chế độ tuần: 1 hàng, ô cao hơn, hiện nhiều mốc hơn, tiêu đề cột kèm ngày */
	isWeekView?: boolean;
	isMobileWindow: boolean;
	rows: RoundRow[];
	onSelectMonth?: (month: number) => void;
	onAddDeadline: (round: RoundRow) => void;
	onOpenEventDetail: (round: RoundRow, deadline?: RoundDeadline, isRoundBar?: boolean, customColor?: string) => void;
	onOpenPopover: (data: PopoverData) => void;
}

export function MonthCard({
	data: { month, weeks, deadlinesByDay, monthDeadlines, eventBars },
	monthName,
	isSingleMonthView,
	isWeekView = false,
	isMobileWindow,
	rows,
	onSelectMonth,
	onAddDeadline,
	onOpenEventDetail,
	onOpenPopover,
}: MonthCardProps) {
	return (
		<div
			className={`${styles.card}${isSingleMonthView ? ` ${styles.googleCalCard}` : ''}`}
			onClick={() => {
				if (!isSingleMonthView && onSelectMonth) {
					onSelectMonth(month);
				}
			}}
		>
			{!isSingleMonthView && (
				<div className={styles.cardHead}>
					<span className={styles.cardTitle}>{monthName}</span>
					<span className={styles.zoomHint} title='Nhấp để phóng to tháng này'>🔍 Xem tháng</span>
				</div>
			)}

			<div className={`${styles.calGrid}${isSingleMonthView ? ` ${styles.googleCalGrid}` : ''}`}>
				<div className={styles.dowRow}>
					{(isSingleMonthView && !isMobileWindow ? DOW : DOW_SHORT).map((d, i) => {
						const wd = isWeekView ? weeks[0]?.[i] : undefined;
						return (
							<div key={d} className={`${styles.dowCell}${wd?.isToday ? ` ${styles.dowCellToday}` : ''}`}>
								{d}
								{wd && <span className={styles.dowDate}>{wd.dayNum}/{wd.month + 1}</span>}
							</div>
						);
					})}
				</div>

				{weeks.map((weekDays, wi) => {
					const weekEvents = computeWeekEventsForDays(weekDays, eventBars);
					const lanes = weekEvents.length
						? Math.max(...weekEvents.map((e) => e.lane)) + 1
						: 0;

					const barHeight = 18;
					const barGap = 2;

					return (
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

									if (isSingleMonthView) {
										const maxVisible = isWeekView ? (isMobileWindow ? 3 : 8) : (isMobileWindow ? 1 : 3);
										const visibleEvs = evs.slice(0, maxVisible);
										const hiddenCount = evs.length - visibleEvs.length;

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
												<div className={styles.dayCellHead}>
													<span className={`${styles.dayNum}${day.isToday ? ` ${styles.dayNumBadge}` : ''}`}>
														{day.dayNum}
													</span>
												</div>

												<div className={styles.eventChipList}>
													{visibleEvs.map((ev, ei) => (
														<button
															key={ei}
															className={styles.eventChip}
															style={{
																borderLeftColor: ev.color,
																background: `${ev.color}14`,
															}}
															title={`${ev.deadline.name} (${ev.round.id})`}
															onClick={(e) => {
																e.stopPropagation();
																onOpenEventDetail(ev.round, ev.deadline, false, ev.color);
															}}
														>
															<span className={styles.chipDot} style={{ background: ev.color }} />
															<span className={styles.chipTitle}>{ev.deadline.name}</span>
														</button>
													))}

													{hiddenCount > 0 && (
														<button
															className={styles.moreBtn}
															onClick={(e) => {
																e.stopPropagation();
																onOpenPopover({
																	title: `Ngày ${day.dayNum} ${MONTHS_LONG[day.month]}, ${day.year}`,
																	events: evs,
																	roundForAdd: rows[0],
																});
															}}
														>
															+{hiddenCount} mốc khác
														</button>
													)}
												</div>
											</div>
										);
									}

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

							{/* Thanh dài CHỈ hiển thị ở chế độ 1 tháng (isSingleMonthView) */}
							{isSingleMonthView && lanes > 0 && (
								<div
									className={styles.weekBarsOverlay}
									style={{ height: lanes * (barHeight + barGap) - barGap }}
								>
									{weekEvents.map(({ bar, lane, colL, colR, contL, contR }) => {
										const cls = [
											styles.weekBar,
											bar.thin && styles.weekBarThin,
											contL && styles.weekBarContL,
											contR && styles.weekBarContR,
										].filter(Boolean).join(' ');

										return (
											<div
												key={bar.id}
												className={cls}
												style={{
													left: `calc(${(colL / 7) * 100}% + 2px)`,
													width: `calc(${((colR - colL + 1) / 7) * 100}% - 4px)`,
													top: lane * (barHeight + barGap),
													height: barHeight,
													background: bar.color,
												}}
												title={bar.label}
												onClick={(e) => {
													e.stopPropagation();
													onOpenEventDetail(bar.round, bar.deadline, bar.isRoundPeriod, bar.color);
												}}
											>
												<span className={styles.weekBarLabel}>{bar.label}</span>
											</div>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</div>

			{!isSingleMonthView && monthDeadlines.length > 0 && (
				<div className={styles.dlList}>
					{monthDeadlines.map(({ round, deadline, day, color }) => (
						<button
							key={deadline.id}
							className={styles.dlItem}
							onClick={() => onOpenEventDetail(round, deadline, false, color)}
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
