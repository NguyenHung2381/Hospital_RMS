import { PlusSvg } from '@/assets/icons';
import type { RoundDeadline } from '../../round/types/round.type';
import {
	BAR_DEFAULT_COLORS,
	DEADLINE_COLORS,
	STATUS_CFG,
	type BarKind,
	type CtxTarget,
	type DragMode,
	type RoundRow,
	type ZoomLevel,
} from '../types/schedule.type';
import { parseDate } from '../utils/scheduleUtils';
import styles from '../pages/Schedule.module.css';

interface GanttRowProps {
	round:       RoundRow;
	zoom:        ZoomLevel;
	timelineW:   number;
	monthData:   { label: string; startPct: number; widthPct: number; idx: number }[];
	fineLines:   { pct: number; strong: boolean }[];
	todayPct:    number | null;
	toPct:       (date: Date) => number;
	barOvr:      { roundId: string; barKind: BarKind; l: number; w: number } | null;
	pinOvr:      { deadlineId: string; pct: number } | null;
	deadlineBarOvr: { deadlineId: string; l: number; w: number } | null;
	dragEndedRef: React.MutableRefObject<boolean>;
	gc:          (key: string, fallback: string) => string;
	startBarDrag: (e: React.MouseEvent, mode: DragMode, round: RoundRow, barKind: BarKind, initL: number, initW: number) => void;
	startPinDrag: (e: React.MouseEvent, round: RoundRow, deadline: RoundDeadline, initPct: number, initStartPct: number | null) => void;
	startDeadlineBarDrag: (e: React.MouseEvent, mode: DragMode, round: RoundRow, deadline: RoundDeadline, initL: number, initW: number) => void;
	openCtx:     (e: React.MouseEvent, target: CtxTarget) => void;
	onAddDeadline: () => void;
}

export function GanttRow({
	round, zoom, timelineW,
	monthData, fineLines, todayPct, toPct,
	barOvr, pinOvr, deadlineBarOvr, dragEndedRef,
	gc, startBarDrag, startPinDrag, startDeadlineBarDrag,
	openCtx, onAddDeadline,
}: GanttRowProps) {
	const start = parseDate(round.start_date);
	const end   = parseDate(round.end_date);
	if (!start || !end) return null;

	// Derive registration/supplement bars from round_deadlines
	const regDeadline = round.deadlines.find(
		(d) => d.deadline_type === 'registration' && d.start_date,
	);
	const supDeadline = round.deadlines.find(
		(d) => d.deadline_type === 'supplement' && d.start_date,
	);
	const regStart = regDeadline ? parseDate(regDeadline.start_date) : null;
	const regEnd   = regDeadline ? parseDate(regDeadline.deadline_date) : null;
	const supStart = supDeadline ? parseDate(supDeadline.start_date) : null;
	const supEnd   = supDeadline ? parseDate(supDeadline.deadline_date) : null;

	const status   = STATUS_CFG[round.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.closed;
	const regColor = gc(`bar-${round.id}-registration`, BAR_DEFAULT_COLORS.registration);
	const resColor = gc(`bar-${round.id}-research`,     status.color);
	const supColor = gc(`bar-${round.id}-supplement`,   BAR_DEFAULT_COLORS.supplement);

	const resBaseL = toPct(start);
	const resBaseW = Math.max(0, toPct(end) - resBaseL);
	const regBaseL = regStart ? toPct(regStart) : 0;
	const regBaseW = regStart && regEnd ? Math.max(0, toPct(regEnd) - regBaseL) : 0;
	const supBaseL = supStart ? toPct(supStart) : 0;
	const supBaseW = supStart && supEnd ? Math.max(0, toPct(supEnd) - supBaseL) : 0;

	const resOvr = barOvr?.roundId === round.id && barOvr.barKind === 'research' ? barOvr : null;
	const resL   = resOvr ? resOvr.l : resBaseL;
	const resW   = resOvr ? resOvr.w : resBaseW;

	return (
		<div className={styles.ganttRow}>
			{/* Label column */}
			<div className={styles.labelCol}>
				<span className={styles.roundId}>{round.id}</span>
				<span className={styles.roundName}>{round.name}</span>
				<div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
					<span
						className={styles.statusBadge}
						style={{ '--status-color': status.color } as React.CSSProperties}
					>
						{status.label}
					</span>
					<span className={styles.roundMeta}>Đợt {round.round_number} · {round.year}</span>
				</div>
				{round.topic_total > 0 && (
					<div className={styles.topicStats}>
						<span className={styles.topicStat}>
							<span className={styles.topicStatDot} style={{ background: '#2eb87a' }} />
							{round.topic_active} mở
						</span>
						{round.topic_pending > 0 && (
							<span className={styles.topicStat}>
								<span className={styles.topicStatDot} style={{ background: '#ef9f27' }} />
								{round.topic_pending} chờ
							</span>
						)}
						<span className={styles.topicStatDivider}>/</span>
						<span className={styles.topicStat}>{round.topic_total} đề tài</span>
					</div>
				)}
				<button
					className={styles.addBtn}
					onClick={onAddDeadline}
					title='Thêm mốc thời gian'
				>
					<PlusSvg style={{ width: 11, height: 11 }} />
					Thêm mốc
				</button>
			</div>

			{/* Timeline */}
			<div
				className={styles.timeline}
				style={{ width: `${timelineW}px`, cursor: 'pointer' }}
				onClick={(e) => openCtx(e, { kind: 'row', round })}
			>
				{/* Grid lines */}
				{monthData.map(({ startPct, idx }) => (
					<div key={idx} className={styles.gridLine} style={{ left: `${startPct}%` }} />
				))}
				{fineLines.map(({ pct, strong }, i) => (
					<div
						key={i}
						className={strong ? styles.weekLine : styles.dayLine}
						style={{ left: `${pct}%` }}
					/>
				))}
				{todayPct !== null && (
					<div className={styles.todayLine} style={{ left: `${todayPct}%` }} />
				)}

				{/* Registration bar */}
				{regStart && regEnd && regBaseW > 0 && (
					<div
						className={styles.bar}
						style={{ left: `${regBaseL}%`, width: `${regBaseW}%`, background: regColor, top: 6, height: 20 }}
						title={`Đăng ký: ${regDeadline?.start_date} → ${regDeadline?.deadline_date}`}
						onClick={(e) => {
							if (dragEndedRef.current) return;
							openCtx(e, { kind: 'bar', round, barKind: 'registration' });
						}}
					>
						{zoom >= 2 && <span className={styles.barTypeLabel}>Đăng ký</span>}
					</div>
				)}

				{/* Research bar */}
				{resBaseW > 0 && (
					<div
						className={`${styles.bar}${resOvr ? ` ${styles.barActive}` : ''}`}
						style={{ left: `${resL}%`, width: `${resW}%`, background: resColor, top: 32, height: 52 }}
						title={`Nghiên cứu: ${round.start_date} → ${round.end_date}`}
						onMouseDown={(e) => startBarDrag(e, 'move', round, 'research', resBaseL, resBaseW)}
						onClick={(e) => {
							if (dragEndedRef.current) return;
							openCtx(e, { kind: 'bar', round, barKind: 'research' });
						}}
					>
						<div
							className={`${styles.barHandle} ${styles.barHandleL}`}
							onMouseDown={(e) => { e.stopPropagation(); startBarDrag(e, 'left', round, 'research', resBaseL, resBaseW); }}
						/>
						{zoom >= 2 && (
							<span className={styles.barTypeLabel}>
								Nghiên cứu · {round.start_date} → {round.end_date}
							</span>
						)}
						<div
							className={`${styles.barHandle} ${styles.barHandleR}`}
							onMouseDown={(e) => { e.stopPropagation(); startBarDrag(e, 'right', round, 'research', resBaseL, resBaseW); }}
						/>
					</div>
				)}

				{/* Supplement bar */}
				{supStart && supEnd && supBaseW > 0 && (
					<div
						className={styles.bar}
						style={{ left: `${supBaseL}%`, width: `${supBaseW}%`, background: supColor, top: 92, height: 20 }}
						title={`Bổ sung: ${supDeadline?.start_date} → ${supDeadline?.deadline_date}`}
						onClick={(e) => {
							if (dragEndedRef.current) return;
							openCtx(e, { kind: 'bar', round, barKind: 'supplement' });
						}}
					>
						{zoom >= 2 && <span className={styles.barTypeLabel}>Bổ sung</span>}
					</div>
				)}

				{/* Deadline bars / pins */}
				{round.deadlines
					.filter((dl) => dl !== regDeadline && dl !== supDeadline)
					.map((dl) => {
						const dlDate = parseDate(dl.deadline_date);
						if (!dlDate) return null;
						const color = gc(
							`deadline-${dl.id}`,
							DEADLINE_COLORS[dl.deadline_type ?? ''] ?? '#888888',
						);
						const dlStartDate = parseDate(dl.start_date);

						if (dlStartDate) {
							const baseL = toPct(dlStartDate);
							const baseW = Math.max(0.3, toPct(dlDate) - baseL);
							const ovr   = deadlineBarOvr?.deadlineId === dl.id ? deadlineBarOvr : null;
							const barL  = ovr ? ovr.l : baseL;
							const barW  = ovr ? ovr.w : baseW;

							return (
								<div
									key={dl.id}
									className={`${styles.bar}${ovr ? ` ${styles.barActive}` : ''}`}
									style={{ left: `${barL}%`, width: `${barW}%`, background: color, top: 126, height: 20, zIndex: 4 }}
									title={`${dl.name}\n${dl.start_date} → ${dl.deadline_date}\nKéo để di chuyển · Nhấp để xem tùy chọn`}
									onMouseDown={(e) => startDeadlineBarDrag(e, 'move', round, dl, baseL, baseW)}
									onClick={(e) => {
										if (dragEndedRef.current) return;
										openCtx(e, { kind: 'deadline', round, deadline: dl });
									}}
								>
									<div
										className={`${styles.barHandle} ${styles.barHandleL}`}
										onMouseDown={(e) => { e.stopPropagation(); startDeadlineBarDrag(e, 'left', round, dl, baseL, baseW); }}
									/>
									<span className={styles.barTypeLabel}>{dl.name}</span>
									<div
										className={`${styles.barHandle} ${styles.barHandleR}`}
										onMouseDown={(e) => { e.stopPropagation(); startDeadlineBarDrag(e, 'right', round, dl, baseL, baseW); }}
									/>
								</div>
							);
						}

						// Pin (no start_date)
						const basePct   = toPct(dlDate);
						const activePct = pinOvr?.deadlineId === dl.id ? pinOvr.pct : basePct;
						const isActive  = pinOvr?.deadlineId === dl.id;

						return (
							<button
								key={dl.id}
								className={`${styles.deadlinePin}${isActive ? ` ${styles.deadlinePinActive}` : ''}`}
								style={{ left: `${activePct}%` }}
								title={`${dl.name}\n${dl.deadline_date}\nKéo để di chuyển · Nhấp để xem tùy chọn`}
								onMouseDown={(e) => startPinDrag(e, round, dl, basePct, null)}
								onClick={(e) => {
									if (dragEndedRef.current) return;
									openCtx(e, { kind: 'deadline', round, deadline: dl });
								}}
							>
								<div className={styles.deadlineLine} style={{ background: color }} />
								<div className={styles.deadlineDot}  style={{ background: color }} />
								<span className={styles.deadlinePhase} style={{ color }}>{dl.phase}</span>
								{zoom >= 2 && (
									<span className={styles.deadlineLabel} style={{ color }}>{dl.name}</span>
								)}
							</button>
						);
					})}
			</div>
		</div>
	);
}
