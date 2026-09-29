import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { CalendarView } from '../components/CalendarView';
import { ColorPickerPopup } from '../components/ColorPickerPopup';
import { ContextMenu } from '../components/ContextMenu';
import { DeadlineModal } from '../components/DeadlineModal';
import { GanttRow } from '../components/GanttRow';
import { ScheduleListView } from '../components/ScheduleListView';
import { YearPicker } from '../components/YearPicker';
import { InlineLoading } from '@/shared/components';
import { useDrag } from '../hooks/useDrag';
import { useGanttTimeline } from '../hooks/useGanttTimeline';
import { useScheduleData } from '../hooks/useScheduleData';
import { CAL_MODES, useCalendarNav } from '../hooks/useCalendarNav';
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
	{ color: '#0a9b4a', label: 'Nghiên cứu', pin: false },
	{ color: '#ef9f27', label: 'Bổ sung',  pin: false },
	{ color: '#e05252', label: 'Hạn nộp',  pin: true  },
];

export default function Schedule() {
	const {
		currentYear, minYear, maxYear,
		year, calMode, calStart, calWeekStart,
		handleCalMode, handleYearChange, handleSelectMonth,
		calPrev, calNext, calGoToday,
		calCanPrev, calCanNext, calShowsToday, todayTitle,
	} = useCalendarNav('year');

	const [viewMode, setViewMode]       = useState<'gantt' | 'list' | 'calendar'>('calendar');
	const [zoom, setZoom]               = useState<ZoomLevel>(1);
	const [filterRoundId, setFilterRoundId] = useState('');
	const [modal, setModal]             = useState<ModalState | null>(null);
	const [ctxMenu, setCtxMenu]         = useState<CtxMenuState | null>(null);
	const [colorPicker, setColorPicker] = useState<ColorPickerState | null>(null);
	const [customColors, setCustomColors] = useState<Record<string, string>>(() => {
		try { return JSON.parse(localStorage.getItem('schedule_custom_colors') ?? '{}'); }
		catch { return {}; }
	});
	const [containerWidth, setContainerWidth] = useState<number>(900);

	const ganttRef = useRef<HTMLDivElement>(null);

	// ── Data ──────────────────────────────────────────────────────────────────
	const { rows, loading, error, setRows } = useScheduleData(year);

	// ── Timeline ──────────────────────────────────────────────────────────────
	const {
		currentYear: tlYear, currentMonth,
		yearStart, yearMs, monthData, subHeader, fineLines, todayPct, toPct,
	} = useGanttTimeline(year, zoom);

	// ── Responsive width measurement ──────────────────────────────────────────
	useEffect(() => {
		const el = ganttRef.current;
		if (!el) return;
		const updateWidth = () => {
			const labelColW = window.innerWidth <= 640 ? 180 : 236;
			const availableW = Math.max(500, el.clientWidth - labelColW);
			setContainerWidth(availableW);
		};
		updateWidth();
		const observer = new ResizeObserver(updateWidth);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

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

	const scrollToToday = useCallback(() => {
		if (!ganttRef.current || todayPct === null) return;
		const labelColW = window.innerWidth <= 640 ? 180 : 236;
		const timelineW = Math.max(containerWidth * zoom, 700 * zoom);
		const todayPixel = (todayPct / 100) * timelineW;
		const targetScrollLeft = todayPixel - (ganttRef.current.clientWidth - labelColW) / 2;
		ganttRef.current.scrollTo({ left: Math.max(0, targetScrollLeft), behavior: 'smooth' });
	}, [todayPct, containerWidth, zoom]);

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
	}, [zoomIn, zoomOut, viewMode]);

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
		setCustomColors((prev) => {
			const next = { ...prev, [key]: color };
			localStorage.setItem('schedule_custom_colors', JSON.stringify(next));
			return next;
		});
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
				const barLabels: Record<string, string> = { edit: 'Sửa', research: 'Nghiên cứu', supplement: 'Bổ sung' };
				openColorPicker(x, y, `Màu: ${barLabels[target.barKind]}`, gc(key, defaultColor), (c) => applyColor(key, c));
			}
		};
	}, [ctxMenu, ctxTarget, gc, openColorPicker, applyColor]);

	const ctxOnEdit = useMemo(() => {
		if (!ctxTarget) return null;
		if (ctxTarget.kind === 'deadline') return () => setModal({ round: ctxTarget.round, deadline: ctxTarget.deadline });
		if (ctxTarget.kind === 'bar' && ctxTarget.deadline) return () => setModal({ round: ctxTarget.round, deadline: ctxTarget.deadline! });
		return null;
	}, [ctxTarget]);

	const ctxOnAddActivity = useCallback(() => {
		if (ctxTarget) setModal({ round: ctxTarget.round, deadline: null });
	}, [ctxTarget]);

	// ── Derived ────────────────────────────────────────────────────────────────
	const displayedRows = filterRoundId ? rows.filter((r) => r.id === filterRoundId) : rows;
	const timelineW     = Math.max(containerWidth * zoom, 700 * zoom);

	// ── Render ─────────────────────────────────────────────────────────────────
	return (
		<AdminLayout
			pageTitle='Lịch trình nghiên cứu'
			pageSubtitle='Biểu đồ Gantt hiển thị các mốc thời gian của đợt nghiên cứu'
		>
			<div className={styles.page}>
				{/* Toolbar */}
				<div className={styles.toolbar}>
					<div className={styles.viewSwitcher}>
						<button
							className={`${styles.viewBtn}${viewMode === 'gantt' ? ` ${styles.viewBtnActive}` : ''}`}
							onClick={() => setViewMode('gantt')}
						>
							📊 Biểu đồ Gantt
						</button>
						<button
							className={`${styles.viewBtn}${viewMode === 'list' ? ` ${styles.viewBtnActive}` : ''}`}
							onClick={() => setViewMode('list')}
						>
							📋 Danh sách mốc
						</button>
						<button
							className={`${styles.viewBtn}${viewMode === 'calendar' ? ` ${styles.viewBtnActive}` : ''}`}
							onClick={() => setViewMode('calendar')}
						>
							🗓 Lịch
						</button>
					</div>
					<YearPicker
						value={year}
						onChange={handleYearChange}
						min={minYear}
						max={maxYear}
						currentYear={currentYear}
					/>
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
					{viewMode === 'calendar' && (
						<div className={styles.actionGroup}>
							<div className={styles.calViewGroup} role='tablist' aria-label='Chế độ xem lịch'>
								{CAL_MODES.map(({ key, label }) => (
									<button
										key={key}
										role='tab'
										aria-selected={calMode === key}
										className={`${styles.calViewBtn}${calMode === key ? ` ${styles.calViewBtnActive}` : ''}`}
										onClick={() => handleCalMode(key)}
									>
										{label}
									</button>
								))}
							</div>
							{!calShowsToday && (
								<button
									className={styles.todayBtn}
									onClick={calGoToday}
									title={todayTitle}
								>
									<span className={styles.todayDot} />
									Hôm nay
								</button>
							)}
						</div>
					)}
					{viewMode === 'gantt' && (
						<>
							<div className={styles.actionGroup}>
								{todayPct !== null && (
									<button
										className={styles.todayBtn}
										onClick={scrollToToday}
										title='Cuộn tới mốc thời gian hiện tại'
									>
										<span className={styles.todayDot} />
										Hôm nay
									</button>
								)}
								<div className={styles.zoomGroup}>
									<button className={styles.zoomBtn} onClick={zoomOut} disabled={zoom === 1} title='Thu nhỏ'>−</button>
									<span className={styles.zoomLabel}>{zoom}×</span>
									<button className={styles.zoomBtn} onClick={zoomIn} disabled={zoom === 8} title='Phóng to'>+</button>
								</div>
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
						</>
					)}
				</div>

				{/* Main Content View (Gantt or List) */}
				{loading ? (
					<InlineLoading label='Đang tải dữ liệu…' />
				) : error ? (
					<div className={styles.emptyState}>
						<span className={styles.errorTxt}>{error}</span>
					</div>
				) : displayedRows.length === 0 ? (
					<div className={styles.emptyState}>
						<CalendarSvg className={styles.emptyIcon} />
						<p className={styles.emptyTxt}>Không có đợt nghiên cứu nào trong năm {year}</p>
					</div>
				) : viewMode === 'calendar' ? (
					<CalendarView
						rows={displayedRows}
						year={year}
						gc={gc}
						onAddDeadline={(round) => setModal({ round, deadline: null })}
						onEditDeadline={(round, deadline) => setModal({ round, deadline })}
						mode={calMode}
						startMonth={calMode === 'year' ? 0 : calStart}
						weekStart={calWeekStart}
						onPrev={calPrev}
						onNext={calNext}
						canPrev={calCanPrev}
						canNext={calCanNext}
						onSelectMonth={handleSelectMonth}
					/>
				) : viewMode === 'list' ? (
					<ScheduleListView
						rows={displayedRows}
						gc={gc}
						onAddDeadline={(round) => setModal({ round, deadline: null })}
						onEditDeadline={(round, deadline) => setModal({ round, deadline })}
					/>
				) : (
					<>
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
								{displayedRows.map((round) => (
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
								))}
							</div>

							<button
								className={`${styles.scrollArrow} ${styles.scrollArrowRight}`}
								onClick={() => scrollGantt(300)}
								aria-label='Cuộn sang trái'
							>›</button>
						</div>

						<p className={styles.hint}>
							Kéo thanh để điều chỉnh thời gian · Kéo cạnh để co giãn · Nhấp đúp để xem tùy chọn · Ctrl+lăn để thu phóng · Đường đỏ là hôm nay
						</p>
					</>
				)}
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
