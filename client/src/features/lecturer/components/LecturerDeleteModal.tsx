import { TrashSvg, XSvg } from '@/assets/icons';
import type { Lecturer } from '../types/lecturer.type';
import styles from '../pages/Lecturers.module.css';

export function LecturerDeleteModal({
	lecturer,
	onClose,
	onConfirm,
	loading,
}: {
	lecturer: Lecturer;
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
						<div className={styles.modalTitle}>Xoá giảng viên</div>
						<div className={styles.modalSub}>{lecturer.full_name}</div>
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
						Bạn có chắc muốn xoá <strong>{lecturer.full_name}</strong> khỏi hệ thống? Nếu
						giảng viên đã từng được phân công giảng dạy, hệ thống sẽ chỉ vô hiệu hoá thay vì
						xoá hẳn.
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
