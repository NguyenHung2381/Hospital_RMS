import { TrashSvg, WarnSvg } from '@/assets/icons';
import { useState } from 'react';
import styles from '../pages/UserList.module.css';
import type { User } from '../types/user.type';

interface UserDeleteModalProps {
	user: User;
	onClose: () => void;
	onConfirm: () => Promise<void>;
}

export function UserDeleteModal({
	user,
	onClose,
	onConfirm,
}: UserDeleteModalProps) {
	const [loading, setLoading] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const handleConfirm = async () => {
		setLoading(true);
		setDeleteError(null);
		try {
			await onConfirm();
		} catch (err) {
			setDeleteError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
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
				className={`${styles.modal} ${styles.modalSm}`}
				role='alertdialog'
				aria-modal='true'
			>
				<div
					className={styles.modalBody}
					style={{ textAlign: 'center', gap: 16 }}
				>
					<div
						className={`${styles.modalHeaderIcon} ${styles.iconDanger}`}
						style={{ margin: '0 auto' }}
					>
						<WarnSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Xoá tài khoản?</div>
						<div
							className={styles.modalSubtitle}
							style={{ marginTop: 6 }}
						>
							Bạn chắc chắn muốn xoá tài khoản <strong>{user.full_name}</strong>{' '}
							({user.username})? Hành động này không thể hoàn tác.
						</div>
					</div>
				</div>
				<div className={styles.modalFooter}>
					{deleteError && (
						<span
							className={styles.fieldError}
							style={{ flex: 1 }}
						>
							{deleteError}
						</span>
					)}
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Huỷ bỏ
					</button>
					<button
						className={styles.btnDanger}
						onClick={() => void handleConfirm()}
						disabled={loading}
					>
						{loading ? (
							<>
								<span className={styles.spinner} /> Đang xoá...
							</>
						) : (
							<>
								<TrashSvg /> Xác nhận xoá
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
