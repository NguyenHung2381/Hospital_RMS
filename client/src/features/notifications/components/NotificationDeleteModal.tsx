import { TrashSvg, XSvg } from '@/assets/icons';
import type { AdminNotification } from '../api/notificationApi';
import styles from '../pages/AdminNotifications.module.css';

export function NotificationDeleteModal({
	notif,
	onClose,
	onConfirm,
	loading,
}: {
	notif: AdminNotification;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalSm}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIconDanger}>
						<TrashSvg />
					</div>
					<div>
						<div className={styles.cardTitle}>Xoá thông báo</div>
						<div className={styles.modalSub}>{notif.title}</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>
				<p className={styles.deleteDesc}>
					Xoá lượt gửi <strong>"{notif.title}"</strong> khỏi hộp thư của{' '}
					<strong>{notif.recipient_count} người nhận</strong>? Thao tác này không
					thể hoàn tác.
				</p>
				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						Huỷ
					</button>
					<button
						className={styles.btnDanger}
						onClick={onConfirm}
						disabled={loading}
					>
						{loading ? (
							<span className={styles.spinnerSm} />
						) : (
							<TrashSvg style={{ width: 15, height: 15 }} />
						)}
						Xác nhận xoá
					</button>
				</div>
			</div>
		</div>
	);
}
