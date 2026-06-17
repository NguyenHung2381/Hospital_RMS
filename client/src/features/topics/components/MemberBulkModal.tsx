import { CheckSvg, XSvg } from '@/assets/icons';
import styles from '../pages/TopicMembers.module.css';

interface MemberBulkModalProps {
	action: 'approve' | 'reject';
	round: string;
	count: number;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}

export function MemberBulkModal({
	action,
	round,
	count,
	onClose,
	onConfirm,
	loading,
}: MemberBulkModalProps) {
	const isApprove = action === 'approve';
	return (
		<div
			className={styles.modalBackdrop}
			onClick={onClose}
		>
			<div
				className={`${styles.modal} ${styles.modalSm}`}
				onClick={(e) => e.stopPropagation()}
			>
				<div
					className={styles.modalBody}
					style={{ textAlign: 'center', gap: 16 }}
				>
					<div
						className={`${styles.modalHeaderIcon} ${isApprove ? '' : styles.iconDanger}`}
						style={{
							margin: '0 auto',
							background: isApprove ? 'var(--color-primary-pale)' : '#fde8e8',
							color: isApprove ? 'var(--color-primary-dark)' : '#b91c1c',
						}}
					>
						{isApprove ? <CheckSvg /> : <XSvg />}
					</div>
					<div>
						<div className={styles.modalTitle}>
							{isApprove ? 'Phê duyệt tất cả' : 'Từ chối tất cả'}
						</div>
						<div
							className={styles.modalSubtitle}
							style={{ marginTop: 6 }}
						>
							Bạn có chắc muốn {isApprove ? 'phê duyệt' : 'từ chối'}{' '}
							<strong>{count} đề tài đang chờ duyệt</strong> trong đợt{' '}
							<em>{round}</em>? Hành động này không thể hoàn tác.
						</div>
					</div>
				</div>
				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
						className={isApprove ? styles.btnConfirmApprove : styles.btnDanger}
						onClick={onConfirm}
						disabled={loading}
					>
						{loading ? (
							<>
								<span className={styles.spinner} /> Đang xử lý...
							</>
						) : isApprove ? (
							<>
								<CheckSvg /> Phê duyệt ({count})
							</>
						) : (
							<>
								<XSvg /> Từ chối ({count})
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
