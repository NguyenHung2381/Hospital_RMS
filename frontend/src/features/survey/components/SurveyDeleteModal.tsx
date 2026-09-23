import { TrashSvg, XSvg } from '@/assets/icons';
import type { Survey } from '../types/survey.type';
import styles from '../pages/Survey.module.css';

export function SurveyDeleteModal({
	item,
	onClose,
	onConfirm,
	loading,
}: {
	item: Survey;
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
						<div className={styles.modalTitle}>Xoá khảo sát</div>
						<div className={styles.modalSub}>{item.title}</div>
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
						Bạn có chắc muốn xoá <strong>{item.title}</strong>? Toàn bộ câu hỏi và phản hồi đã
						nhận ({item.response_count}) cũng sẽ bị xoá. Thao tác này không thể hoàn tác.
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
