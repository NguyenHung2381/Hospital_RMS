import { notify } from '../../../shared/utils/feedback';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UpdateRoundPayload } from '../../round/api/roundApi';
import { updateRound, upsertDeadline } from '../../round/api/roundApi';
import type { RoundDeadline } from '../../round/types/round.type';
import {
	BASE_W,
	type BarDragSession,
	type BarKind,
	type DeadlineBarDragSession,
	type DragMode,
	type PinDragSession,
	type RoundRow,
	type ZoomLevel,
} from '../types/schedule.type';

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

const beginDrag = (e: React.MouseEvent) => {
	e.preventDefault();
	e.stopPropagation();
	document.body.style.cursor = 'grabbing';
	document.body.style.userSelect = 'none';
};

const pctToApiDate = (pct: number, ys: number, ym: number): string => {
	const d = new Date(ys + (clampPct(pct) / 100) * ym);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const pctToLabel = (pct: number, ys: number, ym: number): string => {
	const d = new Date(ys + (clampPct(pct) / 100) * ym);
	return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

interface UseDragProps {
	setRows: React.Dispatch<React.SetStateAction<RoundRow[]>>;
	yearStart: number;
	yearMs: number;
	zoom: ZoomLevel;
}

export function useDrag({ setRows, yearStart, yearMs, zoom }: UseDragProps) {
	const barDragRef         = useRef<BarDragSession | null>(null);
	const pinDragRef         = useRef<PinDragSession | null>(null);
	const deadlineBarDragRef = useRef<DeadlineBarDragSession | null>(null);
	const dragEndedRef       = useRef(false);

	const [barOvr, setBarOvr] = useState<{
		roundId: string; barKind: BarKind; l: number; w: number;
	} | null>(null);
	const [pinOvr, setPinOvr] = useState<{
		deadlineId: string; pct: number;
	} | null>(null);
	const [deadlineBarOvr, setDeadlineBarOvr] = useState<{
		deadlineId: string; l: number; w: number;
	} | null>(null);
	const [dragTip, setDragTip] = useState<{
		x: number; y: number; text: string;
	} | null>(null);

	const markDragEnded = () => {
		dragEndedRef.current = true;
		setTimeout(() => { dragEndedRef.current = false; }, 100);
	};

	// Refs so the stable drag-handler effect always sees current values
	const yearStartRef = useRef(yearStart);
	const yearMsRef    = useRef(yearMs);
	const zoomRef      = useRef<ZoomLevel>(zoom);

	useEffect(() => { yearStartRef.current = yearStart; }, [yearStart]);
	useEffect(() => { yearMsRef.current = yearMs; },      [yearMs]);
	useEffect(() => { zoomRef.current = zoom; },          [zoom]);

	useEffect(() => {
		const computeBarPos = (
			mode: DragMode, initL: number, initW: number, deltaPct: number,
		): { l: number; w: number } => {
			let l = initL, w = initW;
			if (mode === 'move') {
				l = clampPct(initL + deltaPct);
				if (l + initW > 100) l = 100 - initW;
				w = initW;
			} else if (mode === 'left') {
				const right = initL + initW;
				l = Math.min(clampPct(initL + deltaPct), right - 0.3);
				w = right - l;
			} else {
				w = Math.max(0.3, clampPct(initL + initW + deltaPct) - initL);
				l = initL;
			}
			return { l, w };
		};

		const onMove = (e: MouseEvent) => {
			const ys = yearStartRef.current;
			const ym = yearMsRef.current;
			const tw = BASE_W * zoomRef.current;

			if (barDragRef.current) {
				const drag = barDragRef.current;
				const deltaPct = ((e.clientX - drag.startX) / tw) * 100;
				const { l, w } = computeBarPos(drag.mode, drag.initL, drag.initW, deltaPct);
				setBarOvr({ roundId: drag.round.id, barKind: drag.barKind, l, w });
				const tipY = e.clientY < 60 ? e.clientY + 14 : e.clientY - 36;
				const text = drag.mode === 'move'
					? `${pctToLabel(l, ys, ym)} → ${pctToLabel(l + w, ys, ym)}`
					: drag.mode === 'left' ? pctToLabel(l, ys, ym) : pctToLabel(l + w, ys, ym);
				setDragTip({ x: e.clientX, y: tipY, text });
			}

			if (pinDragRef.current) {
				const drag = pinDragRef.current;
				const deltaPct = ((e.clientX - drag.startX) / tw) * 100;
				const pct = clampPct(drag.initPct + deltaPct);
				setPinOvr({ deadlineId: drag.deadline.id, pct });
				const tipY = e.clientY < 60 ? e.clientY + 14 : e.clientY - 36;
				setDragTip({ x: e.clientX, y: tipY, text: pctToLabel(pct, ys, ym) });
			}

			if (deadlineBarDragRef.current) {
				const drag = deadlineBarDragRef.current;
				const deltaPct = ((e.clientX - drag.startX) / tw) * 100;
				const { l, w } = computeBarPos(drag.mode, drag.initL, drag.initW, deltaPct);
				setDeadlineBarOvr({ deadlineId: drag.deadline.id, l, w });
				const tipY = e.clientY < 60 ? e.clientY + 14 : e.clientY - 36;
				const text = drag.mode === 'move'
					? `${pctToLabel(l, ys, ym)} → ${pctToLabel(l + w, ys, ym)}`
					: drag.mode === 'left' ? pctToLabel(l, ys, ym) : pctToLabel(l + w, ys, ym);
				setDragTip({ x: e.clientX, y: tipY, text });
			}
		};

		const onUp = async (e: MouseEvent) => {
			document.body.style.cursor = '';
			document.body.style.userSelect = '';

			if (barDragRef.current) {
				const drag = barDragRef.current;
				const deltaX = e.clientX - drag.startX;
				barDragRef.current = null;
				setBarOvr(null);
				setDragTip(null);
				if (Math.abs(deltaX) < 4) return;
				markDragEnded();

				const tw = BASE_W * zoomRef.current;
				const { l, w } = computeBarPos(drag.mode, drag.initL, drag.initW, (deltaX / tw) * 100);
				const ys = yearStartRef.current;
				const ym = yearMsRef.current;
				const payload: UpdateRoundPayload = {};
				if (drag.barKind === 'research') {
					if (drag.mode !== 'right') payload.start_date = pctToApiDate(l, ys, ym);
					if (drag.mode !== 'left')  payload.end_date   = pctToApiDate(l + w, ys, ym);
				} else return;
				try {
					const saved = await updateRound(drag.round.id, payload);
					setRows((prev) => prev.map((r) =>
						r.id === drag.round.id ? { ...saved, deadlines: r.deadlines } : r,
					));
					notify.success('Đã cập nhật lịch');
				} catch (err) {
					// Không cập nhật rows → thanh tự về vị trí cũ
					notify.error(err instanceof Error ? err.message : 'Cập nhật lịch thất bại');
				}
			}

			if (pinDragRef.current) {
				const drag = pinDragRef.current;
				const deltaX = e.clientX - drag.startX;
				pinDragRef.current = null;
				setPinOvr(null);
				setDragTip(null);
				if (Math.abs(deltaX) < 4) return;
				markDragEnded();

				const tw = BASE_W * zoomRef.current;
				const deltaPct = (deltaX / tw) * 100;
				const pct = clampPct(drag.initPct + deltaPct);
				const ys = yearStartRef.current;
				const ym = yearMsRef.current;
				const newStartDate = drag.initStartPct !== null
					? pctToApiDate(clampPct(drag.initStartPct + deltaPct), ys, ym)
					: (drag.deadline.start_date ?? null);
				try {
					const saved = await upsertDeadline(drag.round.id, drag.deadline.phase, {
						name:          drag.deadline.name,
						deadline_date: pctToApiDate(pct, ys, ym),
						start_date:    newStartDate,
						deadline_type: drag.deadline.deadline_type,
					});
					setRows((prev) => prev.map((r) =>
						r.id === drag.round.id
							? { ...r, deadlines: r.deadlines.map((d) => d.id === drag.deadline.id ? saved : d) }
							: r,
					));
					notify.success('Đã cập nhật lịch');
				} catch (err) {
					// Không cập nhật rows → thanh tự về vị trí cũ
					notify.error(err instanceof Error ? err.message : 'Cập nhật lịch thất bại');
				}
			}

			if (deadlineBarDragRef.current) {
				const drag = deadlineBarDragRef.current;
				const deltaX = e.clientX - drag.startX;
				deadlineBarDragRef.current = null;
				setDeadlineBarOvr(null);
				setDragTip(null);
				if (Math.abs(deltaX) < 4) return;
				markDragEnded();

				const tw = BASE_W * zoomRef.current;
				const { l, w } = computeBarPos(drag.mode, drag.initL, drag.initW, (deltaX / tw) * 100);
				const ys = yearStartRef.current;
				const ym = yearMsRef.current;
				try {
					const saved = await upsertDeadline(drag.round.id, drag.deadline.phase, {
						name:          drag.deadline.name,
						deadline_date: pctToApiDate(l + w, ys, ym),
						start_date:    pctToApiDate(l, ys, ym),
						deadline_type: drag.deadline.deadline_type,
					});
					setRows((prev) => prev.map((r) =>
						r.id === drag.round.id
							? { ...r, deadlines: r.deadlines.map((d) => d.id === drag.deadline.id ? saved : d) }
							: r,
					));
					notify.success('Đã cập nhật lịch');
				} catch (err) {
					// Không cập nhật rows → thanh tự về vị trí cũ
					notify.error(err instanceof Error ? err.message : 'Cập nhật lịch thất bại');
				}
			}
		};

		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
		return () => {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		};
	}, [setRows]);

	const startBarDrag = useCallback((
		e: React.MouseEvent,
		mode: DragMode,
		round: RoundRow,
		barKind: BarKind,
		initL: number,
		initW: number,
	) => {
		beginDrag(e);
		barDragRef.current = { mode, round, barKind, startX: e.clientX, initL, initW };
	}, []);

	const startPinDrag = useCallback((
		e: React.MouseEvent,
		round: RoundRow,
		deadline: RoundDeadline,
		initPct: number,
		initStartPct: number | null,
	) => {
		beginDrag(e);
		pinDragRef.current = { round, deadline, startX: e.clientX, initPct, initStartPct };
	}, []);

	const startDeadlineBarDrag = useCallback((
		e: React.MouseEvent,
		mode: DragMode,
		round: RoundRow,
		deadline: RoundDeadline,
		initL: number,
		initW: number,
	) => {
		beginDrag(e);
		deadlineBarDragRef.current = { mode, round, deadline, startX: e.clientX, initL, initW };
	}, []);

	return {
		dragEndedRef,
		barOvr,
		pinOvr,
		deadlineBarOvr,
		dragTip,
		startBarDrag,
		startPinDrag,
		startDeadlineBarDrag,
	};
}
