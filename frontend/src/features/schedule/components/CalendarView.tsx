import { useEffect, useMemo, useRef, useState } from 'react';
import { DEADLINE_TYPE_LABELS, type RoundDeadline } from '../../round/types/round.type';
import { MONTHS_LONG, STATUS_CFG, DEADLINE_COLORS } from '../types/schedule.type';
import type { RoundRow } from '../types/schedule.type';
import type {
	CalMode,
	EventDetailData,
	PopoverData,
} from '../types/calendarView.type';
import { addDays, computeMonthsData, computeWeekData, GRID_COLS } from '../utils/calendarViewHelpers';
import { EventDetailModal } from './EventDetailModal';
import { EventPopover } from './EventPopover';
import { MonthCard } from './MonthCard';
import styles from './CalendarView.module.css';

interface CalendarViewProps {
	rows:           RoundRow[];
	year:           number;
	gc:             (key: string, fallback: string) => string;
	onEditDeadline: (round: RoundRow, deadline: RoundDeadline) => void;
	onAddDeadline:  (round: RoundRow) => void;
	mode?:          CalMode;
	startMonth?:    number;
	/** Thứ 2 của tuần đang xem (chế độ tuần) */
	weekStart?:     Date;
	onPrev?:        () => void;
	onNext?:        () => void;
	canPrev?:       boolean;
	canNext?:       boolean;
	onSelectMonth?: (month: number) => void;
}

export function CalendarView({
	rows, year, gc, onEditDeadline, onAddDeadline,
	mode = 'year', startMonth = 0, weekStart, onPrev, onNext, canPrev = true, canNext = true, onSelectMonth,
}: CalendarViewProps) {
	const isWeek = mode === 'week' && !!weekStart;
	const view = mode === 'year' ? 12 : 1;
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

	// CHỈ kích hoạt lăn chuột chuyển kỳ ở chế độ tuần / tháng (view === 1)
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const handleWheel = (e: WheelEvent) => {
			if (view !== 1) return; // Chế độ năm giữ nguyên cuộn trang tự nhiên

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

	const monthsData = useMemo(
		() => (isWeek ? [] : computeMonthsData(rows, year, gc, view)),
		[isWeek, rows, year, gc, view],
	);
	const weekData = useMemo(
		() => (isWeek ? computeWeekData(rows, weekStart!, gc) : null),
		[isWeek, rows, weekStart, gc],
	);

	const visibleMonths = weekData ? [weekData] : monthsData.slice(startMonth, startMonth + view);

	const navLabel = (() => {
		if (isWeek) {
			const s = weekStart!;
			const e = addDays(s, 6);
			const fmt = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
			return s.getFullYear() === e.getFullYear()
				? `${fmt(s)} – ${fmt(e)}/${e.getFullYear()}`
				: `${fmt(s)}/${s.getFullYear()} – ${fmt(e)}/${e.getFullYear()}`;
		}
		return `${MONTHS_LONG[startMonth]}, ${year}`;
	})();
	const prevLabel = isWeek ? 'Tuần trước' : 'Tháng trước';
	const nextLabel = isWeek ? 'Tuần sau' : 'Tháng sau';

	const isSingleMonthView = view === 1;

	const openEventDetail = (round: RoundRow, deadline?: RoundDeadline, isRoundBar?: boolean, customColor?: string) => {
		if (deadline) {
			const typeLabel =
				deadline.phase === -1
					? 'Ngày báo cáo hội đồng'
					: deadline.deadline_type
						? DEADLINE_TYPE_LABELS[deadline.deadline_type]
						: undefined;
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
		<div ref={containerRef} className={styles.wrapper} data-view={view} data-mode={mode}>
			{/* Navigation Header */}
			{view < 12 && (
				<div className={styles.navBar}>
					<button className={styles.navBtn} onClick={onPrev} disabled={!canPrev} aria-label={prevLabel} title={prevLabel}>‹</button>
					<span className={styles.navLabel}>{isWeek && <span className={styles.navKicker}>Tuần</span>}{navLabel}</span>
					<button className={styles.navBtn} onClick={onNext} disabled={!canNext} aria-label={nextLabel} title={nextLabel}>›</button>
				</div>
			)}

			<div className={styles.grid} data-grid-view={view} style={{ gridTemplateColumns: GRID_COLS[view] }}>
				{visibleMonths.map((monthData) => (
					<MonthCard
						key={isWeek ? 'week' : monthData.month}
						data={monthData}
						monthName={MONTHS_LONG[monthData.month]}
						isSingleMonthView={isSingleMonthView}
						isWeekView={isWeek}
						isMobileWindow={isMobileWindow}
						rows={rows}
						onSelectMonth={onSelectMonth}
						onAddDeadline={onAddDeadline}
						onOpenEventDetail={openEventDetail}
						onOpenPopover={setPopover}
					/>
				))}
			</div>

			{popover && (
				<EventPopover
					popover={popover}
					onClose={() => setPopover(null)}
					onSelectEvent={(round, deadline, color) => {
						setPopover(null);
						openEventDetail(round, deadline, false, color);
					}}
					onAddDeadline={onAddDeadline}
				/>
			)}

			{detailModal && (
				<EventDetailModal
					detail={detailModal}
					onClose={() => setDetailModal(null)}
					onEditDeadline={onEditDeadline}
					onAddDeadline={onAddDeadline}
				/>
			)}
		</div>
	);
}
