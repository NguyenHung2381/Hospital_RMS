import { useState } from 'react';
import { KeySvg, TrashSvg, WarnSvg } from '@/assets/icons';
import type { User } from '../../user/types/user.type';
import styles from '../pages/DepartmentAccounts.module.css';

export function DeptAccountsDeleteModal({
	user,
	onClose,
	onConfirm,
}: {
	user: User;
	onClose: () => void;
	onConfirm: () => Promise<void>;
}) {
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
						onClick={handleConfirm}
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

export function DeptAccountsResetPasswordModal({
	user,
	onClose,
	onConfirm,
}: {
	user: User;
	onClose: () => void;
	/** Trả về mật khẩu tạm do server sinh */
	onConfirm: () => Promise<string>;
}) {
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
