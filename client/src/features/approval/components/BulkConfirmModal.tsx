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
				className={styles.modal}
				role='alertdialog'
				aria-modal='true'
			>
				<div className={styles.modalBody}>
					<div
						className={`${styles.modalIcon} ${styles[isApprove ? 'iconApprove' : 'iconReject']}`}
					>
						{isApprove ? <CheckCircleSvg /> : <XCircleSvg />}
					</div>
					<h2 className={styles.modalTitle}>
						{isApprove ? 'Phê duyệt' : 'Từ chối'} {count} đề tài đã chọn
					</h2>
					<p className={styles.modalDesc}>
						Thao tác này sẽ {isApprove ? 'phê duyệt' : 'từ chối'}{' '}
						<strong>{count} đề tài</strong> cùng lúc.
						{isApprove
							? ' Chủ nhiệm các đề tài sẽ nhận thông báo và có thể bắt đầu triển khai.'
							: ' Vui lòng nêu rõ lý do để các nhóm nghiên cứu có thể cải thiện.'}
					</p>
					<textarea
						className={styles.modalComment}
						placeholder={
							isApprove
								? 'Nhận xét chung (không bắt buộc)...'
								: 'Lý do từ chối áp dụng cho tất cả (bắt buộc)...'
						}
						value={comment}
						onChange={(e) => onChangeComment(e.target.value)}
						rows={3}
						maxLength={500}
					/>
				</div>
				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
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
							`Từ chối ${count} đề tài`
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
