import { useEffect, useRef, useState } from 'react';
import styles from './YearPicker.module.css';

const PAGE_SIZE = 12;

const Chevron = ({ dir }: { dir: 'left' | 'right' | 'down' }) => {
	const d = dir === 'left' ? 'M10 3.5 5.5 8l4.5 4.5' : dir === 'right' ? 'M6 3.5 10.5 8 6 12.5' : 'M4 6l4 4 4-4';
	return (
		<svg className={styles.chevron} viewBox='0 0 16 16' width='14' height='14' aria-hidden='true'>
			<path d={d} fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' />
		</svg>
	);
};

const CalendarIcon = () => (
	<svg className={styles.calIcon} viewBox='0 0 16 16' width='14' height='14' aria-hidden='true'>
		<rect x='2' y='3' width='12' height='11' rx='2' fill='none' stroke='currentColor' strokeWidth='1.5' />
		<path d='M2 6.5h12M5.5 1.5v3M10.5 1.5v3' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
	</svg>
);

interface YearPickerProps {
	value: number;
	onChange: (year: number) => void;
	min: number;
	max: number;
	currentYear: number;
}

/** Ô chọn năm: mũi tên lùi/tiến + nút năm; bấm vào năm mở lưới 12 năm có thể lật trang. */
export function YearPicker({ value, onChange, min, max, currentYear }: YearPickerProps) {
	const [open, setOpen] = useState(false);
	const [pageStart, setPageStart] = useState(() => value - (value % PAGE_SIZE));
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	const pick = (y: number) => {
		onChange(y);
		setOpen(false);
	};

	const years = Array.from({ length: PAGE_SIZE }, (_, i) => pageStart + i);
	const pageEnd = pageStart + PAGE_SIZE - 1;

	return (
		<div className={styles.root} ref={rootRef}>
			<button
				className={styles.nav}
				onClick={() => onChange(value - 1)}
				disabled={value <= min}
				title='Năm trước'
				aria-label='Năm trước'
			>
				<Chevron dir='left' />
			</button>
			<button
				className={`${styles.trigger}${open ? ` ${styles.triggerOpen}` : ''}`}
				onClick={() => {
					// Mở lại luôn hiện trang chứa năm đang chọn
					if (!open) setPageStart(value - (value % PAGE_SIZE));
					setOpen(!open);
				}}
				aria-haspopup='dialog'
				aria-expanded={open}
				title='Chọn năm'
			>
				<CalendarIcon />
				<span className={styles.triggerLabel}>Năm</span>
				<span className={styles.triggerYear}>{value}</span>
				<span className={styles.caret}><Chevron dir='down' /></span>
			</button>
			<button
				className={styles.nav}
				onClick={() => onChange(value + 1)}
				disabled={value >= max}
				title='Năm sau'
				aria-label='Năm sau'
			>
				<Chevron dir='right' />
			</button>

			{open && (
				<div className={styles.popover} role='dialog' aria-label='Chọn năm'>
					<div className={styles.popHeader}>
						<button
							className={styles.pageBtn}
							onClick={() => setPageStart((s) => s - PAGE_SIZE)}
							disabled={pageStart <= min}
							aria-label='Trang trước'
						>
							<Chevron dir='left' />
						</button>
						<span className={styles.popTitle}>{pageStart} – {pageEnd}</span>
						<button
							className={styles.pageBtn}
							onClick={() => setPageStart((s) => s + PAGE_SIZE)}
							disabled={pageEnd >= max}
							aria-label='Trang sau'
						>
							<Chevron dir='right' />
						</button>
					</div>
					<div className={styles.grid}>
						{years.map((y) => {
							const cls = [
								styles.cell,
								y === value && styles.cellActive,
								y === currentYear && styles.cellCurrent,
							].filter(Boolean).join(' ');
							return (
								<button key={y} className={cls} onClick={() => pick(y)} disabled={y < min || y > max}>
									{y}
								</button>
							);
						})}
					</div>
					{value !== currentYear && (
						<button className={styles.todayBtn} onClick={() => pick(currentYear)}>
							Về năm nay ({currentYear})
						</button>
					)}
				</div>
			)}
		</div>
	);
}
