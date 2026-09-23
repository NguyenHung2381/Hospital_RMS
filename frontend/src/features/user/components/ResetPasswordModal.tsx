import { KeySvg } from '@/assets/icons';
import { useState } from 'react';
import styles from '../pages/UserList.module.css';
import type { User } from '../types/user.type';

interface ResetPasswordModalProps {
	user: User;
	onClose: () => void;
	onConfirm: () => Promise<void>;
}

export function ResetPasswordModal({
	user,
	onClose,
	onConfirm,
}: ResetPasswordModalProps) {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleConfirm = async () => {
		setLoading(true);
		setError(null);
		try {
			await onConfirm();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
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
						className={styles.modalHeaderIcon}
						style={{
							margin: '0 auto',
							background: '#fff7ed',
							color: '#b45309',
						}}
					>
						<KeySvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Đặt lại mật khẩu?</div>
						<div
							className={styles.modalSubtitle}
							style={{ marginTop: 6 }}
						>
							Mật khẩu của <strong>{user.full_name}</strong> ({user.username})
							sẽ được đặt lại về{' '}
							<strong
								style={{
									fontFamily: 'monospace',
									background: '#f3f4f6',
									padding: '1px 6px',
									borderRadius: 4,
								}}
							>
								123456
							</strong>
							.
						</div>
					</div>
				</div>
				<div className={styles.modalFooter}>
					{error && (
						<span
							className={styles.fieldError}
							style={{ flex: 1 }}
						>
							{error}
						</span>
					)}
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Huỷ bỏ
					</button>
					<button
						className={styles.btnConfirmBlue}
						onClick={() => void handleConfirm()}
						disabled={loading}
						style={{ background: '#b45309', borderColor: '#b45309' }}
					>
						{loading ? (
							<>
								<span className={styles.spinner} /> Đang đặt lại...
							</>
						) : (
							<>
								<KeySvg /> Xác nhận
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
