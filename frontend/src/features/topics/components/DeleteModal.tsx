import { useState } from 'react';
import styles from '../pages/Topic.module.css';
import type { Topic } from '../types/topic.type';
import { AlertSvg as IcAlert, WarnSvg as IcWarn } from '@/assets/icons';

export function DeleteModal({
	topic,
	onClose,
	onConfirm,
}: {
	topic: Topic;
	onClose: () => void;
	onConfirm: () => Promise<void>;
}) {
	const [loading, setLoading] = useState(false);
	const [deleteError, setDeleteError] = useState('');

	const go = async () => {
		setLoading(true);
		setDeleteError('');
		try {
			await onConfirm();
		} catch (err: unknown) {
			setDeleteError(err instanceof Error ? err.message : 'Lỗi xoá đề tài');
			setLoading(false);
		}
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className={`${styles.modal} ${styles.confirmModal}`}
				role='alertdialog'
				aria-modal='true'
			>
				<div className={styles.modalBody}>
					<div className={styles.confirmIcon}>
						<IcWarn />
					</div>
					<h2 className={styles.confirmTitle}>Xác nhận xóa đề tài?</h2>
					<p className={styles.confirmDesc}>
						Bạn sắp thực hiện xóa đề tài{' '}
						<strong>
							"{topic.title.slice(0, 60)}
							{topic.title.length > 60 ? '...' : ''}"
						</strong>
						. Toàn bộ thông tin thành viên, tiến độ và tài liệu liên quan cũng sẽ bị xóa bỏ.
						Hành động này không thể hoàn tác.
					</p>
				</div>
				<div className={styles.modalFooter}>
					{deleteError && (
						<span
							style={{ fontSize: 12, color: 'var(--color-red-600)', flex: 1 }}
						>
							<IcAlert /> {deleteError}
						</span>
					)}
					<button
						className={styles.btnSecondary}
						onClick={onClose}
					>
						Hủy bỏ
					</button>
					<button
						className={styles.btnDanger}
						onClick={go}
						disabled={loading}
					>
						{loading ? (
							<>
								<span
									className={styles.spinner}
									style={{ borderTopColor: '#791F1F' }}
								/>
								Đang xóa...
							</>
						) : (
							'Xác nhận xóa'
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
