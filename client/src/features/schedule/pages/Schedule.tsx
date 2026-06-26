import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { ColorPickerPopup } from '../components/ColorPickerPopup';
import { ContextMenu } from '../components/ContextMenu';
import { DeadlineModal } from '../components/DeadlineModal';
import { GanttRow } from '../components/GanttRow';
import { useDrag } from '../hooks/useDrag';
import { useGanttTimeline } from '../hooks/useGanttTimeline';
import { useScheduleData } from '../hooks/useScheduleData';
import {
	BAR_DEFAULT_COLORS,
	DEADLINE_COLORS,
	STATUS_CFG,
	ZOOM_LEVELS,
	type ColorPickerState,
	type CtxMenuState,
	type CtxTarget,
	type ModalState,
	type ZoomLevel,
} from '../types/schedule.type';
import styles from './Schedule.module.css';

const LEGEND = [
	{ color: '#378add', label: 'Đăng ký',  pin: false },
	{ color: '#2eb87a', label: 'Nghiên cứu', pin: false },
	{ color: '#ef9f27', label: 'Bổ sung',  pin: false },
	{ color: '#e05252', label: 'Hạn nộp',  pin: true  },
];

export default function Schedule() {
	const now         = useMemo(() => new Date(), []);
	const currentYear = now.getFullYear();

	const [year, setYear]               = useState(currentYear);
	const [zoom, setZoom]               = useState<ZoomLevel>(1);
	const [filterRoundId, setFilterRoundId] = useState('');
	const [modal, setModal]             = useState<ModalState | null>(null);
	const [ctxMenu, setCtxMenu]         = useState<CtxMenuState | null>(null);
	const [colorPicker, setColorPicker] = useState<ColorPickerState | null>(null);
	const [customColors, setCustomColors] = useState<Record<string, string>>({});

	const ganttRef = useRef<HTMLDivElement>(null);

	// ── Data ──────────────────────────────────────────────────────────────────
	const { rows, loading, error, setRows } = useScheduleData(year);

	// ── Timeline ──────────────────────────────────────────────────────────────
	const {
		currentYear: tlYear, currentMonth,
		yearStart, yearMs, monthData, subHeader, fineLines, todayPct, toPct,
	} = useGanttTimeline(year, zoom);

	// ── Drag ──────────────────────────────────────────────────────────────────
	const {
		dragEndedRef, barOvr, pinOvr, deadlineBarOvr, dragTip,
		startBarDrag, startPinDrag, startDeadlineBarDrag,
	} = useDrag({ setRows, yearStart, yearMs, zoom });

	// ── Zoom / scroll ─────────────────────────────────────────────────────────
	const zoomIn  = useCallback(() =>
		setZoom((z) => ZOOM_LEVELS[Math.min(ZOOM_LEVELS.indexOf(z) + 1, ZOOM_LEVELS.length - 1)]), []);
	const zoomOut = useCallback(() =>
		setZoom((z) => ZOOM_LEVELS[Math.max(ZOOM_LEVELS.indexOf(z) - 1, 0)]), []);

	const scrollGantt = useCallback((amount: number) => {
		ganttRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
	}, []);

	useEffect(() => {
		const el = ganttRef.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			if (e.ctrlKey) { if (e.deltaY < 0) zoomIn(); else zoomOut(); }
			else el.scrollLeft += e.deltaX !== 0 ? e.deltaX : e.deltaY;
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	}, [zoomIn, zoomOut]);

	// ── Close overlays on outside click ───────────────────────────────────────
	useEffect(() => {
		if (!ctxMenu) return;
		const close = () => setCtxMenu(null);
		document.addEventListener('click', close);
		return () => document.removeEventListener('click', close);
	}, [ctxMenu]);

	useEffect(() => {
		if (!colorPicker) return;
		const close = () => setColorPicker(null);
		document.addEventListener('click', close);
		return () => document.removeEventListener('click', close);
	}, [colorPicker]);

	// ── Custom colors ─────────────────────────────────────────────────────────
	const gc = useCallback(
		(key: string, fallback: string) => customColors[key] ?? fallback,
		[customColors],
	);
	const applyColor = useCallback((key: string, color: string) => {
		setCustomColors((prev) => ({ ...prev, [key]: color }));
	}, []);

	// ── Context menu ──────────────────────────────────────────────────────────
	const openCtx = useCallback((e: React.MouseEvent, target: CtxTarget) => {
		e.preventDefault();
		e.stopPropagation();
		const menuW = 192, menuH = 148, gap = 4;
		const x = e.clientX + gap + menuW > window.innerWidth  ? e.clientX - menuW : e.clientX + gap;
		const y = e.clientY + gap + menuH > window.innerHeight ? e.clientY - menuH : e.clientY + gap;
		setCtxMenu({ x, y, target });
		setColorPicker(null);
	}, []);

	const openColorPicker = useCallback((
		anchorX: number, anchorY: number,
		label: string, current: string,
		onApply: (c: string) => void,
	) => {
		const pickerW = 224, pickerH = 176;
		const x = anchorX + pickerW > window.innerWidth  ? anchorX - pickerW : anchorX;
		const y = anchorY + pickerH > window.innerHeight ? anchorY - pickerH : anchorY;
		setColorPicker({ x, y, label, current, onApply });
	}, []);

	// ── Context menu action handlers ──────────────────────────────────────────
	const ctxTarget = ctxMenu?.target ?? null;

	const ctxOnEditColor = useMemo(() => {
		if (!ctxMenu || !ctxTarget || ctxTarget.kind === 'row') return null;
		return () => {
			const { target, x, y } = ctxMenu;
			if (target.kind === 'deadline') {
				const key     = `deadline-${target.deadline.id}`;
				const current = gc(key, DEADLINE_COLORS[target.deadline.deadline_type ?? ''] ?? '#888888');
				openColorPicker(x, y, `Màu: ${target.deadline.name}`, current, (c) => applyColor(key, c));
			} else if (target.kind === 'bar') {
				const key         = `bar-${target.round.id}-${target.barKind}`;
				const statusColor = (STATUS_CFG[target.round.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.closed).color;
				const defaultColor = target.barKind === 'research'
					? statusColor
					: (BAR_DEFAULT_COLORS[target.barKind as keyof typeof BAR_DEFAULT_COLORS] ?? '#888888');
				const barLabels: Record<string, string> = { registration: 'Đăng ký', research: 'Nghiên cứu', supplement: 'Bổ sung' };
				openColorPicker(x, y, `Màu: ${barLabels[target.barKind]}`, gc(key, defaultColor), (c) => applyColor(key, c));
			}
		};
	}, [ctxMenu, ctxTarget, gc, openColorPicker, applyColor]);

	const ctxOnEdit = useMemo(() => {
		if (!ctxTarget || ctxTarget.kind !== 'deadline') return null;
		return () => setModal({ round: ctxTarget.round, deadline: ctxTarget.deadline });
	}, [ctxTarget]);

	const ctxOnAddActivity = useCallback(() => {
		if (ctxTarget) setModal({ round: ctxTarget.round, deadline: null });
	}, [ctxTarget]);

	// ── Derived ────────────────────────────────────────────────────────────────
	const displayedRows = filterRoundId ? rows.filter((r) => r.id === filterRoundId) : rows;
	const timelineW     = 900 * zoom;
	const years         = [currentYear - 1, currentYear, currentYear + 1];

	// ── Render ─────────────────────────────────────────────────────────────────
	return (
		<AdminLayout
			pageTitle='Lịch trình nghiên cứu'
			pageSubtitle='Biểu đồ Gantt hiển thị các mốc thời gian của đợt nghiên cứu'
		>
			<div className={styles.page}>
				{/* Toolbar */}
				<div className={styles.toolbar}>
					<div className={styles.yearTabs}>
						{years.map((y) => (
							<button
								key={y}
								className={`${styles.yearTab}${y === year ? ` ${styles.yearTabActive}` : ''}`}
								onClick={() => setYear(y)}
							>
								{y}
							</button>
						))}
					</div>
					<select
						className={styles.roundFilter}
						value={filterRoundId}
						onChange={(e) => setFilterRoundId(e.target.value)}
						disabled={loading}
					>
						<option value=''>Tất cả đợt</option>
						{rows.map((r) => (
							<option key={r.id} value={r.id}>{r.id} — {r.name}</option>
						))}
					</select>
					<div className={styles.zoomGroup}>
						<button className={styles.zoomBtn} onClick={zoomOut} disabled={zoom === 1} title='Thu nhỏ'>−</button>
						<span className={styles.zoomLabel}>{zoom}×</span>
						<button className={styles.zoomBtn} onClick={zoomIn} disabled={zoom === 8} title='Phóng to'>+</button>
					</div>
					<div className={styles.legend}>
						{LEGEND.map((item) => (
							<div key={item.label} className={styles.legendItem}>
								{item.pin ? (
									<span className={styles.legendPin} style={{ color: item.color }} />
								) : (
									<span className={styles.legendSwatch} style={{ background: item.color }} />
								)}
								<span className={styles.legendLabel}>{item.label}</span>
							</div>
						))}
					</div>
				</div>

				{/* Gantt */}
				<div className={styles.ganttWrapper}>
					<button
						className={`${styles.scrollArrow} ${styles.scrollArrowLeft}`}
						onClick={() => scrollGantt(-300)}
						aria-label='Cuộn sang trái'
					>‹</button>

					<div className={styles.gantt} ref={ganttRef}>
						{/* Header */}
						<div className={styles.ganttHeader}>
							<div className={`${styles.labelCol} ${styles.labelColHead}`}>
								<span className={styles.labelColTitle}>Đợt nghiên cứu</span>
							</div>
							<div className={styles.headerWrap} style={{ width: `${timelineW}px` }}>
								<div className={styles.monthRow}>
									{monthData.map(({ label, startPct, widthPct, idx }) => (
										<div
											key={idx}
											className={`${styles.monthBand}${idx === currentMonth && year === tlYear ? ` ${styles.monthBandCurrent}` : ''}`}
											style={{ left: `${startPct}%`, width: `${widthPct}%` }}
										>
											{label}
										</div>
									))}
								</div>
								{zoom >= 2 && (
									<div className={styles.subRow}>
										{subHeader.map(({ pct, label }, i) => (
											<div key={i} className={styles.subTick} style={{ left: `${pct}%` }}>{label}</div>
										))}
									</div>
								)}
							</div>
						</div>

						{/* Body */}
						{loading ? (
							<div className={styles.emptyState}>
								<div className={styles.spinner} />
								<span>Đang tải dữ liệu...</span>
							</div>
						) : error ? (
							<div className={styles.emptyState}>
								<span className={styles.errorTxt}>{error}</span>
							</div>
						) : displayedRows.length === 0 ? (
							<div className={styles.emptyState}>
								<CalendarSvg className={styles.emptyIcon} />
								<p className={styles.emptyTxt}>Không có đợt nghiên cứu nào trong năm {year}</p>
							</div>
						) : (
							displayedRows.map((round) => (
								<GanttRow
									key={round.id}
									round={round}
									zoom={zoom}
									timelineW={timelineW}
									monthData={monthData}
									fineLines={fineLines}
									todayPct={todayPct}
									toPct={toPct}
									barOvr={barOvr}
									pinOvr={pinOvr}
									deadlineBarOvr={deadlineBarOvr}
									dragEndedRef={dragEndedRef}
									gc={gc}
									startBarDrag={startBarDrag}
									startPinDrag={startPinDrag}
									startDeadlineBarDrag={startDeadlineBarDrag}
									openCtx={openCtx}
									onAddDeadline={() => setModal({ round, deadline: null })}
								/>
							))
						)}
					</div>

					<button
						className={`${styles.scrollArrow} ${styles.scrollArrowRight}`}
						onClick={() => scrollGantt(300)}
						aria-label='Cuộn sang phải'
					>›</button>
				</div>

				<p className={styles.hint}>
					Kéo thanh để điều chỉnh thời gian · Kéo cạnh để co giãn · Nhấp để xem tùy chọn · Ctrl+lăn để thu phóng · Đường đỏ là hôm nay
				</p>
			</div>

			{/* Overlays */}
			{dragTip && (
				<div className={styles.dragTooltip} style={{ left: dragTip.x, top: dragTip.y }}>
					{dragTip.text}
				</div>
			)}
			{ctxMenu && (
				<ContextMenu
					state={ctxMenu}
					onAddActivity={ctxOnAddActivity}
					onEditColor={ctxOnEditColor}
					onEdit={ctxOnEdit}
					onClose={() => setCtxMenu(null)}
				/>
			)}
			{colorPicker && (
				<ColorPickerPopup state={colorPicker} onClose={() => setColorPicker(null)} />
			)}
			{modal && (
				<DeadlineModal
					state={modal}
					onClose={() => setModal(null)}
					onSaved={(updated) => {
						setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
						setModal(null);
					}}
				/>
			)}
		</AdminLayout>
	);
}
