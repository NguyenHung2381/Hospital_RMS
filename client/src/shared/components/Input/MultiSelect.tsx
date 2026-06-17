import { CheckSmSvg } from '@/assets/icons';
import { useEffect, useRef, useState } from 'react';
import styles from './MultiSelect.module.css';

interface MultiSelectProps {
	options: { id: string; label: string }[];
	selected: Set<string>;
	onChange: (next: Set<string>) => void;
	placeholder: string;
	searchable?: boolean;
}

export function MultiSelect({
	options,
	selected,
	onChange,
	placeholder,
	searchable,
}: MultiSelectProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [alignRight, setAlignRight] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);

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
		document.addEventListener('mousedown', handler);
		if (searchable) setTimeout(() => searchRef.current?.focus(), 0);
		return () => {
			document.removeEventListener('mousedown', handler);
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
			style={{ position: 'relative' }}
		>
			<button
				type='button'
				className={`${styles.trigger} ${selected.size > 0 ? styles.triggerActive : ''}`}
				onClick={() => setOpen((o) => !o)}
			>
				<span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
					{label}
				</span>
				{selected.size > 0 && (
					<span
						className={styles.clear}
						onClick={(e) => {
							e.stopPropagation();
							onChange(new Set());
						}}
						title='Bỏ chọn tất cả'
					>
						✕
					</span>
				)}
			</button>
			{open && (
				<div
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
										<input
											type='checkbox'
											checked={on}
											onChange={() => toggle(opt.id)}
											style={{ display: 'none' }}
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
