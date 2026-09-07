import React, { useEffect, useRef, useState } from 'react';
import styles from './DatePicker.module.css';

interface DatePickerProps {
	value?: string; // 'YYYY-MM-DD'
	onChange: (val: string) => void;
	placeholder?: string;
	disabled?: boolean;
	min?: string;
	max?: string;
	/** Faint context band (inclusive), e.g. the parent round's period. 'YYYY-MM-DD' */
	rangeStart?: string;
	rangeEnd?: string;
	/** Stronger band for the currently chosen sub-range, e.g. this milestone's start → deadline. 'YYYY-MM-DD' */
	activeStart?: string;
	activeEnd?: string;
	hasError?: boolean;
	id?: string;
	className?: string;
	style?: React.CSSProperties;
	align?: 'left' | 'right' | 'auto';
}

const MONTH_NAMES = [
	'Tháng 1',
	'Tháng 2',
	'Tháng 3',
	'Tháng 4',
	'Tháng 5',
	'Tháng 6',
	'Tháng 7',
	'Tháng 8',
	'Tháng 9',
	'Tháng 10',
	'Tháng 11',
	'Tháng 12',
];

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

// Helper to format ISO string 'YYYY-MM-DD' to Vietnamese 'DD/MM/YYYY'
function formatVN(isoStr: string): string {
	if (!isoStr) return '';
	const parts = isoStr.split('-');
	if (parts.length !== 3) return isoStr;
	const [y, m, d] = parts;
	return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

// Helper to pad number with leading zero
function pad2(num: number): string {
	return String(num).padStart(2, '0');
}

export function DatePicker({
	value = '',
	onChange,
	placeholder = 'Chọn ngày (DD/MM/YYYY)',
	disabled = false,
	min,
	max,
	rangeStart,
	rangeEnd,
	activeStart,
	activeEnd,
	hasError = false,
	id,
	className,
	style,
	align = 'auto',
}: DatePickerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	// Parse initial value or default to today
	const today = new Date();
	const todayISO = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

	// When there is no value yet, open on the month of the allowed range / band
	// rather than today, so the highlighted period is visible immediately.
	const fallbackAnchor = value || activeStart || min || rangeStart || '';
	const parsedDate = fallbackAnchor ? new Date(fallbackAnchor) : null;
	const initialYear =
		parsedDate && !isNaN(parsedDate.getTime())
			? parsedDate.getFullYear()
			: today.getFullYear();
	const initialMonth =
		parsedDate && !isNaN(parsedDate.getTime())
			? parsedDate.getMonth()
			: today.getMonth();

	const [viewYear, setViewYear] = useState<number>(initialYear);
	const [viewMonth, setViewMonth] = useState<number>(initialMonth);
	const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
	const [alignRight, setAlignRight] = useState<boolean>(false);

	// Sync view month/year when the selected value changes.
	// Điều chỉnh state ngay khi render (thay vì trong effect) để tránh cascading render.
	const [prevValue, setPrevValue] = useState(value);
	if (value !== prevValue) {
		setPrevValue(value);
		if (value) {
			const d = new Date(value);
			if (!isNaN(d.getTime())) {
				setViewYear(d.getFullYear());
				setViewMonth(d.getMonth());
			}
		}
	}

	// Calculate optimal placement based on available viewport and parent container space
	useEffect(() => {
		if (!isOpen || !containerRef.current) return;

		const updatePosition = () => {
			if (!containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();
			const popoverHeight = 340;
			const popoverWidth = 310;
			const spaceBelow = window.innerHeight - rect.bottom;
			const spaceAbove = rect.top;

			if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
				setPlacement('top');
			} else {
				setPlacement('bottom');
			}

			if (align === 'right') {
				setAlignRight(true);
				return;
			}
			if (align === 'left') {
				setAlignRight(false);
				return;
			}

			// Find right boundary of closest container/modal with overflow or viewport
			let rightBoundary = window.innerWidth;
			let parent = containerRef.current.parentElement;
			while (parent && parent !== document.body) {
				const style = window.getComputedStyle(parent);
				const hasOverflow =
					style.overflow !== 'visible' ||
					style.overflowX !== 'visible' ||
					style.overflowY !== 'visible';

				if (
					hasOverflow ||
					parent.classList.contains('modal') ||
					parent.getAttribute('role') === 'dialog' ||
					parent.className?.toString().includes('modal')
				) {
					const parentRect = parent.getBoundingClientRect();
					if (parentRect.width > 0) {
						rightBoundary = Math.min(rightBoundary, parentRect.right);
					}
				}
				parent = parent.parentElement;
			}

			// If opening to the right from rect.left exceeds rightBoundary, switch to alignRight
			if (rect.left + popoverWidth > rightBoundary - 8) {
				setAlignRight(true);
			} else {
				setAlignRight(false);
			}
		};

		updatePosition();
		window.addEventListener('resize', updatePosition);
		window.addEventListener('scroll', updatePosition, true);

		return () => {
			window.removeEventListener('resize', updatePosition);
			window.removeEventListener('scroll', updatePosition, true);
		};
	}, [isOpen, align]);

	// Close on click outside
	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setIsOpen(false);
			}
		}
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === 'Escape') setIsOpen(false);
		}
		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleKeyDown);
		}
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen]);

	// Month Navigation
	const prevMonth = () => {
		if (viewMonth === 0) {
			setViewMonth(11);
			setViewYear((y) => y - 1);
		} else {
			setViewMonth((m) => m - 1);
		}
	};

	const nextMonth = () => {
		if (viewMonth === 11) {
			setViewMonth(0);
			setViewYear((y) => y + 1);
		} else {
			setViewMonth((m) => m + 1);
		}
	};

	// Generate Calendar Grid Days (Monday start)
	const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
	const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
	const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

	// Monday-based day of week (0 = Monday, ..., 6 = Sunday)
	const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;

	const gridCells: {
		day: number;
		month: number; // 0-11
		year: number;
		isCurrentMonth: boolean;
		iso: string;
	}[] = [];

	// Previous month padding days
	for (let i = startDayOfWeek - 1; i >= 0; i--) {
		const dayNum = daysInPrevMonth - i;
		const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
		const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
		gridCells.push({
			day: dayNum,
			month: prevM,
			year: prevY,
			isCurrentMonth: false,
			iso: `${prevY}-${pad2(prevM + 1)}-${pad2(dayNum)}`,
		});
	}

	// Current month days
	for (let d = 1; d <= daysInCurrentMonth; d++) {
		gridCells.push({
			day: d,
			month: viewMonth,
			year: viewYear,
			isCurrentMonth: true,
			iso: `${viewYear}-${pad2(viewMonth + 1)}-${pad2(d)}`,
		});
	}

	// Next month padding days to fill 35 or 42 grid cells
	const remainingCells = (7 - (gridCells.length % 7)) % 7;
	for (let d = 1; d <= remainingCells; d++) {
		const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
		const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
		gridCells.push({
			day: d,
			month: nextM,
			year: nextY,
			isCurrentMonth: false,
			iso: `${nextY}-${pad2(nextM + 1)}-${pad2(d)}`,
		});
	}

	// Select day
	const handleSelectDay = (cellIso: string) => {
		onChange(cellIso);
		setIsOpen(false);
	};

	// Year Options (from todayYear - 30 to todayYear + 15)
	const currentYearNum = today.getFullYear();
	const yearOptions: number[] = [];
	for (let y = currentYearNum - 35; y <= currentYearNum + 15; y++) {
		yearOptions.push(y);
	}

	const isDateDisabled = (iso: string) => {
		if (min && iso < min) return true;
		if (max && iso > max) return true;
		return false;
	};

	// Normalise a [start, end] pair so start <= end regardless of prop order.
	// Only treated as a band when BOTH ends are present.
	const normaliseBand = (a?: string, b?: string): [string, string] | null => {
		if (!a || !b) return null;
		return a <= b ? [a, b] : [b, a];
	};
	const ctxBand = normaliseBand(rangeStart, rangeEnd);
	const activeBand = normaliseBand(activeStart, activeEnd);
	const inCtxBand = (iso: string) =>
		!!ctxBand && iso >= ctxBand[0] && iso <= ctxBand[1];
	const inActiveBand = (iso: string) =>
		!!activeBand && iso >= activeBand[0] && iso <= activeBand[1];

	return (
		<div
			ref={containerRef}
			className={`${styles.container} ${className || ''}`}
			style={style}
		>
			<div className={styles.inputWrapper}>
				<input
					id={id}
					type='text'
					readOnly
					disabled={disabled}
					value={formatVN(value)}
					placeholder={placeholder}
					onClick={() => !disabled && setIsOpen(!isOpen)}
					className={`${styles.input} ${isOpen ? styles.isOpen : ''} ${
						hasError ? styles.hasError : ''
					}`}
				/>

				{/* Calendar Icon */}
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
						<rect
							x='3'
							y='4'
							width='18'
							height='18'
							rx='2'
							ry='2'
						/>
						<line
							x1='16'
							y1='2'
							x2='16'
							y2='6'
						/>
						<line
							x1='8'
							y1='2'
							x2='8'
							y2='6'
						/>
						<line
							x1='3'
							y1='10'
							x2='21'
							y2='10'
						/>
					</svg>
				</span>

				{/* Clear Button */}
				{value && !disabled && (
					<button
						type='button'
						className={styles.clearBtn}
						title='Xoá ngày'
						onClick={(e) => {
							e.stopPropagation();
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

			{/* Popover Calendar */}
			{isOpen && (
				<div
					className={`${styles.popover} ${
						placement === 'top' ? styles.placementTop : ''
					} ${alignRight ? styles.alignRight : ''}`}
				>
					{/* Header */}
					<div className={styles.header}>
						<div className={styles.headerSelectors}>
							{/* Month Select */}
							<select
								className={styles.select}
								value={viewMonth}
								onChange={(e) => setViewMonth(Number(e.target.value))}
							>
								{MONTH_NAMES.map((m, idx) => (
									<option
										key={m}
										value={idx}
									>
										{m}
									</option>
								))}
							</select>

							{/* Year Select */}
							<select
								className={styles.select}
								value={viewYear}
								onChange={(e) => setViewYear(Number(e.target.value))}
							>
								{yearOptions.map((y) => (
									<option
										key={y}
										value={y}
									>
										{y}
									</option>
								))}
							</select>
						</div>

						{/* Prev / Next buttons */}
						<div className={styles.navGroup}>
							<button
								type='button'
								className={styles.navBtn}
								onClick={prevMonth}
								title='Tháng trước'
							>
								<svg
									width='14'
									height='14'
									viewBox='0 0 24 24'
									fill='none'
									stroke='currentColor'
									strokeWidth='2.2'
									strokeLinecap='round'
									strokeLinejoin='round'
								>
									<polyline points='15 18 9 12 15 6' />
								</svg>
							</button>
							<button
								type='button'
								className={styles.navBtn}
								onClick={nextMonth}
								title='Tháng sau'
							>
								<svg
									width='14'
									height='14'
									viewBox='0 0 24 24'
									fill='none'
									stroke='currentColor'
									strokeWidth='2.2'
									strokeLinecap='round'
									strokeLinejoin='round'
								>
									<polyline points='9 18 15 12 9 6' />
								</svg>
							</button>
						</div>
					</div>

					{/* Weekdays */}
					<div className={styles.weekdays}>
						{WEEKDAYS.map((wd, i) => (
							<div
								key={wd}
								className={`${styles.weekday} ${
									i === 6 ? styles.weekdayIsWeekend : ''
								}`}
							>
								{wd}
							</div>
						))}
					</div>

					{/* Days Grid */}
					<div className={styles.daysGrid}>
						{gridCells.map((cell) => {
							const isSelected = value === cell.iso;
							const isToday = todayISO === cell.iso;
							const disabledCell = isDateDisabled(cell.iso);

							const inCtx = inCtxBand(cell.iso);
							const ctxStartCell = !!ctxBand && cell.iso === ctxBand[0];
							const ctxEndCell = !!ctxBand && cell.iso === ctxBand[1];

							const inActive = inActiveBand(cell.iso);
							const isActiveStartDay =
								!!activeStart && cell.iso === activeStart;
							const isActiveEndDay = !!activeEnd && cell.iso === activeEnd;
							// Rounded caps only when the full band is drawn (both ends set).
							const activeStartCell = !!activeBand && isActiveStartDay;
							const activeEndCell = !!activeBand && isActiveEndDay;
							// Lone marker so a single chosen end still shows — e.g. the
							// start day seen from the deadline field's picker.
							const activeMarkCell =
								!activeBand && (isActiveStartDay || isActiveEndDay);

							return (
								<button
									key={cell.iso}
									type='button'
									disabled={disabledCell}
									onClick={() => handleSelectDay(cell.iso)}
									className={`${styles.dayCell} ${
										!cell.isCurrentMonth ? styles.otherMonth : ''
									} ${isToday ? styles.isToday : ''} ${
										inCtx ? styles.inRange : ''
									} ${ctxStartCell ? styles.rangeStart : ''} ${
										ctxEndCell ? styles.rangeEnd : ''
									} ${inActive ? styles.inActiveRange : ''} ${
										activeStartCell ? styles.activeRangeStart : ''
									} ${activeEndCell ? styles.activeRangeEnd : ''} ${
										activeMarkCell ? styles.activeEndpoint : ''
									} ${isSelected ? styles.isSelected : ''} ${
										disabledCell ? styles.isDisabled : ''
									}`}
								>
									{cell.day}
								</button>
							);
						})}
					</div>

					{/* Footer Quick Actions */}
					<div className={styles.footer}>
						<button
							type='button'
							className={styles.todayBtn}
							onClick={() => handleSelectDay(todayISO)}
						>
							Hôm nay
						</button>
						{value && (
							<button
								type='button'
								className={styles.clearTextBtn}
								onClick={() => {
									onChange('');
									setIsOpen(false);
								}}
							>
								Xoá chọn
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
