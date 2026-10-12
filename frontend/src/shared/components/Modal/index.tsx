import { CheckSvg, TrashSvg, XSvg } from '@/assets/icons';
import React, { useEffect, useState } from 'react';
import { cx } from '../../utils/cx';
import styles from './Modal.module.css';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
	open: boolean;
	onClose: () => void;
	title?: React.ReactNode;
	/** Dòng phụ dưới tiêu đề (vd tên bản ghi đang thao tác). */
	subtitle?: React.ReactNode;
	/** Icon ô vuông bên trái tiêu đề. */
	icon?: React.ReactNode;
	/** 'danger' tô đỏ ô icon (hộp thoại xoá). */
	tone?: 'default' | 'danger';
	children: React.ReactNode;
	footer?: React.ReactNode;
	size?: ModalSize;
	closeOnBackdrop?: boolean;
	/** Lớp thêm cho khung hộp thoại (vd giữ max-width riêng của feature). */
	className?: string;
	/** Lớp thêm cho phần thân (vd bố cục cột có gap). */
	bodyClassName?: string;
	/** Màu riêng cho ô icon. */
	iconStyle?: React.CSSProperties;
}

export function Modal({
	open,
	onClose,
	title,
	subtitle,
	icon,
	tone = 'default',
	children,
	footer,
	size = 'md',
	closeOnBackdrop = true,
	className,
	bodyClassName,
	iconStyle,
}: ModalProps) {
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div
			className={`${styles.modalBackdrop} ${styles.top}`}
			onClick={(e) => closeOnBackdrop && e.target === e.currentTarget && onClose()}
		>
			<div
				className={cx(styles.modal, styles.dialog, size === 'sm' ? styles.modalSm : styles[size], className)}
				role='dialog'
				aria-modal='true'
			>
				{title && (
					<div className={styles.modalHeader}>
						{icon && (
							<div
								className={tone === 'danger' ? styles.modalHeaderIconDanger : styles.modalHeaderIcon}
								style={iconStyle}
							>
								{icon}
							</div>
						)}
						<div>
							<div className={styles.modalTitle}>{title}</div>
							{subtitle && <div className={styles.modalSub}>{subtitle}</div>}
						</div>
						<button
							className={styles.modalClose}
							onClick={onClose}
							type='button'
							aria-label='Đóng'
						>
							<XSvg />
						</button>
					</div>
				)}
				<div className={cx(styles.body, bodyClassName)}>{children}</div>
				{footer && <div className={`${styles.modalFooter} ${styles.footerEnd}`}>{footer}</div>}
			</div>
		</div>
	);
}

/** Cặp nút chuẩn ở footer: "Huỷ" + nút xác nhận (spinner khi đang lưu). */
export function ModalActions({
	onCancel,
	onConfirm,
	loading,
	disabled,
	confirmLabel,
	confirmIcon = <CheckSvg />,
	cancelLabel = 'Huỷ',
}: {
	onCancel: () => void;
	onConfirm: () => void;
	loading?: boolean;
	/** Khoá riêng nút xác nhận (vd form chưa hợp lệ). */
	disabled?: boolean;
	confirmLabel: React.ReactNode;
	confirmIcon?: React.ReactNode;
	cancelLabel?: React.ReactNode;
}) {
	return (
		<>
			<button
				type='button'
				className={styles.btnCancel}
				onClick={onCancel}
				disabled={loading}
			>
				{cancelLabel}
			</button>
			<button
				type='button'
				className={styles.btnConfirm}
				onClick={onConfirm}
				disabled={loading || disabled}
			>
				{loading ? <span className={styles.spinner} /> : confirmIcon}
				{confirmLabel}
			</button>
		</>
	);
}

interface ConfirmDeleteModalProps {
	title: React.ReactNode;
	/** Tên bản ghi sắp xoá — hiện dưới tiêu đề. */
	subtitle?: React.ReactNode;
	onClose: () => void;
	/** Trả Promise thì hộp thoại tự hiện trạng thái đang xoá và lỗi (nếu reject). */
	onConfirm: () => void | Promise<void>;
	loading?: boolean;
	confirmLabel?: React.ReactNode;
	/** Nội dung giải thích; chuỗi thường được bọc sẵn thành đoạn mô tả. */
	children: React.ReactNode;
	/** Cảnh báo hệ quả (khung vàng), vd dữ liệu liên quan sẽ bị gỡ. */
	warning?: React.ReactNode;
}

/** Hộp thoại xác nhận xoá 1 bản ghi — dùng chung cho mọi danh mục. */
export function ConfirmDeleteModal({
	title,
	subtitle,
	onClose,
	onConfirm,
	loading,
	confirmLabel = 'Xác nhận xoá',
	children,
	warning,
}: ConfirmDeleteModalProps) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const pending = loading || busy;

	const confirm = async () => {
		const result = onConfirm();
		if (!(result instanceof Promise)) return;
		setBusy(true);
		setError('');
		try {
			await result;
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			title={title}
			subtitle={subtitle}
			icon={<TrashSvg />}
			tone='danger'
			size='sm'
			closeOnBackdrop={!pending}
			footer={
				<>
					<button
						type='button'
						className={styles.btnCancel}
						onClick={onClose}
						disabled={pending}
					>
						Huỷ
					</button>
					<button
						type='button'
						className={styles.btnDanger}
						onClick={() => void confirm()}
						disabled={pending}
					>
						{pending ? <span className={`${styles.spinner} ${styles.spinnerDark}`} /> : <TrashSvg />}
						{confirmLabel}
					</button>
				</>
			}
		>
			<div className={styles.stack}>
				<div className={styles.deleteDesc}>{children}</div>
				{warning && <div className={styles.warnBox}>{warning}</div>}
				{error && <div className={styles.error}>{error}</div>}
			</div>
		</Modal>
	);
}
