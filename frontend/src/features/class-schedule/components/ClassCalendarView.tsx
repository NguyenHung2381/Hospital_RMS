import { useEffect, useMemo, useRef, useState } from 'react';
import type { CalMode } from '../../schedule/types/calendarView.type';
import { MONTHS_LONG } from '../../schedule/types/schedule.type';
import {
	addDays,
	buildMonthWeeks,
	buildWeekDays,
	DOW_SHORT,
	GRID_COLS,
} from '../../schedule/utils/calendarViewHelpers';
import { MonthGrid, WeekGrid, type CalItem } from '../../schedule/components/CalendarGrid';
import styles from '../../schedule/components/CalendarView.module.css';
import { formatDateVN, parseDate } from '../../../shared/utils/formatDate';
import type { CalendarSession } from '../types/classSchedule.type';
import {
	computeClassMonths,
	courseColor,
	dayKey,
	sessionTime,
	sessionTitle,
	type ClassMonthData,
} from '../utils/classCalendar';

interface ClassCalendarViewProps {
	sessions:       CalendarSession[];
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

type Detail = { kind: 'session'; session: CalendarSession };

/**
 * Lịch học tuần / tháng / năm — cùng giao diện với lịch trình nghiên cứu:
 * tuần/tháng dùng lưới kiểu Google (CalendarGrid), năm dùng thẻ tháng nhỏ.
 * Chỉ hiện buổi học (ngày dạy thật) — không vẽ thanh thời gian cả đợt của khoá.
 */
export function ClassCalendarView({
	sessions, year, mode, startMonth, weekStart,
	onPrev, onNext, canPrev, canNext, onSelectMonth, onOpenCourse,
}: ClassCalendarViewProps) {
	const isWeek = mode === 'week';
	const isSingle = mode !== 'year';
	const [detail, setDetail] = useState<Detail | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const lastScrollTimeRef = useRef(0);

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
		() => (isSingle ? [] : computeClassMonths(sessions, year)),
		[isSingle, sessions, year],
	);

	const items: CalItem[] = !isSingle ? [] : sessions.flatMap((session): CalItem[] => {
		const d = parseDate(session.session_date);
		if (!d) return [];
		return [{
			id:        session.id,
			title:     sessionTitle(session),
			color:     courseColor(session.course_id),
			start:     d,
			end:       d,
			startTime: session.start_time ?? undefined,
			endTime:   session.end_time ?? undefined,
			subtitle:  `${session.course_name}${session.room ? ` · ${session.room}` : ''}`,
			onClick:   () => setDetail({ kind: 'session', session }),
		}];
	});

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

	const renderYearCard = ({ month, weeks, sessionsByDay, courseSummary }: ClassMonthData) => (
		<div key={month} className={styles.card} onClick={() => onSelectMonth(month)}>
			<div className={styles.cardHead}>
				<span className={styles.cardTitle}>{MONTHS_LONG[month]}</span>
				<span className={styles.zoomHint} title='Nhấp để phóng to tháng này'>🔍 Xem tháng</span>
			</div>

			<div className={styles.calGrid}>
				<div className={styles.dowRow}>
					{DOW_SHORT.map((d) => <div key={d} className={styles.dowCell}>{d}</div>)}
				</div>

				{weeks.map((weekDays, wi) => (
					<div key={wi} className={styles.weekRow}>
						<div className={styles.weekDaysGrid}>
							{weekDays.map((day) => {
								const evs = sessionsByDay.get(dayKey(day.date)) ?? [];
								const cellClasses = [
									styles.dayCell,
									!day.isCurrentMonth && styles.dayCellOtherMonth,
									day.isToday && styles.dayCellToday,
								].filter(Boolean).join(' ');
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
															setDetail({ kind: 'session', session: ev.session });
														}}
													/>
												))}
												{evs.length > 3 && <span className={styles.dotMore}>+</span>}
											</div>
										)}
									</div>
								);
							})}
						</div>
					</div>
				))}
			</div>

			{courseSummary.length > 0 && (
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

	return (
		<div ref={containerRef} className={styles.wrapper} data-view={isSingle ? 1 : 12} data-mode={mode}>
			{isSingle && (
				<div className={styles.navBar}>
					<button className={styles.navBtn} onClick={onPrev} disabled={!canPrev} aria-label={prevLabel} title={prevLabel}>‹</button>
					<span className={styles.navLabel}>{isWeek && <span className={styles.navKicker}>Tuần</span>}{navLabel}</span>
					<button className={styles.navBtn} onClick={onNext} disabled={!canNext} aria-label={nextLabel} title={nextLabel}>›</button>
				</div>
			)}

			{isWeek ? (
				<WeekGrid days={buildWeekDays(weekStart)} items={items} />
			) : isSingle ? (
				<MonthGrid weeks={buildMonthWeeks(year, startMonth)} items={items} />
			) : (
				<div className={styles.grid} data-grid-view={12} style={{ gridTemplateColumns: GRID_COLS[12] }}>
					{monthsData.map(renderYearCard)}
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
	const { session } = detail;
	const courseId = session.course_id;
	const color = courseColor(courseId);

	const rows: [string, string][] = [
		['📅 Ngày học:', formatDateVN(session.session_date)],
		['🕐 Giờ học:', sessionTime(session) || 'Chưa xếp giờ'],
		['🎓 Khoá học:', session.course_name],
		['📚 Bài học:', session.subject_name || '—'],
		['👨‍🏫 Giảng viên:', session.lecturer_name || '—'],
		['📍 Phòng học:', session.room || '—'],
	];

	return (
		<div className={styles.popoverOverlay} onClick={onClose}>
			<div className={styles.detailCard} onClick={(e) => e.stopPropagation()}>
				<div className={styles.detailHead} style={{ borderLeftColor: color }}>
					<div>
						<span className={styles.detailBadge} style={{ background: `${color}20`, color }}>
							Buổi học
						</span>
						<h3 className={styles.detailTitle}>
							{sessionTitle(session)}
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
