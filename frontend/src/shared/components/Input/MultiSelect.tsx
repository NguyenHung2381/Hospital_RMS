import { CheckSmSvg } from '@/assets/icons';
import { useEffect, useId, useRef, useState } from 'react';
import styles from './MultiSelect.module.css';
import { markFieldControl, type FieldControlProps } from './fieldControl';

interface MultiSelectProps extends FieldControlProps {
	options: { id: string; label: string }[];
	selected: Set<string>;
	onChange: (next: Set<string>) => void;
	placeholder: string;
	searchable?: boolean;
	className?: string;
}

export function MultiSelect({
	options,
	selected,
	onChange,
	placeholder,
	searchable,
	className,
	id,
	'aria-label': ariaLabel,
	'aria-describedby': ariaDescribedBy,
	'aria-invalid': ariaInvalid,
	'aria-required': ariaRequired,
}: MultiSelectProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [alignRight, setAlignRight] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuId = useId();

	useEffect(() => {
		if (!open) return;
		if (ref.current) {
			const rect = ref.current.getBoundingClientRect();
			setAlignRight(rect.left + 220 > window.innerWidth);
		}
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node))
				setOpen(false);
		};
		// Esc đóng menu và trả focus về nút mở
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.stopPropagation();
			setOpen(false);
			triggerRef.current?.focus();
		};
		document.addEventListener('mousedown', handler);
		ref.current?.addEventListener('keydown', onKey);
		const root = ref.current;
		if (searchable) setTimeout(() => searchRef.current?.focus(), 0);
		return () => {
			document.removeEventListener('mousedown', handler);
			root?.removeEventListener('keydown', onKey);
			setQuery('');
		};
	}, [open, searchable]);

	const toggle = (id: string) => {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		onChange(next);
	};

	const label =
		selected.size === 0
			? placeholder
			: selected.size === 1
				? (options.find((o) => selected.has(o.id))?.label ?? placeholder)
				: `${selected.size} đã chọn`;

	const filtered =
		searchable && query.trim()
			? options.filter((o) =>
					o.label.toLowerCase().includes(query.trim().toLowerCase()),
				)
			: options;

	return (
		<div
			ref={ref}
			className={className}
			style={{ position: 'relative' }}
		>
			<button
				ref={triggerRef}
				id={id}
				type='button'
				aria-label={ariaLabel}
				aria-describedby={ariaDescribedBy}
				aria-invalid={ariaInvalid}
				aria-required={ariaRequired}
				className={`${styles.trigger} ${selected.size > 0 ? styles.triggerActive : ''}`}
				onClick={() => setOpen((o) => !o)}
				aria-haspopup='true'
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
			>
				<span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
					{label}
				</span>
			</button>
			{/* Nút xóa lọc là nút riêng (không lồng trong nút mở) — Tab tới được */}
			{selected.size > 0 && (
				<button
					type='button'
					className={styles.clear}
					onClick={() => onChange(new Set())}
					title='Bỏ chọn tất cả'
					aria-label={`Bỏ lọc ${placeholder}`}
				>
					<span aria-hidden='true'>✕</span>
				</button>
			)}
			{open && (
				<div
					id={menuId}
					role='group'
					aria-label={placeholder}
					className={styles.menu}
					style={alignRight ? { left: 'auto', right: 0 } : undefined}
				>
					{searchable && (
						<div className={styles.searchWrap}>
							<input
								ref={searchRef}
								type='text'
								className={styles.searchInput}
								placeholder='Tìm kiếm...'
								aria-label='Tìm trong danh sách'
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								onClick={(e) => e.stopPropagation()}
							/>
						</div>
					)}
					<div className={styles.options}>
						{filtered.length === 0 ? (
							<div className={styles.empty}>Không tìm thấy kết quả</div>
						) : (
							filtered.map((opt) => {
								const on = selected.has(opt.id);
								return (
									<label
										key={opt.id}
										className={`${styles.option} ${on ? styles.optionSelected : ''}`}
									>
										<div
											className={`${styles.checkbox} ${on ? styles.checkboxSelected : ''}`}
										>
											{on && (
												<CheckSmSvg
													style={{ color: '#fff', width: 9, height: 7 }}
												/>
											)}
										</div>
										{/* Ẩn bằng mắt nhưng vẫn Tab/Space được (display:none làm mất bàn phím) */}
										<input
											type='checkbox'
											checked={on}
											onChange={() => toggle(opt.id)}
											className={styles.nativeCheck}
										/>
										{opt.label}
									</label>
								);
							})
						)}
					</div>
				</div>
			)}
		</div>
	);
}

markFieldControl(MultiSelect);
