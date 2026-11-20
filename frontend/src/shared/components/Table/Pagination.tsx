import { ChevLSvg, ChevRSvg } from '@/assets/icons';
import { PAGE_SIZE_OPTIONS } from '../../utils/constants';
import styles from './Pagination.module.css';

interface PaginationProps {
	page: number;
	totalPages: number;
	total: number;
	rowsPerPage: number;
	pageSizeOptions?: readonly number[];
	onPageChange: (page: number) => void;
	onRowsPerPageChange?: (n: number) => void;
	itemLabel?: string;
	// Ẩn dropdown chọn số dòng/trang khi trang đã có control riêng ở nơi khác.
	hideSizeSelect?: boolean;
	// Ghi đè hoàn toàn dòng thông tin bên trái (khi feature cần câu chữ riêng).
	infoText?: string;
}

export function Pagination({
	page,
	totalPages,
	total,
	rowsPerPage,
	pageSizeOptions = PAGE_SIZE_OPTIONS,
	onPageChange,
	onRowsPerPageChange,
	itemLabel = 'mục',
	hideSizeSelect = false,
	infoText,
}: PaginationProps) {
	const safe = Math.min(page, Math.max(1, totalPages));

	const info =
		infoText ??
		(total === 0
			? `Không có ${itemLabel} nào`
			: `Hiển thị ${(safe - 1) * rowsPerPage + 1}–${Math.min(safe * rowsPerPage, total)} trong ${total} ${itemLabel}`);

	const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
		.filter((p) => p === 1 || p === totalPages || Math.abs(p - safe) <= 1)
		.reduce<(number | '…')[]>((acc, p, i, arr) => {
			if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…');
			acc.push(p);
			return acc;
		}, []);

	return (
		<nav
			className={styles.wrapper}
			aria-label='Phân trang'
		>
			<span className={styles.info}>{info}</span>
			<div className={styles.spacer} />
			{!hideSizeSelect && (
				<select
					className={styles.sizeSelect}
					aria-label='Số dòng mỗi trang'
					value={rowsPerPage}
					onChange={(e) => onRowsPerPageChange?.(Number(e.target.value))}
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
			)}
			<div className={styles.buttons}>
				<button
					type='button'
					className={styles.btn}
					onClick={() => onPageChange(Math.max(1, safe - 1))}
					disabled={safe === 1}
					aria-label='Trang trước'
				>
					<ChevLSvg
						style={{ width: 13, height: 13 }}
						aria-hidden='true'
					/>
				</button>
				{pages.map((p, i) =>
					p === '…' ? (
						<span
							key={`e${i}`}
							className={styles.ellipsis}
							aria-hidden='true'
						>
							…
						</span>
					) : (
						<button
							key={p}
							type='button'
							className={`${styles.btn} ${safe === p ? styles.btnActive : ''}`}
							onClick={() => onPageChange(p as number)}
							aria-label={`Trang ${p}`}
							aria-current={safe === p ? 'page' : undefined}
						>
							{p}
						</button>
					),
				)}
				<button
					type='button'
					className={styles.btn}
					onClick={() => onPageChange(Math.min(totalPages, safe + 1))}
					disabled={safe === totalPages}
					aria-label='Trang sau'
				>
					<ChevRSvg
						style={{ width: 13, height: 13 }}
						aria-hidden='true'
					/>
				</button>
			</div>
		</nav>
	);
}
