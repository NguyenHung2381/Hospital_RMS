import { CheckSvg, InfoSvg, WarnSvg } from '@/assets/icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../Modal';
import styles from '../Modal/Modal.module.css';
import { errorMessage } from './errorMessage';

export interface ConfirmDialogProps {
	open: boolean;
	title: ReactNode;
	/** Nội dung giải thích; chuỗi thường hiện thành đoạn mô tả. */
	message?: ReactNode;
	/** Nội dung thêm dưới `message` (vd danh sách bản ghi bị ảnh hưởng). */
	children?: ReactNode;
	/** 'danger' — hành động khó hoàn tác (xóa, hủy, thu hồi): nút đỏ, focus mặc định ở "Hủy". */
	tone?: 'default' | 'danger';
	confirmLabel?: ReactNode;
	/** `null` ẩn nút hủy (hộp thoại thông báo chỉ có 1 nút). */
	cancelLabel?: ReactNode | null;
	/** Thay icon ô vuông cạnh tiêu đề. */
	icon?: ReactNode;
	/**
	 * Trả Promise thì hộp thoại tự hiện trạng thái đang xử lý (khóa nút, chặn Esc / bấm nền)
	 * và hiện lỗi ngay trong hộp thoại nếu reject. Hộp thoại KHÔNG tự đóng — nơi gọi
	 * đặt `open=false` khi xong (thường ngay trong onConfirm sau khi await).
	 */
	onConfirm: () => void | Promise<unknown>;
	/** Bấm "Hủy", nút X, Esc hoặc bấm nền. */
	onCancel: () => void;
	/** Trạng thái đang xử lý do nơi gọi tự quản (ngoài Promise của onConfirm). */
	loading?: boolean;
	/** Câu báo lỗi khi onConfirm reject mà lỗi không có message. */
	errorFallback?: string;
}

/**
 * Hộp thoại xác nhận dựng trên <Modal> — trung tính hoặc `tone="danger"`.
 * Dạng khai báo (controlled):
 *
 *   <ConfirmDialog
 *     open={!!target}
 *     tone='danger'
 *     title='Thu hồi chứng chỉ?'
 *     message={`Chứng chỉ của ${target?.name} sẽ hết hiệu lực ngay.`}
 *     confirmLabel='Thu hồi'
 *     onCancel={() => setTarget(null)}
 *     onConfirm={async () => { await revoke(target.id); setTarget(null); }}
 *   />
 *
 * Thay `window.confirm` không cần state: `await confirmDialog({ … })` (xem dialogStore.ts).
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
	if (!props.open) return null;
	// Tách phần thân để trạng thái đang xử lý / lỗi tự reset mỗi lần mở lại
	return <ConfirmDialogBody {...props} />;
}

function ConfirmDialogBody({
	title,
	message,
	children,
	tone = 'default',
	confirmLabel = 'Xác nhận',
	cancelLabel = 'Hủy',
	icon,
	onConfirm,
	onCancel,
	loading,
	errorFallback = 'Thao tác thất bại, vui lòng thử lại.',
}: ConfirmDialogProps) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const pending = !!loading || busy;
	const danger = tone === 'danger';
	const cancelRef = useRef<HTMLButtonElement>(null);
	const confirmRef = useRef<HTMLButtonElement>(null);

	// Focus ban đầu: hành động nguy hiểm → nút an toàn ("Hủy"); còn lại → nút xác nhận.
	// Dùng effect thay autoFocus: effect của <Modal> (con) chạy trước, kịp ghi nhớ phần tử
	// đang focus ngoài trang để trả lại khi đóng; autoFocus chạy sớm hơn sẽ làm mất mốc đó.
	useEffect(() => {
		(danger && cancelRef.current ? cancelRef.current : confirmRef.current)?.focus();
	}, [danger]);

	const confirm = async () => {
		setError('');
		let result: void | Promise<unknown>;
		try {
			result = onConfirm();
		} catch (err) {
			setError(errorMessage(err, errorFallback));
			return;
		}
		if (!(result instanceof Promise)) return;
		setBusy(true);
		try {
			await result;
		} catch (err) {
			setError(errorMessage(err, errorFallback));
		} finally {
			setBusy(false);
		}
	};

	const cancel = () => {
		if (!pending) onCancel();
	};

	return (
		<Modal
			open
			onClose={cancel}
			title={title}
			icon={icon ?? (danger ? <WarnSvg /> : <InfoSvg />)}
			tone={danger ? 'danger' : 'default'}
			size='sm'
			closeOnBackdrop={!pending}
			footer={
				<>
					{cancelLabel !== null && (
						<button
							type='button'
							className={styles.btnCancel}
							onClick={cancel}
							disabled={pending}
							ref={cancelRef}
						>
							{cancelLabel}
						</button>
					)}
					<button
						type='button'
						className={danger ? styles.btnDanger : styles.btnConfirm}
						onClick={() => void confirm()}
						disabled={pending}
						aria-busy={pending || undefined}
						ref={confirmRef}
					>
						{pending ? (
							<span
								className={danger ? `${styles.spinner} ${styles.spinnerDark}` : styles.spinner}
								aria-hidden='true'
							/>
						) : danger ? null : (
							<CheckSvg aria-hidden='true' />
						)}
						{confirmLabel}
					</button>
				</>
			}
		>
			<div className={styles.stack}>
				{message &&
					(typeof message === 'string' ? <p className={styles.deleteDesc}>{message}</p> : message)}
				{children}
				{error && (
					<div
						className={styles.error}
						role='alert'
					>
						{error}
					</div>
				)}
			</div>
		</Modal>
	);
}
