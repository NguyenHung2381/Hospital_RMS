import { InfoSvg, TrashSvg, XSvg } from '@/assets/icons';
import type { Council } from '../types/council.type';
import styles from '../pages/Council.module.css';

export function CouncilDeleteModal({
	council,
	onClose,
	onConfirm,
	loading,
}: {
	council: Council;
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
						<div className={styles.modalTitle}>Xoá hội đồng</div>
						<div className={styles.modalSub}>{council.name}</div>
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
						Bạn có chắc muốn xoá <strong>{council.name}</strong> khỏi hệ thống?
					</p>
					{(council.topic_count ?? 0) > 0 && (
						<div className={styles.warnBox}>
							<InfoSvg />
							<span>
								Có <strong>{council.topic_count} đề tài</strong> đang gán cho
								hội đồng này — sẽ tự động bỏ gán, và toàn bộ thành viên hội đồng
								sẽ bị xoá.
							</span>
						</div>
					)}
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
						{loading ? (
							<span className={`${styles.spinner} ${styles.spinnerDark}`} />
						) : (
							<TrashSvg />
						)}
						Xác nhận xoá
					</button>
				</div>
			</div>
		</div>
	);
}
