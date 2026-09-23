import { TrashSvg, XSvg } from '@/assets/icons';
import type { Course } from '../types/course.type';
import styles from '../pages/Courses.module.css';

export function CourseDeleteModal({
	course,
	onClose,
	onConfirm,
	loading,
}: {
	course: Course;
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
						<div className={styles.modalTitle}>Xoá khóa học</div>
						<div className={styles.modalSub}>{course.name}</div>
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
						Bạn có chắc muốn xoá <strong>{course.name}</strong> khỏi hệ thống? Toàn bộ đăng
						ký, phân công giảng viên, lịch học và điểm danh của khóa này sẽ bị xoá theo. Thao
						tác này không thể hoàn tác.
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
