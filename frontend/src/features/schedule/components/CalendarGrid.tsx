import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { CalDay } from '../types/calendarView.type';
import { DOW, DOW_SHORT, isSameDay } from '../utils/calendarViewHelpers';
import styles from './CalendarGrid.module.css';

/**
 * Lưới lịch kiểu Google Calendar dùng chung cho lịch NCKH và lịch học:
 * - Tháng: ô cao cố định (cả tháng vừa khít màn hình), sự kiện nhiều ngày và
 *   1 ngày chung số dòng của ô, dư thì gộp vào "+N".
 * - Tuần: hàng "Cả ngày" ở trên + lưới giờ, buổi có giờ đặt đúng vị trí.
 */
export interface CalItem {
	id: string;
	title: string;
	color: string;
	/** Ngày bắt đầu / kết thúc (tính cả ngày cuối) */
	start: Date;
	end: Date;
	/** 'HH:mm' — có giờ thì vẽ dạng "● 08:00 Tên" và vào lưới giờ ở chế độ tuần */
	startTime?: string;
	endTime?: string;
	/** Dòng phụ trong tooltip / popover */
	subtitle?: string;
	/** Thanh nhạt màu (thời gian đợt / khoá học) */
	muted?: boolean;
	onClick: () => void;
}

const SLOT_H = 20;
const SLOT_GAP = 2;
const SLOT = SLOT_H + SLOT_GAP;
const DAY_HEAD_H = 24;
const DOW_ROW_H = 32;
const DAY_MS = 86_400_000;

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a: Date, b: Date) => Math.round((dayStart(a).getTime() - dayStart(b).getTime()) / DAY_MS);
const isMultiDay = (it: CalItem) => !isSameDay(it.start, it.end);
const isTimed = (it: CalItem) => !!it.startTime && !isMultiDay(it);
const toMin = (t: string) => {
	const [h, m] = t.split(':').map(Number);
	return h * 60 + (m || 0);
};
const covers = (it: CalItem, d: Date) => dayDiff(it.start, d) <= 0 && dayDiff(it.end, d) >= 0;
const timeRange = (it: CalItem) => (it.startTime ? `${it.startTime}${it.endTime ? `–${it.endTime}` : ''}` : '');
const tooltip = (it: CalItem) =>
	[timeRange(it), it.title].filter(Boolean).join(' ') + (it.subtitle ? ` — ${it.subtitle}` : '');

/** Thứ tự như Google: nhiều ngày (dài trước) → cả ngày → có giờ (sớm trước). */
function compareItems(a: CalItem, b: CalItem): number {
	const ma = isMultiDay(a);
	if (ma !== isMultiDay(b)) return ma ? -1 : 1;
	const byStart = a.start.getTime() - b.start.getTime();
	if (byStart) return byStart;
	const bySpan = (b.end.getTime() - b.start.getTime()) - (a.end.getTime() - a.start.getTime());
	if (bySpan) return bySpan;
	const ta = isTimed(a);
	if (ta !== isTimed(b)) return ta ? 1 : -1;
	return (a.startTime ?? '').localeCompare(b.startTime ?? '');
}

interface Placed {
	item: CalItem;
	slot: number;
	colL: number;
	colR: number;
	contL: boolean;
	contR: boolean;
}

/** Xếp mỗi sự kiện vào dòng thấp nhất còn trống trên mọi cột nó phủ. */
function layoutWeek(days: CalDay[], items: CalItem[]): Placed[] {
	const first = days[0].date;
	const occ: boolean[][] = [];
	return items
		.filter((it) => dayDiff(it.end, first) >= 0 && dayDiff(it.start, first) <= 6)
		.sort(compareItems)
		.map((item) => {
			const from = dayDiff(item.start, first);
			const to = dayDiff(item.end, first);
			const colL = Math.max(0, from);
			const colR = Math.min(6, to);
			let slot = 0;
			while (occ[slot]?.slice(colL, colR + 1).some(Boolean)) slot++;
			(occ[slot] ??= Array(7).fill(false)).fill(true, colL, colR + 1);
			return { item, slot, colL, colR, contL: from < 0, contR: to > 6 };
		});
}

function useCompact() {
	const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1024px)').matches);
	useEffect(() => {
		const mq = window.matchMedia('(max-width: 1024px)');
		const handler = (e: MediaQueryListEvent) => setCompact(e.matches);
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	}, []);
	return compact;
}

/** Chiều cao để lưới vừa khít phần còn lại của màn hình (tính khi trang ở đầu). */
function useFitHeight(ref: RefObject<HTMLElement | null>, min: number) {
	const [h, setH] = useState(min);
	useLayoutEffect(() => {
		const calc = () => {
			const el = ref.current;
			if (!el) return;
			const top = el.getBoundingClientRect().top + window.scrollY;
			setH(Math.max(min, Math.floor(window.innerHeight - top - 20)));
		};
		calc();
		window.addEventListener('resize', calc);
		return () => window.removeEventListener('resize', calc);
	}, [ref, min]);
	return h;
}

function Chip({ item, flatL, flatR, onClick }: {
	item: CalItem;
	flatL?: boolean;
	flatR?: boolean;
	onClick: () => void;
}) {
	const timed = isTimed(item);
	const cls = [
		styles.chip,
		timed ? styles.chipTimed : styles.chipFilled,
		item.muted && styles.chipMuted,
		flatL && styles.chipFlatL,
		flatR && styles.chipFlatR,
	].filter(Boolean).join(' ');
	return (
		<button
			type='button'
			className={cls}
			style={timed ? undefined : { background: item.color }}
			title={tooltip(item)}
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
		>
			{timed && <span className={styles.chipDot} style={{ background: item.color }} />}
			{timed && <span className={styles.chipTime}>{item.startTime}</span>}
			<span className={styles.chipTitle}>{item.title}</span>
		</button>
	);
}

/** Các sự kiện của 1 hàng tuần, giới hạn `maxSlots` dòng; ngày nào dư thì dòng cuối là "+N". */
function WeekItems({ days, items, maxSlots, top, onMore }: {
	days: CalDay[];
	items: CalItem[];
	maxSlots: number;
	top: number;
	onMore: (day: CalDay, anchor: HTMLElement) => void;
}) {
	const placed = layoutWeek(days, items);
	const L = Math.max(1, maxSlots);
	const perDay = days.map((_, c) => placed.filter((p) => p.colL <= c && c <= p.colR));
	const overflow = perDay.map((ps) => ps.some((p) => p.slot >= L));
	const visibleOn = (p: Placed, c: number) => p.slot < L - 1 || (p.slot === L - 1 && !overflow[c]);
	const pos = (c0: number, c1: number, slot: number) => ({
		left: `calc(${(c0 / 7) * 100}% + 2px)`,
		width: `calc(${((c1 - c0 + 1) / 7) * 100}% - 4px)`,
		top: top + slot * SLOT,
		height: SLOT_H,
	});

	return (
		<>
			{placed.flatMap((p) => {
				// Cắt thanh thành các đoạn liền nhau ở những ngày nó còn hiển thị được
				const segs: [number, number][] = [];
				for (let c = p.colL; c <= p.colR; c++) {
					if (!visibleOn(p, c)) continue;
					const last = segs[segs.length - 1];
					if (last && last[1] === c - 1) last[1] = c;
					else segs.push([c, c]);
				}
				return segs.map(([c0, c1]) => (
					<div key={`${p.item.id}-${c0}`} className={styles.slot} style={pos(c0, c1, p.slot)}>
						<Chip
							item={p.item}
							flatL={c0 > p.colL || p.contL}
							flatR={c1 < p.colR || p.contR}
							onClick={p.item.onClick}
						/>
					</div>
				));
			})}
			{days.map((day, c) => {
				if (!overflow[c]) return null;
				const hidden = perDay[c].filter((p) => !visibleOn(p, c)).length;
				return (
					<div key={`more-${day.key}`} className={styles.slot} style={pos(c, c, L - 1)}>
						<button
							type='button'
							className={styles.moreBtn}
							onClick={(e) => {
								e.stopPropagation();
								onMore(day, e.currentTarget);
							}}
						>
							+{hidden} khác
						</button>
					</div>
				);
			})}
		</>
	);
}

interface PopoverState {
	day: CalDay;
	rect: DOMRect;
}

/** Popover cạnh ô ngày, liệt kê mọi sự kiện của ngày đó. */
function DayPopover({ state, items, onClose, onAdd }: {
	state: PopoverState;
	items: CalItem[];
	onClose: () => void;
	onAdd?: () => void;
}) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	const { day, rect } = state;
	const dayItems = items.filter((it) => covers(it, day.date)).sort(compareItems);
	const W = 260;
	const left = Math.min(Math.max(8, rect.left + rect.width / 2 - W / 2), window.innerWidth - W - 8);
	const top = Math.min(Math.max(8, rect.top - 60), window.innerHeight - 380);

	return (
		<div className={styles.popOverlay} onClick={onClose}>
			<div className={styles.pop} style={{ left, top: Math.max(8, top), width: W }} onClick={(e) => e.stopPropagation()}>
				<button type='button' className={styles.popClose} onClick={onClose} aria-label='Đóng'>✕</button>
				<div className={styles.popHead}>
					<span className={styles.popDow}>{DOW_SHORT[(day.date.getDay() + 6) % 7]}</span>
					<span className={`${styles.popDayNum}${day.isToday ? ` ${styles.today}` : ''}`}>{day.dayNum}</span>
				</div>
				<div className={styles.popList}>
					{dayItems.map((it) => (
						<div key={it.id} className={styles.popRow}>
							<Chip
								item={it}
								flatL={dayDiff(it.start, day.date) < 0}
								flatR={dayDiff(it.end, day.date) > 0}
								onClick={() => {
									onClose();
									it.onClick();
								}}
							/>
						</div>
					))}
				</div>
				{onAdd && (
					<button type='button' className={styles.popAdd} onClick={() => { onClose(); onAdd(); }}>
						+ Thêm mốc mới
					</button>
				)}
			</div>
		</div>
	);
}

interface GridProps {
	items: CalItem[];
	/** Bấm vào ô trống / nút thêm trong popover (lịch NCKH: thêm mốc) */
	onAdd?: () => void;
}

export function MonthGrid({ weeks, items, onAdd }: GridProps & { weeks: CalDay[][] }) {
	const ref = useRef<HTMLDivElement>(null);
	const compact = useCompact();
	// Tối thiểu đủ 3 dòng sự kiện/ô; màn thấp quá thì trang cuộn thay vì ô bé lại
	const height = useFitHeight(ref, DOW_ROW_H + weeks.length * (DAY_HEAD_H + 3 * SLOT + 2));
	const [pop, setPop] = useState<PopoverState | null>(null);
	const rowH = (height - DOW_ROW_H) / weeks.length;
	const maxSlots = Math.floor((rowH - DAY_HEAD_H - 2) / SLOT);

	return (
		<div
			ref={ref}
			className={styles.month}
			style={{ height, gridTemplateRows: `${DOW_ROW_H}px repeat(${weeks.length}, minmax(0, 1fr))` }}
		>
			<div className={styles.dowRow}>
				{(compact ? DOW_SHORT : DOW).map((d) => <div key={d} className={styles.dowCell}>{d}</div>)}
			</div>
			{weeks.map((days) => (
				<div key={days[0].key} className={styles.weekRow}>
					{days.map((day) => (
						<div
							key={day.key}
							className={`${styles.dayCell}${day.isCurrentMonth ? '' : ` ${styles.otherMonth}`}${onAdd ? ` ${styles.clickable}` : ''}`}
							onClick={onAdd}
						>
							<span className={`${styles.dayNum}${day.isToday ? ` ${styles.today}` : ''}`}>{day.dayNum}</span>
						</div>
					))}
					<WeekItems
						days={days}
						items={items}
						maxSlots={maxSlots}
						top={DAY_HEAD_H}
						onMore={(day, el) => setPop({ day, rect: el.getBoundingClientRect() })}
					/>
				</div>
			))}
			{pop && <DayPopover state={pop} items={items} onClose={() => setPop(null)} onAdd={onAdd} />}
		</div>
	);
}

const ALL_DAY_MAX = 3;
const GUTTER = 56;
// Chừa chỗ phía trên lưới giờ để nhãn giờ đầu tiên không bị cắt
const TIME_PAD = 10;

interface TimedEvent {
	item: CalItem;
	s: number;
	e: number;
	col: number;
	cols: number;
}

/** Buổi trùng giờ xếp cạnh nhau: mỗi cụm chồng lấn chia đều bề ngang. */
function layoutDay(items: CalItem[]): TimedEvent[] {
	const evs = items
		.map((item) => {
			const s = toMin(item.startTime!);
			const e = item.endTime ? toMin(item.endTime) : s + 60;
			return { item, s, e: e > s ? e : s + 30, col: 0, cols: 1 };
		})
		.sort((a, b) => a.s - b.s || b.e - a.e);
	let cluster: TimedEvent[] = [];
	let clusterEnd = -1;
	let colEnds: number[] = [];
	const flush = () => {
		const n = colEnds.length;
		cluster.forEach((x) => (x.cols = n));
		cluster = [];
		colEnds = [];
	};
	evs.forEach((ev) => {
		if (ev.s >= clusterEnd) flush();
		let col = colEnds.findIndex((end) => end <= ev.s);
		if (col === -1) col = colEnds.push(ev.e) - 1;
		else colEnds[col] = ev.e;
		ev.col = col;
		cluster.push(ev);
		clusterEnd = Math.max(clusterEnd, ev.e);
	});
	flush();
	return evs;
}

export function WeekGrid({ days, items, onAdd }: GridProps & { days: CalDay[] }) {
	const ref = useRef<HTMLDivElement>(null);
	const compact = useCompact();
	const height = useFitHeight(ref, 480);
	const [pop, setPop] = useState<PopoverState | null>(null);
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const t = setInterval(() => setNow(new Date()), 60_000);
		return () => clearInterval(t);
	}, []);

	const inWeek = items.filter((it) => dayDiff(it.end, days[0].date) >= 0 && dayDiff(it.start, days[6].date) <= 0);
	const allDay = inWeek.filter((it) => !isTimed(it));
	const timed = inWeek.filter(isTimed);

	const lanes = layoutWeek(days, allDay).reduce((m, p) => Math.max(m, p.slot + 1), 0);
	const allDaySlots = Math.min(lanes, ALL_DAY_MAX);
	const allDayH = Math.max(1, allDaySlots) * SLOT + 6;

	// Khung giờ mặc định 07–18, nới ra nếu có buổi sớm/muộn hơn
	const startH = Math.min(7, ...timed.map((it) => Math.floor(toMin(it.startTime!) / 60)));
	const endH = Math.max(18, ...timed.map((it) => Math.ceil(toMin(it.endTime ?? it.startTime!) / 60 + (it.endTime ? 0 : 1))));
	const hours = Array.from({ length: Math.min(24, endH) - startH }, (_, i) => startH + i);
	const HEAD_H = 56;
	const hourH = Math.max(24, (height - HEAD_H - allDayH - TIME_PAD) / hours.length);
	const nowMin = now.getHours() * 60 + now.getMinutes();

	return (
		<div ref={ref} className={styles.week} style={{ minHeight: height }}>
			<div className={styles.weekHead} style={{ height: HEAD_H, gridTemplateColumns: `${GUTTER}px repeat(7, minmax(0, 1fr))` }}>
				<div />
				{days.map((day, i) => (
					<div key={day.key} className={`${styles.weekHeadCell}${day.isToday ? ` ${styles.weekHeadToday}` : ''}`}>
						<span className={styles.weekHeadDow}>{(compact ? DOW_SHORT : DOW)[i]}</span>
						<span className={`${styles.weekHeadNum}${day.isToday ? ` ${styles.today}` : ''}`}>{day.dayNum}</span>
					</div>
				))}
			</div>

			<div className={styles.allDayRow} style={{ height: allDayH, gridTemplateColumns: `${GUTTER}px 1fr` }}>
				<div className={styles.gutterLabel}>Cả ngày</div>
				<div className={styles.allDayBody}>
					{days.map((day, c) => (
						<div key={day.key} className={styles.allDayCell} style={{ left: `${(c / 7) * 100}%` }} />
					))}
					<WeekItems
						days={days}
						items={allDay}
						maxSlots={lanes > ALL_DAY_MAX ? ALL_DAY_MAX : ALL_DAY_MAX + 1}
						top={3}
						onMore={(day, el) => setPop({ day, rect: el.getBoundingClientRect() })}
					/>
				</div>
			</div>

			<div className={styles.timeGrid} style={{ paddingTop: TIME_PAD, gridTemplateColumns: `${GUTTER}px repeat(7, minmax(0, 1fr))` }}>
				<div className={styles.hourGutter}>
					{hours.map((h) => (
						<div key={h} className={styles.hourLabel} style={{ height: hourH }}>
							{`${String(h).padStart(2, '0')}:00`}
						</div>
					))}
				</div>
				{days.map((day) => (
					<div
						key={day.key}
						className={`${styles.dayCol}${onAdd ? ` ${styles.clickable}` : ''}`}
						style={{ height: hours.length * hourH, backgroundSize: `100% ${hourH}px` }}
						onClick={onAdd}
					>
						{layoutDay(timed.filter((it) => isSameDay(it.start, day.date))).map(({ item, s, e, col, cols }) => (
							<button
								key={item.id}
								type='button'
								className={styles.timedEvent}
								style={{
									top: ((s - startH * 60) / 60) * hourH,
									height: Math.max(18, ((e - s) / 60) * hourH - 2),
									left: `calc(${(col / cols) * 100}% + 1px)`,
									width: `calc(${100 / cols}% - 4px)`,
									background: item.color,
								}}
								title={tooltip(item)}
								onClick={(ev) => {
									ev.stopPropagation();
									item.onClick();
								}}
							>
								<span className={styles.timedTitle}>{item.title}</span>
								<span className={styles.timedMeta}>{timeRange(item)}</span>
								{item.subtitle && <span className={styles.timedMeta}>{item.subtitle}</span>}
							</button>
						))}
						{day.isToday && nowMin >= startH * 60 && nowMin <= hours.length * 60 + startH * 60 && (
							<div className={styles.nowLine} style={{ top: ((nowMin - startH * 60) / 60) * hourH }} />
						)}
					</div>
				))}
			</div>

			{pop && <DayPopover state={pop} items={allDay} onClose={() => setPop(null)} onAdd={onAdd} />}
		</div>
	);
}
