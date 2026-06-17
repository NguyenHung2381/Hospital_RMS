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
	onConfirm: () => Promise<void>;
}) {
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
						onClick={handleConfirm}
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
