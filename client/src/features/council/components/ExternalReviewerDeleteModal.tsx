import { TrashSvg, XSvg } from '@/assets/icons';
import type { ExternalReviewer } from '../types/council.type';
import styles from '../pages/Council.module.css';

export function ExternalReviewerDeleteModal({
	reviewer,
	onClose,
	onConfirm,
	loading,
}: {
	reviewer: ExternalReviewer;
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
						<div className={styles.modalTitle}>Xoá người ngoài viện</div>
						<div className={styles.modalSub}>{reviewer.full_name}</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>
				<div className={styles.modalBody}>
					<p className={styles.deleteDesc}>
						Bạn có chắc muốn xoá <strong>{reviewer.full_name}</strong> khỏi danh
						sách? Nếu người này đã từng ngồi ghế hội đồng, hồ sơ sẽ được vô hiệu
						hoá thay vì xoá hẳn để giữ lịch sử.
					</p>
				</div>
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
						{loading ? <span className={styles.spinner} /> : <TrashSvg />}
						Xác nhận xoá
					</button>
				</div>
			</div>
		</div>
	);
}
