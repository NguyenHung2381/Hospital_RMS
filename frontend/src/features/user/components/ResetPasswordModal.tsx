import { KeySvg } from '@/assets/icons';
import { useState } from 'react';
import styles from '../pages/UserList.module.css';
import type { User } from '../types/user.type';

interface ResetPasswordModalProps {
	user: User;
	onClose: () => void;
	/** Trả về mật khẩu tạm do server sinh */
	onConfirm: () => Promise<string>;
}

export function ResetPasswordModal({
	user,
	onClose,
	onConfirm,
}: ResetPasswordModalProps) {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [tempPassword, setTempPassword] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const handleConfirm = async () => {
		setLoading(true);
		setError(null);
		try {
			setTempPassword(await onConfirm());
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
		} finally {
			setLoading(false);
		}
	};

	const copy = async () => {
		if (!tempPassword) return;
		try {
			await navigator.clipboard.writeText(tempPassword);
			setCopied(true);
		} catch {
			// Trình duyệt chặn clipboard (http thường) — người dùng tự bôi đen để chép
		}
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => {
				// Đã hiện mật khẩu tạm thì không đóng khi bấm nhầm ra ngoài
				if (e.target === e.currentTarget && !tempPassword) onClose();
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
					{tempPassword ? (
						<div>
							<div className={styles.modalTitle}>Mật khẩu tạm mới</div>
							<div
								className={styles.modalSubtitle}
								style={{ marginTop: 6 }}
							>
								Gửi mật khẩu này cho <strong>{user.full_name}</strong> (
								{user.username}). Mật khẩu chỉ hiển thị một lần; người dùng
								phải đổi mật khẩu ở lần đăng nhập tới.
							</div>
							<div
								style={{
									marginTop: 12,
									fontFamily: 'var(--font-mono)',
									fontSize: 18,
									letterSpacing: 1,
									background: '#f3f4f6',
									padding: '8px 12px',
									borderRadius: 6,
									userSelect: 'all',
								}}
							>
								{tempPassword}
							</div>
						</div>
					) : (
						<div>
							<div className={styles.modalTitle}>Đặt lại mật khẩu?</div>
							<div
								className={styles.modalSubtitle}
								style={{ marginTop: 6 }}
							>
								Hệ thống sẽ tạo mật khẩu tạm ngẫu nhiên cho{' '}
								<strong>{user.full_name}</strong> ({user.username}) và đăng
								xuất tài khoản khỏi mọi thiết bị.
							</div>
						</div>
					)}
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
					{tempPassword ? (
						<>
							<button
								className={styles.btnCancel}
								onClick={() => void copy()}
							>
								{copied ? 'Đã sao chép' : 'Sao chép'}
							</button>
							<button
								className={styles.btnConfirmBlue}
								onClick={onClose}
							>
								Đóng
							</button>
						</>
					) : (
						<>
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
						</>
					)}
				</div>
			</div>
		</div>
	);
}
