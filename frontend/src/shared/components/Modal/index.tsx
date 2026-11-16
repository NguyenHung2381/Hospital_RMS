import { CheckSvg, TrashSvg, XSvg } from '@/assets/icons';
import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../utils/cx';
import styles from './Modal.module.css';

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
	open: boolean;
	onClose: () => void;
	title?: React.ReactNode;
	/** Dòng phụ dưới tiêu đề (vd tên bản ghi đang thao tác). */
	subtitle?: React.ReactNode;
	/** Icon ô vuông bên trái tiêu đề. */
	icon?: React.ReactNode;
	/** 'danger' tô đỏ ô icon (hộp thoại xóa). */
	tone?: 'default' | 'danger';
	children: React.ReactNode;
	footer?: React.ReactNode;
	size?: ModalSize;
	closeOnBackdrop?: boolean;
	/** Form đang có thay đổi chưa lưu: Esc / bấm nền / nút X hỏi lại trước khi đóng
	 *  thay vì đóng ngay (nút "Hủy" ở footer vẫn đóng thẳng — đó là chủ ý rõ ràng). */
	dirty?: boolean;
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
	dirty = false,
	className,
	bodyClassName,
	iconStyle,
}: ModalProps) {
	const backdropRef = useRef<HTMLDivElement>(null);
	const dialogRef = useRef<HTMLDivElement>(null);
	const titleId = useId();
	const [confirmDiscard, setConfirmDiscard] = useState(false);

	// Đóng "mềm" (Esc, bấm nền, nút X): còn thay đổi chưa lưu thì hỏi lại trước.
	const requestClose = () => {
		if (dirty) setConfirmDiscard(true);
		else onClose();
	};
	const requestCloseRef = useRef(requestClose);
	useEffect(() => {
		requestCloseRef.current = requestClose;
	});

	// Focus: đưa vào hộp thoại khi mở (chính khung dialog — trình đọc màn hình đọc
	// tiêu đề; không tự focus ô nhập vì DatePicker/Select mở popover khi focus),
	// giữ Tab trong hộp thoại, trả focus về chỗ cũ khi đóng.
	useEffect(() => {
		if (!open) return;
		const previouslyFocused = document.activeElement as HTMLElement | null;
		const dialog = dialogRef.current;
		if (dialog && !dialog.contains(document.activeElement)) {
			dialog.focus({ preventScroll: true });
		}

		const isTopmost = () => {
			const all = document.querySelectorAll(`.${styles.modalBackdrop}`);
			return all[all.length - 1] === backdropRef.current;
		};
		const onKey = (e: KeyboardEvent) => {
			// Modal chồng nhau: chỉ modal trên cùng (portal mở sau ⇒ nằm cuối body) xử lý phím
			if (!isTopmost()) return;
			if (e.key === 'Escape') {
				e.preventDefault();
				requestCloseRef.current();
				return;
			}
			if (e.key !== 'Tab' || !dialogRef.current) return;
			const items = Array.from(
				dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
			).filter((el) => el.offsetParent !== null || el === document.activeElement);
			if (items.length === 0) {
				e.preventDefault();
				return;
			}
			const firstEl = items[0];
			const lastEl = items[items.length - 1];
			const active = document.activeElement;
			if (e.shiftKey && (active === firstEl || active === dialogRef.current)) {
				e.preventDefault();
				lastEl.focus();
			} else if (!e.shiftKey && active === lastEl) {
				e.preventDefault();
				firstEl.focus();
			} else if (!dialogRef.current.contains(active)) {
				e.preventDefault();
				firstEl.focus();
			}
		};
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('keydown', onKey);
			if (previouslyFocused && document.contains(previouslyFocused)) {
				previouslyFocused.focus({ preventScroll: true });
			}
		};
	}, [open]);

	if (!open) return null;

	// Render ra document.body: modal mở từ trong modal khác (vd "Thêm bài học" trong
	// chi tiết chương trình) không bị khung cha — có transform của animation pop-in,
	// overflow: hidden — giữ position: fixed lại và cắt mất header / footer.
	return createPortal(
		<div
			ref={backdropRef}
			className={`${styles.modalBackdrop} ${styles.top}`}
			onClick={(e) => closeOnBackdrop && e.target === e.currentTarget && requestClose()}
		>
			<div
				ref={dialogRef}
				className={cx(styles.modal, styles.dialog, size === 'sm' ? styles.modalSm : styles[size], className)}
				role='dialog'
				aria-modal='true'
				aria-labelledby={title ? titleId : undefined}
				tabIndex={-1}
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
							<h2
								id={titleId}
								className={styles.modalTitle}
							>
								{title}
							</h2>
							{subtitle && <div className={styles.modalSub}>{subtitle}</div>}
						</div>
						<button
							className={styles.modalClose}
							onClick={requestClose}
							type='button'
							aria-label='Đóng'
						>
							<XSvg />
						</button>
					</div>
				)}
				<div className={cx(styles.body, bodyClassName)}>{children}</div>
				{confirmDiscard ? (
					<div
						className={`${styles.modalFooter} ${styles.discardBar}`}
						role='alertdialog'
						aria-label='Bỏ thay đổi chưa lưu?'
					>
						<span className={styles.discardText}>Bạn có thay đổi chưa lưu. Đóng sẽ mất các thay đổi này.</span>
						<div className={styles.discardActions}>
							<button
								type='button'
								className={styles.btnCancel}
								onClick={() => setConfirmDiscard(false)}
								autoFocus
							>
								Tiếp tục sửa
							</button>
							<button
								type='button'
								className={styles.btnDanger}
								onClick={() => {
									setConfirmDiscard(false);
									onClose();
								}}
							>
								Bỏ thay đổi
							</button>
						</div>
					</div>
				) : (
					footer && <div className={`${styles.modalFooter} ${styles.footerEnd}`}>{footer}</div>
				)}
			</div>
		</div>,
		document.body,
	);
}

/** Cặp nút chuẩn ở footer: "Hủy" + nút xác nhận (spinner khi đang lưu). */
export function ModalActions({
	onCancel,
	onConfirm,
	loading,
	disabled,
	confirmLabel,
	confirmIcon = <CheckSvg />,
	cancelLabel = 'Hủy',
}: {
	onCancel: () => void;
	onConfirm: () => void;
	loading?: boolean;
	/** Khóa riêng nút xác nhận (vd form chưa hợp lệ). */
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
	/** Tên bản ghi sắp xóa — hiện dưới tiêu đề. */
	subtitle?: React.ReactNode;
	onClose: () => void;
	/** Trả Promise thì hộp thoại tự hiện trạng thái đang xóa và lỗi (nếu reject). */
	onConfirm: () => void | Promise<void>;
	loading?: boolean;
	confirmLabel?: React.ReactNode;
	/** Nội dung giải thích; chuỗi thường được bọc sẵn thành đoạn mô tả. */
	children: React.ReactNode;
	/** Cảnh báo hệ quả (khung vàng), vd dữ liệu liên quan sẽ bị gỡ. */
	warning?: React.ReactNode;
}

/** Hộp thoại xác nhận xóa 1 bản ghi — dùng chung cho mọi danh mục. */
export function ConfirmDeleteModal({
	title,
	subtitle,
	onClose,
	onConfirm,
	loading,
	confirmLabel = 'Xác nhận xóa',
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
			setError(err instanceof Error ? err.message : 'Xóa thất bại');
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
						Hủy
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
