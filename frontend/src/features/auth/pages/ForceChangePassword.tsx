import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { blockingSetupPath, defaultPath } from '../../../app/router/authHelpers';
import AuthLayout from '../../../layouts/AuthLayout';
import { apiClient } from '../../../shared/api/axios';
import { checkPassword, PASSWORD_HINT } from '../../../shared/utils/password';
import {
	getStoredUser,
	replaceAccessToken,
	updateStoredUser,
	type StoredUser,
} from '../../../shared/utils/storage';
import { logout } from '../api/authApi';
import styles from './Login.module.css';
import { AlertSvg, LockSvg } from '@/assets/icons';

type Field = 'oldPwd' | 'newPwd' | 'confirmPwd';

const FIELDS: { key: Field; label: string; autoComplete: string }[] = [
	{ key: 'oldPwd', label: 'Mật khẩu hiện tại (mật khẩu tạm được cấp)', autoComplete: 'current-password' },
	{ key: 'newPwd', label: 'Mật khẩu mới', autoComplete: 'new-password' },
	{ key: 'confirmPwd', label: 'Nhập lại mật khẩu mới', autoComplete: 'new-password' },
];

// Tài khoản đang dùng mật khẩu do quản trị / khoa cấp (users.must_change_password)
// phải đặt mật khẩu riêng trước khi dùng hệ thống — server chặn mọi API khác.
export default function ForceChangePassword() {
	const navigate = useNavigate();
	const user = getStoredUser<StoredUser>();
	const [form, setForm] = useState<Record<Field, string>>({ oldPwd: '', newPwd: '', confirmPwd: '' });
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const set = (key: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
		setForm((prev) => ({ ...prev, [key]: e.target.value }));
		if (error) setError(null);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.oldPwd) return setError('Vui lòng nhập mật khẩu hiện tại.');
		const policyError = checkPassword(form.newPwd, user?.username);
		if (policyError) return setError(policyError);
		if (form.newPwd === form.oldPwd) return setError('Mật khẩu mới phải khác mật khẩu hiện tại.');
		if (form.newPwd !== form.confirmPwd) return setError('Mật khẩu xác nhận không khớp.');

		setSaving(true);
		try {
			// Server thu hồi mọi phiên rồi trả cặp token mới cho phiên này
			const tokens = await apiClient.post<{ access_token: string } | null>(
				'/auth/change-password',
				{ old_password: form.oldPwd, new_password: form.newPwd },
			);
			if (tokens?.access_token) replaceAccessToken(tokens.access_token);
			updateStoredUser({ must_change_password: false });
			// Còn phải bật 2FA (tài khoản quản trị quá hạn) thì sang màn đó
			navigate(blockingSetupPath() ?? defaultPath(), { replace: true });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Có lỗi xảy ra, vui lòng thử lại.');
			setSaving(false);
		}
	};

	const handleLogout = async () => {
		await logout();
		navigate('/login', { replace: true });
	};

	return (
		<AuthLayout>
			<div className={styles.loginHeader}>
				<h2 className={styles.loginTitle}>
					Đổi mật khẩu <span>lần đầu</span>
				</h2>
				<p className={styles.loginSubtitle}>
					{user?.full_name ? `${user.full_name}, t` : 'T'}ài khoản của bạn đang dùng mật khẩu tạm
					được cấp. Vui lòng đặt mật khẩu riêng để tiếp tục.
				</p>
			</div>

			<div className={styles.loginCard}>
				{error && (
					<div className={`${styles.alertBox} ${styles.alertError}`} role='alert'>
						<AlertSvg width={16} height={16} />
						<span>{error}</span>
					</div>
				)}

				<form onSubmit={handleSubmit} className={styles.loginForm} noValidate>
					{FIELDS.map(({ key, label, autoComplete }) => (
						<div key={key} className={styles.inputGroup}>
							<label htmlFor={key} className={styles.inputLabel}>
								{label} <span className={styles.inputRequired}>*</span>
							</label>
							<div className={styles.inputWrapper}>
								<span className={styles.inputIcon}>
									<LockSvg width={16} height={16} />
								</span>
								<input
									id={key}
									type='password'
									className={styles.inputField}
									value={form[key]}
									onChange={set(key)}
									autoComplete={autoComplete}
									autoFocus={key === 'oldPwd'}
									disabled={saving}
								/>
							</div>
						</div>
					))}
					<p className={styles.loginSubtitle} style={{ margin: 0 }}>
						{PASSWORD_HINT}; không chứa tên đăng nhập.
					</p>

					<button type='submit' className={styles.submitBtn} disabled={saving}>
						{saving ? (
							<>
								<span className={styles.btnSpinner} />
								Đang lưu...
							</>
						) : (
							'Đổi mật khẩu và tiếp tục'
						)}
					</button>
					<button
						type='button'
						className={styles.forgotLink}
						onClick={handleLogout}
						style={{ background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'center' }}
					>
						Đăng xuất
					</button>
				</form>
			</div>
		</AuthLayout>
	);
}
