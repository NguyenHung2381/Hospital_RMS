import { useState, type ReactNode } from 'react';
import { EditSvg, TrashSvg } from '@/assets/icons';
import { Modal } from '../Modal';
import { Button } from '../Button';
import styles from './RowSelect.module.css';

interface SelectCheckboxProps {
	checked: boolean;
	onChange: () => void;
	title?: string;
	/** Đánh dấu ô header khi mới chọn một phần (không phải tất cả). */
	indeterminate?: boolean;
}

export function SelectCheckbox({
	checked,
	onChange,
	title,
	indeterminate,
}: SelectCheckboxProps) {
	return (
		<input
			type='checkbox'
			className={styles.checkbox}
			title={title}
			aria-label={title}
			checked={checked}
			ref={(el) => {
				if (el) el.indeterminate = !checked && !!indeterminate;
			}}
			onChange={onChange}
			onClick={(e) => e.stopPropagation()}
		/>
	);
}

interface SelectionBarProps {
	count: number;
	onClear: () => void;
	itemLabel?: string;
	/** Nút hành động hàng loạt (Sửa đồng loạt / Xoá đã chọn…) hiển thị trong thanh. */
	actions?: ReactNode;
}

/** Thanh mảnh hiển thị số dòng đang chọn + nút hành động + nút bỏ chọn. Ẩn khi count = 0. */
export function SelectionBar({
	count,
	onClear,
	itemLabel,
	actions,
}: SelectionBarProps) {
	if (count <= 0) return null;
	return (
		<div className={styles.selectionBar}>
			<span>
				Đã chọn {count}
				{itemLabel ? ` ${itemLabel}` : ''}
			</span>
			{actions && <div className={styles.barActions}>{actions}</div>}
			<button
				type='button'
				className={styles.clearBtn}
				onClick={onClear}
			>
				Bỏ chọn
			</button>
		</div>
	);
}

interface BulkButtonProps {
	onClick: () => void;
	children: ReactNode;
	danger?: boolean;
	disabled?: boolean;
}

/** Nút bấm dùng trong `SelectionBar.actions`. */
export function BulkButton({
	onClick,
	children,
	danger,
	disabled,
}: BulkButtonProps) {
	return (
		<button
			type='button'
			className={`${styles.bulkBtn} ${danger ? styles.bulkBtnDanger : ''}`}
			onClick={onClick}
			disabled={disabled}
		>
			{children}
		</button>
	);
}

interface BulkDeleteModalProps {
	open: boolean;
	count: number;
	itemLabel: string;
	onClose: () => void;
	onConfirm: () => void;
	loading?: boolean;
	/** Cảnh báo hệ quả khi xoá (vd: dữ liệu liên quan cũng bị gỡ). */
	note?: ReactNode;
}

/** Hộp thoại xác nhận xoá hàng loạt, hiển thị đúng số lượng đang chọn. */
export function BulkDeleteModal({
	open,
	count,
	itemLabel,
	onClose,
	onConfirm,
	loading,
	note,
}: BulkDeleteModalProps) {
	return (
		<Modal
			open={open}
			onClose={onClose}
			title='Xoá hàng loạt'
			size='sm'
			footer={
				<>
					<Button
						variant='ghost'
						onClick={onClose}
						disabled={loading}
					>
						Huỷ
					</Button>
					<Button
						variant='danger'
						onClick={onConfirm}
						loading={loading}
					>
						Xoá {count} {itemLabel}
					</Button>
				</>
			}
		>
			<p className={styles.deleteText}>
				Bạn có chắc muốn xoá vĩnh viễn{' '}
				<strong>
					{count} {itemLabel}
				</strong>{' '}
				đã chọn? Thao tác này không thể hoàn tác.
			</p>
			{note && <div className={styles.deleteNote}>{note}</div>}
		</Modal>
	);
}

/** Phần API từ `useRowSelection` mà `BulkBar` cần. */
export interface RowSelectionLike {
	selectedIds: Set<string>;
	selectedCount: number;
	clearSelection: () => void;
}

interface BulkBarProps {
	rowSel: RowSelectionLike;
	/** Danh từ đếm được, vd "khoa phòng", "tài khoản". */
	itemLabel: string;
	loading?: boolean;
	/** Nhận danh sách id đã chọn, thực hiện xoá. `BulkBar` tự xoá lựa chọn sau đó. */
	onBulkDelete: (ids: string[]) => Promise<void> | void;
	/** Mở modal sửa hàng loạt của feature. Bỏ trống thì không hiện nút "Sửa đồng loạt". */
	onBulkEdit?: () => void;
	/** Cảnh báo hệ quả hiển thị trong hộp thoại xoá. */
	deleteNote?: ReactNode;
}

/**
 * Thanh hành động hàng loạt dùng chung: nút "Sửa đồng loạt" (tuỳ chọn) + "Xoá đã chọn"
 * kèm hộp thoại xác nhận số lượng. Đặt ngay trên `<table>`.
 */
export function BulkBar({
	rowSel,
	itemLabel,
	loading,
	onBulkDelete,
	onBulkEdit,
	deleteNote,
}: BulkBarProps) {
	const [confirmOpen, setConfirmOpen] = useState(false);

	return (
		<>
			<SelectionBar
				count={rowSel.selectedCount}
				onClear={rowSel.clearSelection}
				itemLabel={itemLabel}
				actions={
					<>
						{onBulkEdit && (
							<BulkButton onClick={onBulkEdit}>
								<EditSvg /> Sửa đồng loạt
							</BulkButton>
						)}
						<BulkButton
							danger
							onClick={() => setConfirmOpen(true)}
						>
							<TrashSvg /> Xoá đã chọn
						</BulkButton>
					</>
				}
			/>
			<BulkDeleteModal
				open={confirmOpen}
				count={rowSel.selectedCount}
				itemLabel={itemLabel}
				loading={loading}
				note={deleteNote}
				onClose={() => setConfirmOpen(false)}
				onConfirm={async () => {
					await onBulkDelete([...rowSel.selectedIds]);
					rowSel.clearSelection();
					setConfirmOpen(false);
				}}
			/>
		</>
	);
}
