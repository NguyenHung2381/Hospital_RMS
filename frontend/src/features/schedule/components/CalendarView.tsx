import { useEffect, useMemo, useRef, useState } from 'react';
import { DEADLINE_TYPE_LABELS, type RoundDeadline } from '../../round/types/round.type';
import { MONTHS_LONG, STATUS_CFG, DEADLINE_COLORS } from '../types/schedule.type';
import type { RoundRow } from '../types/schedule.type';
import type { CalMode, EventDetailData } from '../types/calendarView.type';
import {
	addDays,
	buildMonthWeeks,
	buildWeekDays,
	computeMonthsData,
	deadlineColor,
	GRID_COLS,
} from '../utils/calendarViewHelpers';
import { parseDate } from '../utils/scheduleUtils';
import { MonthGrid, WeekGrid, type CalItem } from './CalendarGrid';
import { EventDetailModal } from './EventDetailModal';
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
	const [detailModal, setDetailModal] = useState<EventDetailData | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const lastScrollTimeRef = useRef<number>(0);

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
		() => (view === 12 ? computeMonthsData(rows, year, gc) : []),
		[view, rows, year, gc],
	);

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

	// Thời gian đợt (thanh nhạt) + các mốc (1 ngày hoặc nhiều ngày) cho lưới tuần/tháng
	const items: CalItem[] = view === 12 ? [] : rows.flatMap((r) => {
		const out: CalItem[] = [];
		const s = parseDate(r.start_date);
		const e = parseDate(r.end_date);
		if (s && e) {
			const cfg = STATUS_CFG[r.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.closed;
			out.push({
				id:       `round-${r.id}`,
				title:    `${r.id} — ${r.name}`,
				color:    cfg.color,
				start:    s,
				end:      e,
				subtitle: `Thời gian đợt · ${cfg.label}`,
				muted:    true,
				onClick:  () => openEventDetail(r, undefined, true),
			});
		}
		r.deadlines.forEach((dl) => {
			const end = parseDate(dl.deadline_date);
			if (!end) return;
			const start = parseDate(dl.start_date);
			const color = deadlineColor(dl, gc);
			out.push({
				id:       `dl-${dl.id}`,
				title:    dl.name,
				color,
				start:    start && start < end ? start : end,
				end,
				subtitle: `Đợt: ${r.id} — ${r.name}`,
				onClick:  () => openEventDetail(r, dl, false, color),
			});
		});
		return out;
	});
	// Bấm ô trống → thêm mốc cho đợt đầu tiên (giữ hành vi cũ)
	const onAdd = rows.length > 0 ? () => onAddDeadline(rows[0]) : undefined;

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

			{isWeek ? (
				<WeekGrid days={buildWeekDays(weekStart!)} items={items} onAdd={onAdd} />
			) : view === 1 ? (
				<MonthGrid weeks={buildMonthWeeks(year, startMonth)} items={items} onAdd={onAdd} />
			) : (
				<div className={styles.grid} data-grid-view={view} style={{ gridTemplateColumns: GRID_COLS[view] }}>
					{monthsData.map((monthData) => (
						<MonthCard
							key={monthData.month}
							data={monthData}
							monthName={MONTHS_LONG[monthData.month]}
							rows={rows}
							onSelectMonth={onSelectMonth}
							onAddDeadline={onAddDeadline}
							onOpenEventDetail={openEventDetail}
						/>
					))}
				</div>
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
