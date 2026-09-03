import { CheckSvg, TrashSvg, XSvg } from '@/assets/icons';
import type { Seminar } from '../types/seminar.type';
import styles from '../pages/Seminar.module.css';

export function SeminarDeleteModal({
	seminar,
	loading,
	onClose,
	onConfirm,
}: {
	seminar: Seminar;
	loading: boolean;
	onClose: () => void;
	onConfirm: () => void;
}) {
	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalSm}`}>
				<div className={styles.modalHeader}>
					<TrashSvg />
					<div>
						<div className={styles.modalTitle}>Xoá hội thảo / hội nghị</div>
						<div className={styles.modalSub}>Hành động không thể hoàn tác</div>
					</div>
					<button className={styles.modalClose} onClick={onClose}>
						<XSvg />
					</button>
				</div>
				<div className={styles.modalBody}>
					<p>
						Xoá <strong>{seminar.title}</strong> cùng{' '}
						{seminar.participant_count ?? 0} người tham dự?
					</p>
					{!!seminar.cme_issued_count && (
						<p className={styles.fieldError}>
							Sự kiện đã cấp {seminar.cme_issued_count} số CME — cần thu hồi
							trước khi xoá.
						</p>
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
						{loading ? <span className={styles.spinner} /> : <CheckSvg />}
						Xoá
					</button>
				</div>
			</div>
		</div>
	);
}
