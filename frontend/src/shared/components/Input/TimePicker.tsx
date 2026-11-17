import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './TimePicker.module.css';

const POPOVER_WIDTH = 232;
const POPOVER_HEIGHT = 300; // ước lượng trước khi đo được chiều cao thật
const GAP = 6;
const EDGE = 8; // khoảng cách tối thiểu tới mép màn hình

interface TimePickerProps {
	value?: string; // 'HH:mm' (chấp nhận cả 'HH:mm:ss')
	onChange: (val: string) => void;
	placeholder?: string;
	disabled?: boolean;
	/** Bước phút trong cột Phút (mặc định 5). Gõ tay vẫn nhập được phút lẻ. */
	minuteStep?: number;
	hasError?: boolean;
	id?: string;
	className?: string;
	'aria-label'?: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** Đọc giờ gõ tay: "7" / "730" / "0730" / "7:30" / "7h30" / "7.30" → 'HH:mm'; sai thì null. */
function parseTyped(raw: string): string | null {
	const s = raw.trim().toLowerCase().replace(/\s+/g, '');
	if (!s) return '';
	let h: number;
	let mi: number;
	const sep = s.match(/^(\d{1,2})[:h.](\d{0,2})$/);
	if (sep) {
		h = Number(sep[1]);
		mi = sep[2] ? Number(sep[2]) : 0;
	} else if (/^\d{1,4}$/.test(s)) {
		// 1–2 chữ số = giờ; 3–4 chữ số = giờ + 2 chữ số phút cuối
		h = Number(s.length <= 2 ? s : s.slice(0, -2));
		mi = s.length <= 2 ? 0 : Number(s.slice(-2));
	} else return null;
	if (h > 23 || mi > 59) return null;
	return `${pad2(h)}:${pad2(mi)}`;
}

/**
 * Định dạng chữ đang gõ theo khuôn HH:mm: chỉ giữ số và ':', đổi 'h' '.' ' ' thành ':',
 * gõ đủ giờ thì tự chèn ':'. "0730" → "07:30", "730" → "7:30", "95" → "9:5".
 */
function maskTime(raw: string, autoColon: boolean): string {
	const s = raw.toLowerCase().replace(/[h.\s]/g, ':').replace(/[^\d:]/g, '');
	const ci = s.indexOf(':');
	let hour: string;
	let min: string;
	let hasColon: boolean;
	if (ci >= 0) {
		hour = s.slice(0, ci).slice(0, 2);
		min = s.slice(ci + 1).replace(/:/g, '');
		hasColon = hour.length > 0;
		if (!hasColon) min = '';
	} else if (s.length >= 2 && Number(s.slice(0, 2)) <= 23) {
		hour = s.slice(0, 2);
		min = s.slice(2);
		hasColon = min.length > 0 || autoColon;
	} else {
		hour = s.slice(0, 1);
		min = s.slice(1);
		hasColon = min.length > 0;
	}
	return hasColon ? `${hour}:${min.slice(0, 2)}` : hour;
}

/** Ô chọn giờ 24h thay cho <input type="time"> (bảng chọn mặc định của trình duyệt không chỉnh được giao diện). */
export function TimePicker({
	value = '',
	onChange,
	placeholder = '--:--',
	disabled = false,
	minuteStep = 5,
	hasError = false,
	id,
	className,
	'aria-label': ariaLabel,
}: TimePickerProps) {
	const current = value.slice(0, 5);
	const [hh, mm] = current ? current.split(':').map(Number) : [null, null];
	const [isOpen, setIsOpen] = useState(false);
	// Chữ đang gõ — null = đang hiện đúng giá trị
	const [draft, setDraft] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const hourColRef = useRef<HTMLDivElement>(null);
	const minuteColRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

	// Phút theo bước; phút lẻ đang chọn (gõ tay / dữ liệu cũ) vẫn hiện trong cột
	const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
	if (mm !== null && !minutes.includes(mm)) {
		minutes.push(mm);
		minutes.sort((a, b) => a - b);
	}

	// Vị trí popover theo viewport: mở xuống dưới, hết chỗ thì lật lên; tràn mép phải thì căn phải.
	useLayoutEffect(() => {
		if (!isOpen || !containerRef.current) return;
		const updatePosition = () => {
			if (!containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();
			const popoverHeight = popoverRef.current?.offsetHeight || POPOVER_HEIGHT;
			const spaceBelow = window.innerHeight - rect.bottom;
			const openUp = spaceBelow < popoverHeight + GAP && rect.top > spaceBelow;
			let left = rect.left;
			if (rect.left + POPOVER_WIDTH > window.innerWidth - EDGE) left = rect.right - POPOVER_WIDTH;
			left = Math.max(EDGE, Math.min(left, window.innerWidth - POPOVER_WIDTH - EDGE));
			setPos(openUp ? { left, bottom: window.innerHeight - rect.top + GAP } : { left, top: rect.bottom + GAP });
		};
		// Cuộn trong cột giờ / phút không làm đổi vị trí popover
		const onScroll = (e: Event) => {
			if (!popoverRef.current?.contains(e.target as Node)) updatePosition();
		};
		updatePosition();
		window.addEventListener('resize', updatePosition);
		window.addEventListener('scroll', onScroll, true);
		return () => {
			window.removeEventListener('resize', updatePosition);
			window.removeEventListener('scroll', onScroll, true);
		};
	}, [isOpen]);

	// Mở ra thì cuộn giờ / phút đang chọn (chưa chọn: 07 giờ) vào giữa cột — 1 lần mỗi lần mở
	useLayoutEffect(() => {
		if (!isOpen) return;
		for (const col of [hourColRef.current, minuteColRef.current]) {
			const sel = col?.querySelector<HTMLElement>('[data-anchor="true"]');
			if (col && sel) col.scrollTop = sel.offsetTop - col.clientHeight / 2 + sel.offsetHeight / 2;
		}
	}, [isOpen]);

	// Bấm ra ngoài / Esc thì đóng
	useEffect(() => {
		if (!isOpen) return;
		const onMouseDown = (e: MouseEvent) => {
			const t = e.target as Node;
			if (containerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
			setIsOpen(false);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setDraft(null);
				setIsOpen(false);
			}
		};
		document.addEventListener('mousedown', onMouseDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onMouseDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [isOpen]);

	const commitDraft = () => {
		if (draft === null) return;
		const parsed = parseTyped(draft);
		if (parsed !== null && parsed !== current) onChange(parsed);
		setDraft(null);
	};

	const pickHour = (h: number) => onChange(`${pad2(h)}:${pad2(mm ?? 0)}`);
	const pickMinute = (m: number) => {
		onChange(`${pad2(hh ?? new Date().getHours())}:${pad2(m)}`);
		setIsOpen(false);
	};
	const pickNow = () => {
		const d = new Date();
		onChange(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
		setIsOpen(false);
	};

	return (
		<div
			ref={containerRef}
			className={`${styles.container} ${className || ''}`}
		>
			<div className={styles.inputWrapper}>
				<input
					id={id}
					type='text'
					inputMode='numeric'
					autoComplete='off'
					aria-label={ariaLabel}
					disabled={disabled}
					maxLength={5}
					value={draft ?? current}
					placeholder={placeholder}
					onFocus={() => !disabled && setIsOpen(true)}
					onClick={() => !disabled && setIsOpen(true)}
					onChange={(e) => {
						const el = e.target;
						const prev = draft ?? current;
						// Chỉ tự định dạng khi gõ ở cuối; sửa giữa chừng thì để nguyên vị trí con trỏ
						const atEnd = el.selectionStart === el.value.length;
						setDraft(atEnd ? maskTime(el.value, el.value.length > prev.length) : el.value);
						if (!isOpen) setIsOpen(true);
					}}
					onBlur={() => {
						commitDraft();
						// Tab sang ô khác thì đóng bảng chọn
						setIsOpen(false);
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							commitDraft();
							setIsOpen(false);
						}
					}}
					className={`${styles.input} ${isOpen ? styles.isOpen : ''} ${hasError ? styles.hasError : ''}`}
				/>

				{/* Đồng hồ */}
				<span className={styles.calendarIcon}>
					<svg
						width='16'
						height='16'
						viewBox='0 0 24 24'
						fill='none'
						stroke='currentColor'
						strokeWidth='2'
						strokeLinecap='round'
						strokeLinejoin='round'
					>
						<circle
							cx='12'
							cy='12'
							r='9'
						/>
						<polyline points='12 7 12 12 15.5 14' />
					</svg>
				</span>

				{current && !disabled && (
					<button
						type='button'
						className={styles.clearBtn}
						title='Xóa giờ'
						onClick={(e) => {
							e.stopPropagation();
							setDraft(null);
							onChange('');
						}}
					>
						<svg
							width='14'
							height='14'
							viewBox='0 0 24 24'
							fill='none'
							stroke='currentColor'
							strokeWidth='2'
							strokeLinecap='round'
							strokeLinejoin='round'
						>
							<line
								x1='18'
								y1='6'
								x2='6'
								y2='18'
							/>
							<line
								x1='6'
								y1='6'
								x2='18'
								y2='18'
							/>
						</svg>
					</button>
				)}
			</div>

			{isOpen &&
				createPortal(
					<div
						ref={popoverRef}
						className={`${styles.popover} ${styles.timePopover} ${pos?.bottom !== undefined ? styles.placementTop : ''}`}
						style={{ left: pos?.left ?? -9999, top: pos?.top, bottom: pos?.bottom }}
						// Giữ focus ở ô nhập khi bấm trong bảng chọn
						onMouseDown={(e) => e.preventDefault()}
					>
						<div className={styles.colHeads}>
							<span>Giờ</span>
							<span>Phút</span>
						</div>
						<div className={styles.cols}>
							<div
								ref={hourColRef}
								className={styles.col}
							>
								{HOURS.map((h) => (
									<button
										key={h}
										type='button'
										data-anchor={hh === null ? h === 7 : h === hh}
										className={`${styles.cell} ${h === hh ? styles.cellSelected : ''}`}
										onClick={() => pickHour(h)}
									>
										{pad2(h)}
									</button>
								))}
							</div>
							<div
								ref={minuteColRef}
								className={styles.col}
							>
								{minutes.map((m) => (
									<button
										key={m}
										type='button'
										data-anchor={m === (mm ?? 0)}
										className={`${styles.cell} ${m === mm ? styles.cellSelected : ''}`}
										onClick={() => pickMinute(m)}
									>
										{pad2(m)}
									</button>
								))}
							</div>
						</div>
						<div className={styles.footer}>
							<button
								type='button'
								className={styles.todayBtn}
								onClick={pickNow}
							>
								Bây giờ
							</button>
							{current && (
								<button
									type='button'
									className={styles.clearTextBtn}
									onClick={() => {
										onChange('');
										setIsOpen(false);
									}}
								>
									Xóa chọn
								</button>
							)}
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
}
