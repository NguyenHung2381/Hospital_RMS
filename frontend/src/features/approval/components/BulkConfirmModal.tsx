import { useEffect, useId, useRef } from 'react';
import { useFocusTrap } from '@/shared/hooks/useFocusTrap';
import { CheckCircleSvg, XCircleSvg } from '@/assets/icons';
import styles from '../pages/Approval.module.css';

interface BulkConfirmModalProps {
	action: 'approve' | 'reject';
	count: number;
	comment: string;
	onChangeComment: (v: string) => void;
	onConfirm: () => void;
	onClose: () => void;
	loading: boolean;
}

export function BulkConfirmModal({
	action,
	count,
	comment,
	onChangeComment,
	onConfirm,
	onClose,
	loading,
}: BulkConfirmModalProps) {
	const dialogRef = useRef<HTMLDivElement>(null);
	const commentRef = useRef<HTMLTextAreaElement>(null);
	const titleId = useId();
	const descId = useId();
	// Giữ focus trong hộp thoại, Esc để đóng, trả focus về nút đã mở khi đóng
	useFocusTrap(dialogRef, { active: true, onEscape: onClose });
	useEffect(() => {
		commentRef.current?.focus();
	}, []);

	const isApprove = action === 'approve';
	const canSubmit = isApprove || comment.trim().length > 0;

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				ref={dialogRef}
				className={styles.modal}
				role='dialog'
				aria-modal='true'
				aria-labelledby={titleId}
				aria-describedby={descId}
				tabIndex={-1}
			>
				<div className={styles.modalBody}>
					<div
						className={`${styles.modalIcon} ${styles[isApprove ? 'iconApprove' : 'iconReject']}`}
					>
						{isApprove ? <CheckCircleSvg /> : <XCircleSvg />}
					</div>
					<h2 id={titleId} className={styles.modalTitle}>
						{isApprove ? 'Phê duyệt' : 'Không phê duyệt'} {count} đề tài đã chọn
					</h2>
					<p id={descId} className={styles.modalDesc}>
						Thao tác này sẽ {isApprove ? 'phê duyệt' : 'không phê duyệt'}{' '}
						<strong>{count} đề tài</strong> cùng lúc.
						{isApprove
							? ' Chủ nhiệm các đề tài sẽ nhận thông báo và có thể bắt đầu triển khai.'
							: ' Vui lòng nêu rõ lý do để các nhóm nghiên cứu có thể cải thiện.'}
					</p>
					<textarea
						ref={commentRef}
						className={styles.modalComment}
						aria-label={isApprove ? 'Nhận xét chung' : 'Lý do không phê duyệt'}
						aria-required={!isApprove}
						placeholder={
							isApprove
								? 'Nhận xét chung (không bắt buộc)...'
								: 'Lý do không phê duyệt áp dụng cho tất cả (bắt buộc)...'
						}
						value={comment}
						onChange={(e) => onChangeComment(e.target.value)}
						rows={3}
						maxLength={500}
					/>
				</div>
				<div className={styles.modalFooter}>
					<button
						type='button'
						className={styles.btnCancel}
						onClick={onClose}
					>
						Hủy
					</button>
					<button
						type='button'
						className={
							styles[
								isApprove ? 'btnConfirmApprove' : 'btnConfirmReject'
							] as string
						}
						onClick={onConfirm}
						disabled={loading || !canSubmit}
					>
						{loading ? (
							<>
								<span
									className={styles.spinner}
									style={isApprove ? {} : { borderTopColor: 'currentColor' }}
								/>{' '}
								Đang xử lý...
							</>
						) : isApprove ? (
							`Phê duyệt ${count} đề tài`
						) : (
							`Không phê duyệt ${count} đề tài`
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
