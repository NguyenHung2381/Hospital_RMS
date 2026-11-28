import type { PDFPageProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { MAX_RENDER_WIDTH, clampBox, type SignBox } from '../utils/signBox';
import styles from './PdfSignCanvas.module.css';

/** 1 khung chữ ký vẽ trên trang */
export interface CanvasBox {
	key: string;
	box: SignBox;
	/** Nhãn nhỏ phía trên khung (tên người ký) */
	label?: string;
	/** active = đang chỉnh, other = của người khác, done = đã ký */
	tone?: 'active' | 'other' | 'done';
	editable?: boolean;
	content?: React.ReactNode;
}

function PageView({
	page,
	index,
	scale,
	boxes,
	activeKey,
	onBoxChange,
}: {
	page: PDFPageProxy;
	index: number;
	scale: number;
	boxes: CanvasBox[];
	activeKey: string | null;
	onBoxChange: (key: string, b: SignBox) => void;
}) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [visible, setVisible] = useState(false);
	const vp1 = page.getViewport({ scale: 1 });
	const size = { width: vp1.width, height: vp1.height };
	const pageNo = index + 1;
	const onPage = boxes.filter((b) => b.box.page === pageNo);
	const active = boxes.find((b) => b.key === activeKey && b.editable);
	const drag = useRef<{ key: string; mode: 'move' | 'resize'; x: number; y: number; start: SignBox } | null>(null);

	// Chỉ vẽ trang khi cuộn tới gần (file nhiều trang không phải vẽ hết một lúc)
	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisible(true), {
			rootMargin: '600px 0px',
		});
		io.observe(el);
		return () => io.disconnect();
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!visible || !canvas) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const vp = page.getViewport({ scale: scale * dpr });
		canvas.width = Math.floor(vp.width);
		canvas.height = Math.floor(vp.height);
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const task = page.render({ canvas, canvasContext: ctx, viewport: vp });
		task.promise.catch(() => {});
		return () => task.cancel();
	}, [visible, page, scale]);

	const onPointerDown = (e: React.PointerEvent, b: CanvasBox, mode: 'move' | 'resize') => {
		if (!b.editable) return;
		e.preventDefault();
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		drag.current = { key: b.key, mode, x: e.clientX, y: e.clientY, start: b.box };
	};
	const onPointerMove = (e: React.PointerEvent) => {
		const d = drag.current;
		if (!d) return;
		const dx = (e.clientX - d.x) / scale;
		const dy = (e.clientY - d.y) / scale;
		if (d.mode === 'move') {
			onBoxChange(d.key, clampBox({ ...d.start, left: d.start.left + dx, top: d.start.top + dy }, size));
		} else {
			const width = d.start.width + dx;
			onBoxChange(d.key, clampBox({ ...d.start, width, height: d.start.height * (width / d.start.width) }, size));
		}
	};
	const onPointerUp = () => {
		drag.current = null;
	};

	// Bấm vào chỗ trống trên trang ⇒ đưa khung đang chọn tới đó (tâm khung tại điểm bấm)
	const placeAt = (e: React.MouseEvent) => {
		if (!active) return;
		const r = e.currentTarget.getBoundingClientRect();
		const x = (e.clientX - r.left) / scale;
		const y = (e.clientY - r.top) / scale;
		const b = active.box;
		onBoxChange(active.key, clampBox({ ...b, page: pageNo, left: x - b.width / 2, top: y - b.height / 2 }, size));
	};

	const onKeyDown = (e: React.KeyboardEvent, b: CanvasBox) => {
		if (!b.editable) return;
		const step = e.shiftKey ? 10 : 2;
		const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
		if (!d) return;
		e.preventDefault();
		onBoxChange(b.key, clampBox({ ...b.box, left: b.box.left + d[0], top: b.box.top + d[1] }, size));
	};

	return (
		<div
			ref={wrapRef}
			className={`${styles.page} ${active ? styles.placeable : ''}`}
			style={{ width: size.width * scale, height: size.height * scale }}
			onClick={placeAt}
			data-page={pageNo}
		>
			<canvas
				ref={canvasRef}
				className={styles.canvas}
				aria-label={`Trang ${pageNo}`}
			/>
			{!visible && <span className={styles.loading}>Trang {pageNo}</span>}
			{onPage.map((b) => {
				const tone = b.tone ?? (b.key === activeKey ? 'active' : 'other');
				return (
					<div
						key={b.key}
						className={`${styles.box} ${styles[tone]} ${b.editable ? styles.editable : ''}`}
						style={{
							left: b.box.left * scale,
							top: b.box.top * scale,
							width: b.box.width * scale,
							height: b.box.height * scale,
						}}
						onPointerDown={(e) => onPointerDown(e, b, 'move')}
						onPointerMove={onPointerMove}
						onPointerUp={onPointerUp}
						onPointerCancel={onPointerUp}
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => onKeyDown(e, b)}
						tabIndex={b.editable ? 0 : -1}
						role='group'
						aria-label={
							b.editable
								? `Khung chữ ký${b.label ? ` ${b.label}` : ''} — kéo để đổi vị trí, phím mũi tên để nhích`
								: `Khung chữ ký${b.label ? ` ${b.label}` : ''}`
						}
					>
						{b.label && <span className={styles.tag}>{b.label}</span>}
						<div className={styles.boxInner}>{b.content}</div>
						{b.editable && (
							<span
								className={styles.handle}
								onPointerDown={(e) => onPointerDown(e, b, 'resize')}
								onPointerMove={onPointerMove}
								onPointerUp={onPointerUp}
								onPointerCancel={onPointerUp}
								aria-hidden
								title='Kéo để đổi cỡ khung'
							/>
						)}
					</div>
				);
			})}
			<span className={styles.pageNo}>{pageNo}</span>
		</div>
	);
}

/**
 * Các trang PDF xếp dọc, các khung chữ ký đặt lên trang. Khung đang chọn (`activeKey`, editable)
 * kéo / đổi cỡ được, bấm vào trang để đưa khung tới đó. Bề rộng vẽ theo khung chứa (≤ 860px).
 */
export function PdfSignCanvas({
	pages,
	boxes,
	activeKey = null,
	onBoxChange,
}: {
	pages: PDFPageProxy[];
	boxes: CanvasBox[];
	activeKey?: string | null;
	onBoxChange: (key: string, b: SignBox) => void;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);

	useEffect(() => {
		const el = rootRef.current;
		if (!el) return;
		const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	return (
		<div
			ref={rootRef}
			className={styles.root}
		>
			{width > 0 &&
				pages.map((p, i) => {
					const w = p.getViewport({ scale: 1 }).width;
					const scale = Math.min(width, MAX_RENDER_WIDTH) / w;
					return (
						<PageView
							key={i}
							page={p}
							index={i}
							scale={scale}
							boxes={boxes}
							activeKey={activeKey}
							onBoxChange={onBoxChange}
						/>
					);
				})}
		</div>
	);
}
