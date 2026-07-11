import { useEffect, useMemo, useRef, useState } from 'react';
import { DEADLINE_TYPE_LABELS, type RoundDeadline } from '../../round/types/round.type';
import { DEADLINE_COLORS, STATUS_CFG } from '../types/schedule.type';
import type { RoundRow } from '../types/schedule.type';
import { parseDate } from '../utils/scheduleUtils';
import styles from './CalendarView.module.css';

const DOW = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const DOW_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MONTH_NAMES = [
	'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
	'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
	'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

type CalView = 1 | 3 | 6 | 12;

interface CalendarViewProps {
	rows:           RoundRow[];
	year:           number;
	gc:             (key: string, fallback: string) => string;
	onEditDeadline: (round: RoundRow, deadline: RoundDeadline) => void;
	onAddDeadline:  (round: RoundRow) => void;
	view?:          CalView;
	startMonth?:    number;
	onPrev?:        () => void;
	onNext?:        () => void;
	onSelectMonth?: (month: number) => void;
}

interface CalDay {
	date:           Date;
	dayNum:         number;
	month:          number;
	year:           number;
	isCurrentMonth: boolean;
	isToday:        boolean;
	key:            string;
}

interface DayEventItem {
	round:    RoundRow;
	deadline: RoundDeadline;
	color:    string;
}

interface MonthDeadlineSummary {
	round:    RoundRow;
	deadline: RoundDeadline;
	day:      number;
	color:    string;
}

interface EventBar {
	id:            string;
	label:         string;
	color:         string;
	startDate:     Date;
	endDate:       Date;
	thin:          boolean;
	round:         RoundRow;
	deadline?:     RoundDeadline;
	isRoundPeriod?: boolean;
}

interface WeekEvent {
	bar:   EventBar;
	lane:  number;
	colL:  number;
	colR:  number;
	contL: boolean;
	contR: boolean;
}

interface PopoverData {
	title:        string;
	events:       DayEventItem[];
	roundForAdd?: RoundRow;
}

interface EventDetailData {
	title:        string;
	round:        RoundRow;
	deadline?:    RoundDeadline;
	startDateStr: string;
	endDateStr?:  string;
	color:        string;
	typeLabel?:   string;
	statusLabel?: string;
}

function isSameDay(d1: Date, d2: Date): boolean {
	return (
		d1.getFullYear() === d2.getFullYear() &&
		d1.getMonth() === d2.getMonth() &&
		d1.getDate() === d2.getDate()
	);
}

function computeWeekEventsForDays(weekDays: CalDay[], bars: EventBar[]): WeekEvent[] {
	if (!weekDays.length) return [];
	const weekStart = new Date(weekDays[0].date.getFullYear(), weekDays[0].date.getMonth(), weekDays[0].date.getDate(), 0, 0, 0);
	const weekEnd   = new Date(weekDays[6].date.getFullYear(), weekDays[6].date.getMonth(), weekDays[6].date.getDate(), 23, 59, 59);

	const relevant = bars.filter(b => b.endDate >= weekStart && b.startDate <= weekEnd);

	const laneEnds: Date[] = [];
	return relevant.map(bar => {
		let colL = 0;
		while (colL < 7 && weekDays[colL].date < bar.startDate && !isSameDay(weekDays[colL].date, bar.startDate)) {
			colL++;
		}
		if (colL >= 7) colL = 0;

		let colR = 6;
		while (colR >= 0 && weekDays[colR].date > bar.endDate && !isSameDay(weekDays[colR].date, bar.endDate)) {
			colR--;
		}
		if (colR < 0) colR = 6;

		let lane = laneEnds.findIndex(e => e < bar.startDate);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(bar.endDate);
		} else {
			laneEnds[lane] = bar.endDate;
		}

		return {
			bar,
			lane,
			colL:  Math.min(colL, colR),
			colR:  Math.max(colL, colR),
			contL: bar.startDate < weekStart,
			contR: bar.endDate > weekEnd,
		};
	});
}

const GRID_COLS: Record<CalView, string> = {
	1:  '1fr',
	3:  'repeat(3, 1fr)',
	6:  'repeat(3, 1fr)',
	12: 'repeat(4, 1fr)',
};

export function CalendarView({
	rows, year, gc, onEditDeadline, onAddDeadline,
	view = 12, startMonth = 0, onPrev, onNext, onSelectMonth,
}: CalendarViewProps) {
	const [popover, setPopover] = useState<PopoverData | null>(null);
	const [detailModal, setDetailModal] = useState<EventDetailData | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const lastScrollTimeRef = useRef<number>(0);

	const [isMobileWindow, setIsMobileWindow] = useState(() =>
		typeof window !== 'undefined' ? window.innerWidth <= 1024 : false,
	);

	useEffect(() => {
		const handleResize = () => setIsMobileWindow(window.innerWidth <= 1024);
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	// CHỈ kích hoạt lăn chuột chuyển tháng ở chế độ xem 1 tháng (view === 1)
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const handleWheel = (e: WheelEvent) => {
			if (view !== 1) return; // Chế độ 3, 6, 12 tháng giữ nguyên cuộn trang tự nhiên

			e.preventDefault();
			const now = Date.now();
			if (now - lastScrollTimeRef.current < 350) return;

			if (e.deltaY > 0 || e.deltaX > 0) {
				if (onNext) {
					onNext();
					lastScrollTimeRef.current = now;
				}
			} else if (e.deltaY < 0 || e.deltaX < 0) {
				if (onPrev) {
					onPrev();
					lastScrollTimeRef.current = now;
				}
			}
		};

		el.addEventListener('wheel', handleWheel, { passive: false });
		return () => el.removeEventListener('wheel', handleWheel);
	}, [view, onPrev, onNext]);

	const monthsData = useMemo(() => {
		const today = new Date();
		return Array.from({ length: 12 }, (_, m) => {
			const firstDate = new Date(year, m, 1);
			const firstDow  = (firstDate.getDay() + 6) % 7;
			const totalDays = new Date(year, m + 1, 0).getDate();

			const cells: CalDay[] = [];

			const prevMonthLastDate = new Date(year, m, 0).getDate();
			for (let i = firstDow - 1; i >= 0; i--) {
				const d = prevMonthLastDate - i;
				const date = new Date(year, m - 1, d);
				cells.push({
					date,
					dayNum:         d,
					month:          date.getMonth(),
					year:           date.getFullYear(),
					isCurrentMonth: false,
					isToday:        isSameDay(date, today),
					key:            `prev-${date.getMonth()}-${d}`,
				});
			}

			for (let d = 1; d <= totalDays; d++) {
				const date = new Date(year, m, d);
				cells.push({
					date,
					dayNum:         d,
					month:          m,
					year,
					isCurrentMonth: true,
					isToday:        isSameDay(date, today),
					key:            `cur-${m}-${d}`,
				});
			}

			const remaining = 7 - (cells.length % 7);
			if (remaining < 7) {
				for (let d = 1; d <= remaining; d++) {
					const date = new Date(year, m + 1, d);
					cells.push({
						date,
						dayNum:         d,
						month:          date.getMonth(),
						year:           date.getFullYear(),
						isCurrentMonth: false,
						isToday:        isSameDay(date, today),
						key:            `next-${date.getMonth()}-${d}`,
					});
				}
			}

			const weeks: CalDay[][] = [];
			for (let i = 0; i < cells.length; i += 7) {
				weeks.push(cells.slice(i, i + 7));
			}

			const deadlinesByDay = new Map<string, DayEventItem[]>();
			const monthDeadlines: MonthDeadlineSummary[] = [];

			rows.forEach((r) => {
				r.deadlines.forEach((dl) => {
					const endDate = parseDate(dl.deadline_date);
					if (!endDate) return;
					const startDate = parseDate(dl.start_date) || endDate;
					const color = gc(`deadline-${dl.id}`, DEADLINE_COLORS[dl.deadline_type ?? ''] ?? '#888888');

					// 1. Quét từng ngày trong khoảng thời gian để tạo chấm màu đại diện trên lịch
					const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
					const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

					while (cur <= end) {
						const k = `${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`;
						if (!deadlinesByDay.has(k)) deadlinesByDay.set(k, []);
						
						const existing = deadlinesByDay.get(k)!;
						if (!existing.some(item => item.deadline.id === dl.id)) {
							existing.push({ round: r, deadline: dl, color });
						}
						cur.setDate(cur.getDate() + 1);
					}

					// 2. Thêm VÀO DANH SÁCH TÓM TẮT DƯỚI THẺ CHỈ 1 LẦN duy nhất đại diện cho mốc này trong tháng
					if (endDate.getFullYear() === year && endDate.getMonth() === m) {
						if (!monthDeadlines.some(item => item.deadline.id === dl.id)) {
							monthDeadlines.push({ round: r, deadline: dl, day: endDate.getDate(), color });
						}
					}
				});
			});

			monthDeadlines.sort((a, b) => a.day - b.day);

			const mStart = new Date(year, m, 1);
			const mEnd   = new Date(year, m + 1, 0, 23, 59, 59);
			const eventBars: EventBar[] = [];

			// Thanh kéo dài CHỈ tính toán khi hiển thị 1 tháng
			if (view === 1) {
				rows.forEach((r) => {
					const s = parseDate(r.start_date);
					const e = parseDate(r.end_date);
					if (!s || !e || s > mEnd || e < mStart) return;
					const cfg = STATUS_CFG[r.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.closed;
					eventBars.push({
						id:            `round-${r.id}`,
						label:         `${r.id} — ${r.name}`,
						color:         cfg.color,
						startDate:     s,
						endDate:       e,
						thin:          true,
						round:         r,
						isRoundPeriod: true,
					});
				});

				rows.forEach((r) => {
					r.deadlines.forEach((dl) => {
						if (!dl.start_date) return;
						const s = parseDate(dl.start_date);
						const e = parseDate(dl.deadline_date);
						if (!s || !e || s > mEnd || e < mStart || isSameDay(s, e)) return;
						eventBars.push({
							id:        `dl-${dl.id}`,
							label:     dl.name,
							color:     gc(`deadline-${dl.id}`, DEADLINE_COLORS[dl.deadline_type ?? ''] ?? '#888888'),
							startDate: s,
							endDate:   e,
							thin:      false,
							round:     r,
							deadline:  dl,
						});
					});
				});
			}

			return { month: m, weeks, deadlinesByDay, monthDeadlines, eventBars };
		});
	}, [rows, year, gc, view]);

	const visibleMonths = monthsData.slice(startMonth, startMonth + view);
	const canPrev = startMonth > 0 || year > (new Date().getFullYear() - 1);
	const canNext = startMonth + view < 12 || year < (new Date().getFullYear() + 1);

	const navLabel = view === 1
		? `${MONTH_NAMES[startMonth]}, ${year}`
		: `${MONTH_NAMES[startMonth]} — ${MONTH_NAMES[Math.min(startMonth + view - 1, 11)]}, ${year}`;

	const isSingleMonthView = view === 1;

	const openEventDetail = (round: RoundRow, deadline?: RoundDeadline, isRoundBar?: boolean, customColor?: string) => {
		if (deadline) {
			const typeLabel = deadline.deadline_type ? DEADLINE_TYPE_LABELS[deadline.deadline_type] : undefined;
			const color = customColor || gc(`deadline-${deadline.id}`, DEADLINE_COLORS[deadline.deadline_type ?? ''] ?? '#888888');
			setDetailModal({
				title:        deadline.name,
				round,
				deadline,
				startDateStr: deadline.start_date || deadline.deadline_date,
				endDateStr:   deadline.start_date ? deadline.deadline_date : undefined,
				color,
				typeLabel,
			});
		} else if (isRoundBar || round) {
			const cfg = STATUS_CFG[round.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.closed;
			setDetailModal({
				title:        `${round.id} — ${round.name}`,
				round,
				startDateStr: round.start_date,
				endDateStr:   round.end_date,
				color:        cfg.color,
				statusLabel:  cfg.label,
			});
		}
	};

	return (
		<div ref={containerRef} className={styles.wrapper} data-view={view}>
			{/* Navigation Header */}
			{view < 12 && (
				<div className={styles.navBar}>
					<button className={styles.navBtn} onClick={onPrev} disabled={!canPrev} aria-label='Tháng trước'>‹</button>
					<span className={styles.navLabel}>{navLabel}</span>
					<button className={styles.navBtn} onClick={onNext} disabled={!canNext} aria-label='Tháng sau'>›</button>
				</div>
			)}

			<div className={styles.grid} data-grid-view={view} style={{ gridTemplateColumns: GRID_COLS[view] }}>
				{visibleMonths.map(({ month, weeks, deadlinesByDay, monthDeadlines, eventBars }) => {
					return (
						<div
							key={month}
							className={`${styles.card}${isSingleMonthView ? ` ${styles.googleCalCard}` : ''}`}
							onClick={() => {
								if (!isSingleMonthView && onSelectMonth) {
									onSelectMonth(month);
								}
							}}
						>
							{!isSingleMonthView && (
								<div className={styles.cardHead}>
									<span className={styles.cardTitle}>{MONTH_NAMES[month]}</span>
									<span className={styles.zoomHint} title="Nhấp để phóng to tháng này">🔍 Xem tháng</span>
								</div>
							)}

							<div className={`${styles.calGrid}${isSingleMonthView ? ` ${styles.googleCalGrid}` : ''}`}>
								<div className={styles.dowRow}>
									{(isSingleMonthView && !isMobileWindow ? DOW : DOW_SHORT).map((d) => (
										<div key={d} className={styles.dowCell}>{d}</div>
									))}
								</div>

								{weeks.map((weekDays, wi) => {
									const weekEvents = computeWeekEventsForDays(weekDays, eventBars);
									const lanes      = weekEvents.length
										? Math.max(...weekEvents.map(e => e.lane)) + 1
										: 0;

									const barHeight = 18;
									const barGap    = 2;

									return (
										<div key={wi} className={styles.weekRow}>
											<div className={styles.weekDaysGrid}>
												{weekDays.map((day) => {
													const dayKey = `${day.year}-${day.month}-${day.dayNum}`;
													const evs    = deadlinesByDay.get(dayKey) ?? [];

													const cellClasses = [
														styles.dayCell,
														!day.isCurrentMonth && styles.dayCellOtherMonth,
														day.isToday          && styles.dayCellToday,
													].filter(Boolean).join(' ');

													if (isSingleMonthView) {
														const maxVisible = isMobileWindow ? 1 : 3;
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
																				openEventDetail(ev.round, ev.deadline, false, ev.color);
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
																				setPopover({
																					title:       `Ngày ${day.dayNum} ${MONTH_NAMES[day.month]}, ${day.year}`,
																					events:      evs,
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
																				openEventDetail(ev.round, ev.deadline, false, ev.color);
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
															contL    && styles.weekBarContL,
															contR    && styles.weekBarContR,
														].filter(Boolean).join(' ');

														return (
															<div
																key={bar.id}
																className={cls}
																style={{
																	left:       `calc(${(colL / 7) * 100}% + 2px)`,
																	width:      `calc(${((colR - colL + 1) / 7) * 100}% - 4px)`,
																	top:        lane * (barHeight + barGap),
																	height:     barHeight,
																	background: bar.color,
																}}
																title={bar.label}
																onClick={(e) => {
																	e.stopPropagation();
																	openEventDetail(bar.round, bar.deadline, bar.isRoundPeriod, bar.color);
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
											onClick={() => openEventDetail(round, deadline, false, color)}
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
				})}
			</div>

			{/* Overflow List Popover */}
			{popover && (
				<div className={styles.popoverOverlay} onClick={() => setPopover(null)}>
					<div className={styles.popoverCard} onClick={(e) => e.stopPropagation()}>
						<div className={styles.popoverHead}>
							<h4 className={styles.popoverTitle}>{popover.title}</h4>
							<button className={styles.popoverClose} onClick={() => setPopover(null)}>✕</button>
						</div>
						<div className={styles.popoverBody}>
							{popover.events.map((ev, idx) => (
								<button
									key={idx}
									className={styles.popoverItem}
									onClick={() => {
										setPopover(null);
										openEventDetail(ev.round, ev.deadline, false, ev.color);
									}}
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
									onClick={() => {
										const r = popover.roundForAdd!;
										setPopover(null);
										onAddDeadline(r);
									}}
								>
									+ Thêm mốc mới
								</button>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Event Detail Modal */}
			{detailModal && (
				<div className={styles.popoverOverlay} onClick={() => setDetailModal(null)}>
					<div className={styles.detailCard} onClick={(e) => e.stopPropagation()}>
						<div className={styles.detailHead} style={{ borderLeftColor: detailModal.color }}>
							<div>
								<span className={styles.detailBadge} style={{ background: `${detailModal.color}20`, color: detailModal.color }}>
									{detailModal.typeLabel || detailModal.statusLabel || 'Sự kiện'}
								</span>
								<h3 className={styles.detailTitle}>{detailModal.title}</h3>
							</div>
							<button className={styles.popoverClose} onClick={() => setDetailModal(null)}>✕</button>
						</div>

						<div className={styles.detailBody}>
							<div className={styles.detailRow}>
								<span className={styles.detailLabel}>📅 Thời gian:</span>
								<span className={styles.detailVal}>
									{detailModal.endDateStr ? `${detailModal.startDateStr} — ${detailModal.endDateStr}` : detailModal.startDateStr}
								</span>
							</div>
							<div className={styles.detailRow}>
								<span className={styles.detailLabel}>🏥 Đợt nghiên cứu:</span>
								<span className={styles.detailVal}>
									<strong>{detailModal.round.id}</strong> — {detailModal.round.name}
								</span>
							</div>
						</div>

						<div className={styles.detailFoot}>
							{detailModal.deadline ? (
								<button
									className={styles.detailEditBtn}
									onClick={() => {
										if (detailModal.deadline) {
											onEditDeadline(detailModal.round, detailModal.deadline);
											setDetailModal(null);
										}
									}}
								>
									✏️ Chỉnh sửa mốc thời gian
								</button>
							) : (
								<button
									className={styles.detailEditBtn}
									onClick={() => {
										const { round } = detailModal;
										setDetailModal(null);
										onAddDeadline(round);
									}}
								>
									+ Thêm mốc cho đợt này
								</button>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
