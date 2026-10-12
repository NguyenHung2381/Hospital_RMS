import { useState, type ReactNode } from 'react';
import { EditSvg, SearchSvg, TrashSvg, XSvg } from '@/assets/icons';
import { BulkButton, BulkDeleteModal, type RowSelectionLike } from './RowSelect';
import styles from './TableToolbar.module.css';

/** Ô tìm kiếm có nút xoá nhanh, đặt trong `tableControls`. */
export function SearchInput({
	value,
	onChange,
	placeholder = 'Tìm kiếm...',
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
}) {
	return (
		<div className={styles.searchBox}>
			<SearchSvg className={styles.searchIcon} />
			<input
				className={styles.searchInput}
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
			{value && (
				<button
					type='button'
					className={styles.searchClear}
					aria-label='Xoá tìm kiếm'
					onClick={() => onChange('')}
				>
					<XSvg />
				</button>
			)}
		</div>
	);
}

/** "Hiển thị [n] dòng" — giá trị 0 nghĩa là tất cả. */
export function PageSizeSelect({
	value,
	onChange,
	options = [5, 10, 25, 50, 0],
}: {
	value: number;
	onChange: (v: number) => void;
	options?: readonly number[];
}) {
	return (
		<div className={styles.pageSizeWrap}>
			<label className={styles.pageSizeLabel}>Hiển thị</label>
			<select
				className={styles.pageSizeSelect}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
			>
				{options.map((n) => (
					<option
						key={n}
						value={n}
					>
						{n === 0 ? 'Tất cả' : n}
					</option>
				))}
			</select>
			<span className={styles.pageSizeLabel}>dòng</span>
		</div>
	);
}

/**
 * Nhãn đếm cạnh tiêu đề bảng. Khi đang chọn dòng thì đổi thành
 * "Đã chọn N · Xoá đã chọn · Bỏ chọn" kèm hộp thoại xác nhận xoá hàng loạt.
 */
export function SelectionCount({
	rowSel,
	itemLabel,
	loading,
	onBulkDelete,
	extraActions,
	children,
}: {
	rowSel: RowSelectionLike;
	itemLabel: string;
	loading?: boolean;
	/** Bỏ trống thì không có nút "Xoá đã chọn". */
	onBulkDelete?: (ids: string[]) => Promise<void> | void;
	/** Nút hàng loạt khác (vd "Sửa đồng loạt") đặt trước nút xoá. */
	extraActions?: ReactNode;
	/** Nội dung khi không chọn dòng nào, vd "12 giảng viên". */
	children: ReactNode;
}) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	if (rowSel.selectedCount === 0) return <span className={styles.count}>{children}</span>;
	return (
		<span className={styles.count}>
			Đã chọn {rowSel.selectedCount}
			{extraActions}
			{onBulkDelete && (
				<>
					<BulkButton
						danger
						onClick={() => setConfirmOpen(true)}
					>
						<TrashSvg /> Xoá đã chọn
					</BulkButton>
					<BulkDeleteModal
						open={confirmOpen}
						count={rowSel.selectedCount}
						itemLabel={itemLabel}
						loading={loading}
						onClose={() => setConfirmOpen(false)}
						onConfirm={async () => {
							await onBulkDelete([...rowSel.selectedIds]);
							rowSel.clearSelection();
							setConfirmOpen(false);
						}}
					/>
				</>
			)}
			<button
				type='button'
				className={styles.clearBtn}
				onClick={rowSel.clearSelection}
			>
				Bỏ chọn
			</button>
		</span>
	);
}

/** Nút icon vuông trong cột "Thao tác". */
export function RowAction({
	title,
	onClick,
	danger,
	disabled,
	children,
}: {
	title: string;
	onClick: () => void;
	danger?: boolean;
	disabled?: boolean;
	children: ReactNode;
}) {
	return (
		<button
			type='button'
			className={danger ? `${styles.action} ${styles.actionDanger}` : styles.action}
			title={title}
			aria-label={title}
			disabled={disabled}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

/** Cụm nút ở cột "Thao tác": các `RowAction` riêng (children) rồi tới Sửa / Xoá. */
export function RowActions({
	onEdit,
	onDelete,
	children,
}: {
	onEdit?: () => void;
	onDelete?: () => void;
	children?: ReactNode;
}) {
	return (
		<div className={styles.actions}>
			{children}
			{onEdit && (
				<RowAction
					title='Chỉnh sửa'
					onClick={onEdit}
				>
					<EditSvg />
				</RowAction>
			)}
			{onDelete && (
				<RowAction
					title='Xoá'
					danger
					onClick={onDelete}
				>
					<TrashSvg />
				</RowAction>
			)}
		</div>
	);
}
