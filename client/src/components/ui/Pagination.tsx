import styles from './Pagination.module.css';

const ChevL = (
	<svg
		viewBox='0 0 24 24'
		fill='none'
		stroke='currentColor'
		strokeWidth='2.5'
		strokeLinecap='round'
		style={{ width: 13, height: 13 }}
	>
		<polyline points='15 18 9 12 15 6' />
	</svg>
);

const ChevR = (
	<svg
		viewBox='0 0 24 24'
		fill='none'
		stroke='currentColor'
		strokeWidth='2.5'
		strokeLinecap='round'
		style={{ width: 13, height: 13 }}
	>
		<polyline points='9 18 15 12 9 6' />
	</svg>
);

interface PaginationProps {
	page: number;
	totalPages: number;
	total: number;
	rowsPerPage: number;
	pageSizeOptions: readonly number[];
	onPageChange: (page: number) => void;
	onRowsPerPageChange: (n: number) => void;
	/** Label for the item type, e.g. 'đề tài', 'người dùng'. */
	itemLabel?: string;
}

export function Pagination({
	page,
	totalPages,
	total,
	rowsPerPage,
	pageSizeOptions,
	onPageChange,
	onRowsPerPageChange,
	itemLabel = 'mục',
}: PaginationProps) {
	const safe = Math.min(page, Math.max(1, totalPages));

	const infoText =
		total === 0
			? `Không có ${itemLabel} nào`
			: `Hiển thị ${(safe - 1) * rowsPerPage + 1}–${Math.min(safe * rowsPerPage, total)} trong ${total} ${itemLabel}`;

	const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
		.filter((p) => p === 1 || p === totalPages || Math.abs(p - safe) <= 1)
		.reduce<(number | '…')[]>((acc, p, i, arr) => {
			if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…');
			acc.push(p);
			return acc;
		}, []);

	return (
		<div className={styles.wrapper}>
			<span className={styles.info}>{infoText}</span>
			<div className={styles.spacer} />
			<select
				className={styles.sizeSelect}
				value={rowsPerPage}
				onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
			>
				{pageSizeOptions.map((n) => (
					<option
						key={n}
						value={n}
					>
						{n} / trang
					</option>
				))}
			</select>
			<div className={styles.buttons}>
				<button
					className={styles.btn}
					onClick={() => onPageChange(Math.max(1, safe - 1))}
					disabled={safe === 1}
				>
					{ChevL}
				</button>
				{pages.map((p, i) =>
					p === '…' ? (
						<span
							key={`e${i}`}
							className={styles.ellipsis}
						>
							…
						</span>
					) : (
						<button
							key={p}
							className={`${styles.btn} ${safe === p ? styles.btnActive : ''}`}
							onClick={() => onPageChange(p as number)}
						>
							{p}
						</button>
					),
				)}
				<button
					className={styles.btn}
					onClick={() => onPageChange(Math.min(totalPages, safe + 1))}
					disabled={safe === totalPages}
				>
					{ChevR}
				</button>
			</div>
		</div>
	);
}
