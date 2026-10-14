import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './SearchableSelect.module.css';

interface SearchableSelectProps {
	id?: string;
	options: { id: string; name: string }[];
	value: string;
	onChange: (id: string) => void;
	placeholder: string;
	className?: string;
	hasError?: boolean;
	size?: 'md' | 'sm';
}

const MENU_GAP = 4;
const MENU_MAX_H = 320;

// Menu render qua portal (position: fixed) để không bị cắt bởi container có overflow (bảng cuộn, modal…)
export function SearchableSelect({
	id,
	options,
	value,
	onChange,
	placeholder,
	className,
	hasError,
	size = 'md',
}: SearchableSelectProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
	const ref = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	const place = useCallback(() => {
		const r = triggerRef.current?.getBoundingClientRect();
		if (!r) return;
		const below = window.innerHeight - r.bottom;
		const up = below < MENU_MAX_H && r.top > below;
		setPos({
			left: r.left,
			width: Math.max(r.width, 220),
			...(up ? { bottom: window.innerHeight - r.top + MENU_GAP } : { top: r.bottom + MENU_GAP }),
		});
	}, []);

	useLayoutEffect(() => {
		if (open) place();
	}, [open, place]);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			const t = e.target as Node;
			if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
			setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
		document.addEventListener('mousedown', handler);
		document.addEventListener('keydown', onKey);
		window.addEventListener('scroll', place, true);
		window.addEventListener('resize', place);
		setTimeout(() => searchRef.current?.focus(), 0);
		return () => {
			document.removeEventListener('mousedown', handler);
			document.removeEventListener('keydown', onKey);
			window.removeEventListener('scroll', place, true);
			window.removeEventListener('resize', place);
			setQuery('');
		};
	}, [open, place]);

	const selected = options.find((o) => o.id === value);
	const filtered = query.trim()
		? options.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()))
		: options;

	return (
		<div ref={ref} className={`${styles.wrap} ${className ?? ''}`}>
			<button
				id={id}
				ref={triggerRef}
				type='button'
				className={`${styles.trigger} ${size === 'sm' ? styles.sm : ''} ${open ? styles.triggerOpen : ''} ${hasError ? styles.hasError : ''}`}
				onClick={() => setOpen((o) => !o)}
			>
				<span className={`${styles.label} ${selected && selected.id ? '' : styles.placeholder}`}>
					{selected ? selected.name : placeholder}
				</span>
				<svg className={styles.chevron} width='14' height='14' viewBox='0 0 24 24' fill='none' aria-hidden>
					<path d='M6 9l6 6 6-6' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
				</svg>
			</button>
			{open &&
				pos &&
				createPortal(
					<div
						ref={menuRef}
						className={`${styles.menu} ${size === 'sm' ? styles.menuSm : ''}`}
						style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
					>
						<div className={styles.searchWrap}>
							<input
								ref={searchRef}
								type='text'
								className={styles.searchInput}
								placeholder='Tìm kiếm...'
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
						</div>
						<div className={styles.options}>
							{filtered.length === 0 ? (
								<div className={styles.empty}>Không tìm thấy kết quả</div>
							) : (
								filtered.map((o) => (
									<div
										key={o.id}
										className={`${styles.option} ${o.id === value ? styles.optionSelected : ''} ${o.id ? '' : styles.optionEmpty}`}
										onClick={() => {
											onChange(o.id);
											setOpen(false);
										}}
									>
										{o.name}
									</div>
								))
							)}
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
}
