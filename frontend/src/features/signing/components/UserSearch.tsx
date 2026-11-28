import { useEffect, useId, useRef, useState } from 'react';
import { signRequestApi, type UserOption } from '../api/signRequestApi';
import styles from './UserSearch.module.css';

/** Ô tìm cán bộ (tên / tên đăng nhập / mã NV) để thêm vào danh sách ký */
export function UserSearch({
	exclude,
	onPick,
	placeholder = 'Thêm người ký — gõ tên hoặc mã nhân viên',
}: {
	exclude: Set<string>;
	onPick: (u: UserOption) => void;
	placeholder?: string;
}) {
	const id = useId();
	const [q, setQ] = useState('');
	const [items, setItems] = useState<UserOption[]>([]);
	const [open, setOpen] = useState(false);
	const [hi, setHi] = useState(0);
	const seq = useRef(0);

	useEffect(() => {
		const term = q.trim();
		if (term.length < 2) return;
		const my = ++seq.current;
		const t = setTimeout(() => {
			signRequestApi
				.searchUsers(term)
				.then((r) => {
					if (my !== seq.current) return;
					setItems(r);
					setHi(0);
					setOpen(true);
				})
				.catch(() => {});
		}, 250);
		return () => clearTimeout(t);
	}, [q]);

	const shown = q.trim().length < 2 ? [] : items.filter((u) => !exclude.has(u.id));
	const pick = (u: UserOption) => {
		onPick(u);
		setQ('');
		setItems([]);
		setOpen(false);
	};

	return (
		<div className={styles.wrap}>
			<input
				className={styles.input}
				value={q}
				onChange={(e) => setQ(e.target.value)}
				onFocus={() => setOpen(true)}
				onBlur={() => setTimeout(() => setOpen(false), 150)}
				onKeyDown={(e) => {
					if (!shown.length) return;
					if (e.key === 'ArrowDown') {
						e.preventDefault();
						setHi((h) => Math.min(h + 1, shown.length - 1));
					} else if (e.key === 'ArrowUp') {
						e.preventDefault();
						setHi((h) => Math.max(h - 1, 0));
					} else if (e.key === 'Enter') {
						e.preventDefault();
						pick(shown[hi]);
					}
				}}
				placeholder={placeholder}
				role='combobox'
				aria-expanded={open && shown.length > 0}
				aria-controls={`${id}-list`}
				aria-autocomplete='list'
			/>
			{open && shown.length > 0 && (
				<ul
					id={`${id}-list`}
					className={styles.list}
					role='listbox'
				>
					{shown.map((u, i) => (
						<li
							key={u.id}
							role='option'
							aria-selected={i === hi}
							className={i === hi ? `${styles.item} ${styles.itemHi}` : styles.item}
							onMouseDown={(e) => {
								e.preventDefault();
								pick(u);
							}}
							onMouseEnter={() => setHi(i)}
						>
							<span className={styles.name}>{u.full_name}</span>
							<span className={styles.meta}>{[u.staff_number, u.username].filter(Boolean).join(' · ')}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
