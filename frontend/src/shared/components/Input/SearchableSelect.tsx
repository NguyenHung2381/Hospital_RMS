import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { removeDiacritics } from '@/shared/utils/helper';
import styles from './SearchableSelect.module.css';

export interface SearchableOption {
	id: string;
	name: string;
	/** Tên nhóm — các lựa chọn liền nhau cùng nhóm hiện dưới 1 tiêu đề (như <optgroup>). */
	group?: string;
}

interface SearchableSelectProps {
	id?: string;
	options: SearchableOption[];
	value: string;
	onChange: (id: string) => void;
	placeholder: string;
	className?: string;
	hasError?: boolean;
	size?: 'md' | 'sm';
	disabled?: boolean;
	title?: string;
	searchPlaceholder?: string;
	/** Bề rộng tối thiểu của menu (px) — lựa chọn dài thì mở rộng hơn ô để khỏi xuống dòng. */
	menuMinWidth?: number;
}

/** Tìm không phân biệt hoa thường / dấu: "nguyen" khớp "Nguyễn". */
const fold = (s: string) => removeDiacritics(s).toLowerCase();

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
	disabled,
	title,
	searchPlaceholder = 'Tìm kiếm...',
	menuMinWidth = 220,
}: SearchableSelectProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	// Lựa chọn đang được tô bằng phím ↑/↓ (Enter để chọn)
	const [active, setActive] = useState(0);
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
		// Menu rộng hơn ô thì dịch sang trái cho khỏi tràn mép phải màn hình.
		const width = Math.min(Math.max(r.width, menuMinWidth), window.innerWidth - 16);
		setPos({
			left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
			width,
			...(up ? { bottom: window.innerHeight - r.top + MENU_GAP } : { top: r.bottom + MENU_GAP }),
		});
	}, [menuMinWidth]);

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
	const filtered = useMemo(() => {
		const q = fold(query.trim());
		// Khớp cả tên nhóm: gõ tên khoa ra cả khoa đó
		return q ? options.filter((o) => fold(o.name).includes(q) || (!!o.group && fold(o.group).includes(q))) : options;
	}, [options, query]);

	// Mở menu ⇒ tô sẵn lựa chọn hiện tại; gõ từ khoá ⇒ tô dòng đầu kết quả.
	const openMenu = (q = '') => {
		setQuery(q);
		setActive(q ? 0 : Math.max(options.findIndex((o) => o.id === value), 0));
		setOpen(true);
	};

	// Dòng đang tô luôn nằm trong vùng nhìn thấy khi di bằng phím.
	useEffect(() => {
		menuRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
	}, [active, pos]);

	const pick = (o: SearchableOption) => {
		onChange(o.id);
		setOpen(false);
		triggerRef.current?.focus();
	};

	const onSearchKey = (e: React.KeyboardEvent) => {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const step = e.key === 'ArrowDown' ? 1 : -1;
			setActive((i) => (filtered.length ? (i + step + filtered.length) % filtered.length : 0));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (filtered[active]) pick(filtered[active]);
		} else if (e.key === 'Tab') setOpen(false);
	};

	return (
		<div ref={ref} className={`${styles.wrap} ${className ?? ''}`}>
			<button
				id={id}
				ref={triggerRef}
				type='button'
				title={title}
				disabled={disabled}
				className={`${styles.trigger} ${size === 'sm' ? styles.sm : ''} ${open ? styles.triggerOpen : ''} ${hasError ? styles.hasError : ''}`}
				onClick={() => (open ? setOpen(false) : openMenu())}
				// Gõ chữ / ↓ khi ô đang focus ⇒ mở menu tìm luôn, khỏi bấm chuột
				onKeyDown={(e) => {
					if (open || disabled) return;
					if (e.key === 'ArrowDown') {
						e.preventDefault();
						openMenu();
					} else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
						e.preventDefault();
						openMenu(e.key);
					}
				}}
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
								placeholder={searchPlaceholder}
								value={query}
								onChange={(e) => {
									setQuery(e.target.value);
									setActive(0);
								}}
								onKeyDown={onSearchKey}
							/>
						</div>
						<div className={styles.options} role='listbox'>
							{filtered.length === 0 ? (
								<div className={styles.empty}>Không tìm thấy kết quả</div>
							) : (
								filtered.map((o, i) => (
									<div key={o.id || `_empty${i}`}>
										{o.group && o.group !== filtered[i - 1]?.group && (
											<div className={styles.groupLabel}>{o.group}</div>
										)}
										<div
											data-idx={i}
											role='option'
											aria-selected={o.id === value}
											className={`${styles.option} ${o.id === value ? styles.optionSelected : ''} ${o.id ? '' : styles.optionEmpty} ${i === active ? styles.optionActive : ''}`}
											onMouseEnter={() => setActive(i)}
											onClick={() => pick(o)}
										>
											{o.name}
										</div>
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
