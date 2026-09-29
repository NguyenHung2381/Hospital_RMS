import { useEffect, useMemo, useRef, useState } from 'react';
import type { CalMode } from '../../schedule/types/calendarView.type';
import { MONTHS_LONG } from '../../schedule/types/schedule.type';
import {
	addDays,
	computeWeekEventsForDays,
	DOW,
	DOW_SHORT,
	GRID_COLS,
} from '../../schedule/utils/calendarViewHelpers';
import styles from '../../schedule/components/CalendarView.module.css';
import { formatDateVN } from '../../../shared/utils/formatDate';
import type {
	CalendarCourse,
	CalendarSession,
	SessionEvent,
} from '../types/classSchedule.type';
import {
	computeClassMonths,
	computeClassWeek,
	courseColor,
	dayKey,
	sessionTime,
	sessionTitle,
	type ClassMonthData,
} from '../utils/classCalendar';

interface ClassCalendarViewProps {
	sessions:       CalendarSession[];
	courses:        CalendarCourse[];
	year:           number;
	mode:           CalMode;
	startMonth:     number;
	/** Thứ 2 của tuần đang xem (chế độ tuần) */
	weekStart:      Date;
	onPrev:         () => void;
	onNext:         () => void;
	canPrev:        boolean;
	canNext:        boolean;
	onSelectMonth:  (month: number) => void;
	onOpenCourse:   (courseId: string) => void;
}

type Detail =
	| { kind: 'session'; session: CalendarSession }
	| { kind: 'course'; course: CalendarCourse };

interface PopoverState {
	title: string;
	events: SessionEvent[];
}

const BAR_HEIGHT = 18;
const BAR_GAP = 2;

/**
 * Lịch học tuần / tháng / năm — cùng giao diện với lịch trình nghiên cứu
 * (dùng lại CalendarView.module.css), nhưng sự kiện là buổi học và thanh dài
 * là thời gian học của khoá.
 */
export function ClassCalendarView({
	sessions, courses, year, mode, startMonth, weekStart,
	onPrev, onNext, canPrev, canNext, onSelectMonth, onOpenCourse,
}: ClassCalendarViewProps) {
	const isWeek = mode === 'week';
	const view = mode === 'year' ? 12 : 1;
	const isSingle = view === 1;
	const [popover, setPopover] = useState<PopoverState | null>(null);
	const [detail, setDetail] = useState<Detail | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const lastScrollTimeRef = useRef(0);

	const [isMobileWindow, setIsMobileWindow] = useState(() =>
		typeof window !== 'undefined' ? window.innerWidth <= 1024 : false,
	);
	useEffect(() => {
		const handleResize = () => setIsMobileWindow(window.innerWidth <= 1024);
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	// Lăn chuột chuyển kỳ CHỈ ở chế độ tuần / tháng — chế độ năm giữ cuộn trang tự nhiên
	useEffect(() => {
		const el = containerRef.current;
		if (!el || !isSingle) return;
		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();
			const now = Date.now();
			if (now - lastScrollTimeRef.current < 350) return;
			if (e.deltaY > 0 || e.deltaX > 0) onNext();
			else if (e.deltaY < 0 || e.deltaX < 0) onPrev();
			lastScrollTimeRef.current = now;
		};
		el.addEventListener('wheel', handleWheel, { passive: false });
		return () => el.removeEventListener('wheel', handleWheel);
	}, [isSingle, onPrev, onNext]);

	const monthsData = useMemo(
		() => (isWeek ? [] : computeClassMonths(sessions, courses, year, isSingle)),
		[isWeek, sessions, courses, year, isSingle],
	);
	const weekData = useMemo(
		() => (isWeek ? computeClassWeek(sessions, courses, weekStart) : null),
		[isWeek, sessions, courses, weekStart],
	);
	const visibleMonths = weekData ? [weekData] : monthsData.slice(startMonth, startMonth + view);

	const navLabel = (() => {
		if (isWeek) {
			const e = addDays(weekStart, 6);
			const fmt = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
			return weekStart.getFullYear() === e.getFullYear()
				? `${fmt(weekStart)} – ${fmt(e)}/${e.getFullYear()}`
				: `${fmt(weekStart)}/${weekStart.getFullYear()} – ${fmt(e)}/${e.getFullYear()}`;
		}
		return `${MONTHS_LONG[startMonth]}, ${year}`;
	})();
	const prevLabel = isWeek ? 'Tuần trước' : 'Tháng trước';
	const nextLabel = isWeek ? 'Tuần sau' : 'Tháng sau';

	const openSession = (session: CalendarSession) => {
		setPopover(null);
		setDetail({ kind: 'session', session });
	};

	const renderCard = (data: ClassMonthData) => {
		const { month, weeks, sessionsByDay, courseSummary, courseBars } = data;
		return (
			<div
				key={isWeek ? 'week' : month}
				className={`${styles.card}${isSingle ? ` ${styles.googleCalCard}` : ''}`}
				onClick={() => { if (!isSingle) onSelectMonth(month); }}
			>
				{!isSingle && (
					<div className={styles.cardHead}>
						<span className={styles.cardTitle}>{MONTHS_LONG[month]}</span>
						<span className={styles.zoomHint} title='Nhấp để phóng to tháng này'>🔍 Xem tháng</span>
					</div>
				)}

				<div className={`${styles.calGrid}${isSingle ? ` ${styles.googleCalGrid}` : ''}`}>
					<div className={styles.dowRow}>
						{(isSingle && !isMobileWindow ? DOW : DOW_SHORT).map((d, i) => {
							const wd = isWeek ? weeks[0]?.[i] : undefined;
							return (
								<div key={d} className={`${styles.dowCell}${wd?.isToday ? ` ${styles.dowCellToday}` : ''}`}>
									{d}
									{wd && <span className={styles.dowDate}>{wd.dayNum}/{wd.month + 1}</span>}
								</div>
							);
						})}
					</div>

					{weeks.map((weekDays, wi) => {
						const weekEvents = isSingle ? computeWeekEventsForDays(weekDays, courseBars) : [];
						const lanes = weekEvents.length ? Math.max(...weekEvents.map((e) => e.lane)) + 1 : 0;

						return (
							<div key={wi} className={styles.weekRow}>
								<div className={styles.weekDaysGrid}>
									{weekDays.map((day) => {
										const evs = sessionsByDay.get(dayKey(day.date)) ?? [];
										const cellClasses = [
											styles.dayCell,
											!day.isCurrentMonth && styles.dayCellOtherMonth,
											day.isToday && styles.dayCellToday,
										].filter(Boolean).join(' ');

										if (!isSingle) {
											return (
												<div key={day.key} className={cellClasses}>
													<span className={`${styles.dayNum}${day.isToday ? ` ${styles.dayNumBadge}` : ''}`}>
														{day.dayNum}
													</span>
													{evs.length > 0 && (
														<div className={styles.dotRow}>
															{evs.slice(0, 3).map((ev) => (
																<button
																	key={ev.session.id}
																	className={styles.dot}
																	style={{ background: ev.color }}
																	title={`${sessionTime(ev.session)} ${sessionTitle(ev.session)} (${ev.session.course_name})`}
																	onClick={(e) => {
																		e.stopPropagation();
																		openSession(ev.session);
																	}}
																/>
															))}
															{evs.length > 3 && <span className={styles.dotMore}>+</span>}
														</div>
													)}
												</div>
											);
										}

										const maxVisible = isWeek ? (isMobileWindow ? 3 : 8) : (isMobileWindow ? 1 : 3);
										const visibleEvs = evs.slice(0, maxVisible);
										const hiddenCount = evs.length - visibleEvs.length;

										return (
											<div key={day.key} className={cellClasses}>
												<div className={styles.dayCellHead}>
													<span className={`${styles.dayNum}${day.isToday ? ` ${styles.dayNumBadge}` : ''}`}>
														{day.dayNum}
													</span>
												</div>
												<div className={styles.eventChipList}>
													{visibleEvs.map((ev) => {
														const time = sessionTime(ev.session);
														return (
															<button
																key={ev.session.id}
																className={styles.eventChip}
																style={{ borderLeftColor: ev.color, background: `${ev.color}14` }}
																title={`${time} ${sessionTitle(ev.session)} — ${ev.session.course_name}${ev.session.room ? ` · ${ev.session.room}` : ''}`}
																onClick={(e) => {
																	e.stopPropagation();
																	openSession(ev.session);
																}}
															>
																<span className={styles.chipDot} style={{ background: ev.color }} />
																<span className={styles.chipTitle}>
																	{ev.session.start_time && <strong>{ev.session.start_time} </strong>}
																	{sessionTitle(ev.session)}
																</span>
															</button>
														);
													})}
													{hiddenCount > 0 && (
														<button
															className={styles.moreBtn}
															onClick={(e) => {
																e.stopPropagation();
																setPopover({
																	title: `Ngày ${day.dayNum} ${MONTHS_LONG[day.month]}, ${day.year}`,
																	events: evs,
																});
															}}
														>
															+{hiddenCount} buổi khác
														</button>
													)}
												</div>
											</div>
										);
									})}
								</div>

								{lanes > 0 && (
									<div
										className={styles.weekBarsOverlay}
										style={{ height: lanes * (BAR_HEIGHT + BAR_GAP) - BAR_GAP }}
									>
										{weekEvents.map(({ bar, lane, colL, colR, contL, contR }) => (
											<div
												key={bar.id}
												className={[
													styles.weekBar,
													styles.weekBarThin,
													contL && styles.weekBarContL,
													contR && styles.weekBarContR,
												].filter(Boolean).join(' ')}
												style={{
													left:       `calc(${(colL / 7) * 100}% + 2px)`,
													width:      `calc(${((colR - colL + 1) / 7) * 100}% - 4px)`,
													top:        lane * (BAR_HEIGHT + BAR_GAP),
													height:     BAR_HEIGHT,
													background: bar.color,
												}}
												title={`Thời gian khoá học: ${bar.label}`}
												onClick={(e) => {
													e.stopPropagation();
													setDetail({ kind: 'course', course: bar.course });
												}}
											>
												<span className={styles.weekBarLabel}>{bar.label}</span>
											</div>
										))}
									</div>
								)}
							</div>
						);
					})}
				</div>

				{!isSingle && courseSummary.length > 0 && (
					<div className={styles.dlList}>
						{courseSummary.map(({ course, count, color }) => (
							<button
								key={course.id}
								className={styles.dlItem}
								title={`${course.name}: ${count} buổi học trong tháng`}
								onClick={(e) => {
									e.stopPropagation();
									onOpenCourse(course.id);
								}}
							>
								<span className={styles.dlDay}>{count}</span>
								<span className={styles.dlDot} style={{ background: color }} />
								<span className={styles.dlName}>{course.name}</span>
								<span className={styles.dlRound}>buổi</span>
							</button>
						))}
					</div>
				)}
			</div>
		);
	};

	return (
		<div ref={containerRef} className={styles.wrapper} data-view={view} data-mode={mode}>
			{isSingle && (
				<div className={styles.navBar}>
					<button className={styles.navBtn} onClick={onPrev} disabled={!canPrev} aria-label={prevLabel} title={prevLabel}>‹</button>
					<span className={styles.navLabel}>{isWeek && <span className={styles.navKicker}>Tuần</span>}{navLabel}</span>
					<button className={styles.navBtn} onClick={onNext} disabled={!canNext} aria-label={nextLabel} title={nextLabel}>›</button>
				</div>
			)}

			<div className={styles.grid} data-grid-view={view} style={{ gridTemplateColumns: GRID_COLS[view] }}>
				{visibleMonths.map(renderCard)}
			</div>

			{popover && (
				<div className={styles.popoverOverlay} onClick={() => setPopover(null)}>
					<div className={styles.popoverCard} onClick={(e) => e.stopPropagation()}>
						<div className={styles.popoverHead}>
							<h4 className={styles.popoverTitle}>{popover.title}</h4>
							<button className={styles.popoverClose} onClick={() => setPopover(null)}>✕</button>
						</div>
						<div className={styles.popoverBody}>
							{popover.events.map((ev) => (
								<button key={ev.session.id} className={styles.popoverItem} onClick={() => openSession(ev.session)}>
									<span className={styles.popoverDot} style={{ background: ev.color }} />
									<div className={styles.popoverItemInfo}>
										<span className={styles.popoverItemName}>
											{sessionTime(ev.session) && `${sessionTime(ev.session)} · `}{sessionTitle(ev.session)}
										</span>
										<span className={styles.popoverItemRound}>Khoá: {ev.session.course_name}</span>
									</div>
								</button>
							))}
						</div>
					</div>
				</div>
			)}

			{detail && (
				<DetailModal
					detail={detail}
					onClose={() => setDetail(null)}
					onOpenCourse={(id) => {
						setDetail(null);
						onOpenCourse(id);
					}}
				/>
			)}
		</div>
	);
}

function DetailModal({
	detail, onClose, onOpenCourse,
}: {
	detail: Detail;
	onClose: () => void;
	onOpenCourse: (courseId: string) => void;
}) {
	const isSession = detail.kind === 'session';
	const courseId = isSession ? detail.session.course_id : detail.course.id;
	const color = courseColor(courseId);

	const rows: [string, string][] = isSession
		? [
			['📅 Ngày học:', formatDateVN(detail.session.session_date)],
			['🕐 Giờ học:', sessionTime(detail.session) || 'Chưa xếp giờ'],
			['🎓 Khoá học:', detail.session.course_name],
			['📚 Môn học:', detail.session.subject_name || '—'],
			['👨‍🏫 Giảng viên:', detail.session.lecturer_name || '—'],
			['📍 Phòng học:', detail.session.room || '—'],
		]
		: [
			['📅 Thời gian:', `${formatDateVN(detail.course.start_date)} — ${formatDateVN(detail.course.end_date)}`],
			['🎓 Mã khoá:', detail.course.id],
		];

	return (
		<div className={styles.popoverOverlay} onClick={onClose}>
			<div className={styles.detailCard} onClick={(e) => e.stopPropagation()}>
				<div className={styles.detailHead} style={{ borderLeftColor: color }}>
					<div>
						<span className={styles.detailBadge} style={{ background: `${color}20`, color }}>
							{isSession ? 'Buổi học' : 'Thời gian khoá học'}
						</span>
						<h3 className={styles.detailTitle}>
							{isSession ? sessionTitle(detail.session) : detail.course.name}
						</h3>
					</div>
					<button className={styles.popoverClose} onClick={onClose}>✕</button>
				</div>

				<div className={styles.detailBody}>
					{rows.map(([label, val]) => (
						<div key={label} className={styles.detailRow}>
							<span className={styles.detailLabel}>{label}</span>
							<span className={styles.detailVal}>{val}</span>
						</div>
					))}
				</div>

				<div className={styles.detailFoot}>
					<button className={styles.detailEditBtn} onClick={() => onOpenCourse(courseId)}>
						📋 Mở lịch học & điểm danh của khoá
					</button>
				</div>
			</div>
		</div>
	);
}
