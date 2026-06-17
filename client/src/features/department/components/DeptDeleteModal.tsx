import { InfoSvg, TrashSvg, XSvg } from '@/assets/icons';
import type { Department } from '../types/department.type';
import styles from '../pages/Departments.module.css';

export function DeptDeleteModal({
	dept,
	onClose,
	onConfirm,
	loading,
}: {
	dept: Department;
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
						<div className={styles.modalTitle}>Xoá khoa phòng</div>
						<div className={styles.modalSub}>{dept.name}</div>
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
						Bạn có chắc muốn xoá <strong>{dept.name}</strong> ({dept.viet_tat})
						khỏi hệ thống?
					</p>
					{(dept.topic_count ?? 0) > 0 && (
						<div className={styles.warnBox}>
							<InfoSvg />
							<span>
								Có <strong>{dept.topic_count} đề tài</strong> đang liên kết với
								khoa phòng này.
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
