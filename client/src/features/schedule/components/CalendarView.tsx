import { useEffect, useMemo, useRef, useState } from 'react';
import { DEADLINE_TYPE_LABELS, type RoundDeadline } from '../../round/types/round.type';
import { MONTHS_LONG, STATUS_CFG, DEADLINE_COLORS } from '../types/schedule.type';
import type { RoundRow } from '../types/schedule.type';
import type {
	CalView,
	EventDetailData,
	PopoverData,
} from '../types/calendarView.type';
import { computeMonthsData, GRID_COLS } from '../utils/calendarViewHelpers';
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
	view?:          CalView;
	startMonth?:    number;
	onPrev?:        () => void;
	onNext?:        () => void;
	onSelectMonth?: (month: number) => void;
}

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

	const monthsData = useMemo(
		() => computeMonthsData(rows, year, gc, view),
		[rows, year, gc, view],
	);

	const visibleMonths = monthsData.slice(startMonth, startMonth + view);
	const canPrev = startMonth > 0 || year > (new Date().getFullYear() - 1);
	const canNext = startMonth + view < 12 || year < (new Date().getFullYear() + 1);

	const navLabel = view === 1
		? `${MONTHS_LONG[startMonth]}, ${year}`
		: `${MONTHS_LONG[startMonth]} — ${MONTHS_LONG[Math.min(startMonth + view - 1, 11)]}, ${year}`;

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
				{visibleMonths.map((monthData) => (
					<MonthCard
						key={monthData.month}
						data={monthData}
						monthName={MONTHS_LONG[monthData.month]}
						isSingleMonthView={isSingleMonthView}
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
