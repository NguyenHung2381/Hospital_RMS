import { useEffect, useRef, useState } from 'react';
import styles from './SearchableSelect.module.css';

interface SearchableSelectProps {
	id?: string;
	options: { id: string; name: string }[];
	value: string;
	onChange: (id: string) => void;
	placeholder: string;
	className?: string;
	hasError?: boolean;
}

export function SearchableSelect({
	id,
	options,
	value,
	onChange,
	placeholder,
	className,
	hasError,
}: SearchableSelectProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const ref = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', handler);
		setTimeout(() => searchRef.current?.focus(), 0);
		return () => {
			document.removeEventListener('mousedown', handler);
			setQuery('');
		};
	}, [open]);

	const selected = options.find((o) => o.id === value);
	const filtered = query.trim()
		? options.filter((o) =>
				o.name.toLowerCase().includes(query.trim().toLowerCase()),
			)
		: options;

	return (
		<div
			ref={ref}
			className={`${styles.wrap} ${className ?? ''}`}
		>
			<button
				id={id}
				type='button'
				className={`${styles.trigger} ${open ? styles.triggerOpen : ''} ${hasError ? styles.hasError : ''}`}
				onClick={() => setOpen((o) => !o)}
			>
				<span className={selected ? undefined : styles.placeholder}>
					{selected ? selected.name : placeholder}
				</span>
			</button>
			{open && (
				<div className={styles.menu}>
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
									className={`${styles.option} ${o.id === value ? styles.optionSelected : ''}`}
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
				</div>
			)}
		</div>
	);
}
