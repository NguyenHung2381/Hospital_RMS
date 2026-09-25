import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCode } from 'antd';
import { defaultPath } from '../../../app/router/authHelpers';
import AuthLayout from '../../../layouts/AuthLayout';
import { apiClient } from '../../../shared/api/axios';
import { getStoredUser, updateStoredUser, type StoredUser } from '../../../shared/utils/storage';
import { logout, type TwoFaSetup } from '../api/authApi';
import styles from './Login.module.css';
import { AlertSvg, KeySvg } from '@/assets/icons';

// Bật xác thực 2 lớp cho tài khoản quản trị (backend permissions/twoFactorPolicy.js):
//   - còn trong hạn chuyển tiếp: được bấm "Để sau";
//   - quá hạn: server chặn mọi API khác nên chỉ còn màn này (hoặc đăng xuất).
// Dùng apiClient (tự làm mới access token khi hết hạn).
export default function SetupTwoFactor() {
	const navigate = useNavigate();
	const user = getStoredUser<StoredUser>();
	const required = user?.twofa_state === 'required';
	const deadline = user?.twofa_deadline ? new Date(user.twofa_deadline) : null;

	const [setup, setSetup] = useState<TwoFaSetup | null>(null);
	const [code, setCode] = useState('');
	const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	// Mỗi lần gọi /2fa/setup sinh secret MỚI trên server — StrictMode (dev) chạy
	// effect 2 lần sẽ làm QR hiển thị lệch secret đã lưu. Chỉ gọi đúng 1 lần.
	const started = useRef(false);
	useEffect(() => {
		if (started.current) return;
		started.current = true;
		apiClient
			.post<TwoFaSetup>('/auth/2fa/setup', {})
			.then(setSetup)
			.catch((err: unknown) => setError(err instanceof Error ? err.message : 'Không khởi tạo được 2FA'));
	}, []);

	const handleConfirm = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!/^\d{6}$/.test(code)) return setError('Nhập mã 6 số đang hiện trong ứng dụng xác thực');
		setSaving(true);
		setError(null);
		try {
			const data = await apiClient.post<{ backup_codes: string[] }>('/auth/2fa/verify-setup', { code });
			setBackupCodes(data.backup_codes ?? []);
			updateStoredUser({ twofa_state: null, twofa_deadline: null });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Mã xác thực không đúng');
		} finally {
			setSaving(false);
		}
	};

	const handleLater = () => navigate(defaultPath(), { replace: true });
	const handleLogout = async () => {
		await logout();
		navigate('/login', { replace: true });
	};

	return (
		<AuthLayout>
			<div className={styles.loginHeader}>
				<h2 className={styles.loginTitle}>
					Bật xác thực <span>2 lớp</span>
				</h2>
				<p className={styles.loginSubtitle}>
					{required
						? 'Tài khoản quản trị bắt buộc bật xác thực 2 lớp. Hệ thống tạm khoá các chức năng khác cho tới khi bạn bật xong.'
						: `Tài khoản quản trị phải bật xác thực 2 lớp${deadline ? ` trước ${deadline.toLocaleDateString('vi-VN')}` : ''}.`}
				</p>
			</div>

			<div className={styles.loginCard}>
				{error && (
					<div className={`${styles.alertBox} ${styles.alertError}`} role='alert'>
						<AlertSvg width={16} height={16} />
						<span>{error}</span>
					</div>
				)}

				{backupCodes ? (
					<div className={styles.loginForm}>
						<p className={styles.loginSubtitle} style={{ margin: 0 }}>
							Đã bật xác thực 2 lớp. Lưu các <strong>mã khôi phục</strong> dưới đây ở nơi an toàn — dùng
							khi mất điện thoại, mỗi mã 1 lần. Các mã chỉ hiển thị lần này.
						</p>
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: 'repeat(2, 1fr)',
								gap: 6,
								fontFamily: 'monospace',
								fontSize: 16,
								userSelect: 'all',
							}}
						>
							{backupCodes.map((c) => (
								<span key={c}>{c}</span>
							))}
						</div>
						<button
							type='button'
							className={styles.submitBtn}
							onClick={() => navigate(defaultPath(), { replace: true })}
						>
							Tôi đã lưu mã, tiếp tục
						</button>
					</div>
				) : (
					<form onSubmit={handleConfirm} className={styles.loginForm} noValidate>
						<p className={styles.loginSubtitle} style={{ margin: 0 }}>
							1. Quét mã QR bằng ứng dụng xác thực (Google Authenticator, Microsoft Authenticator, Authy...).
							<br />
							2. Nhập mã 6 số đang hiện trong ứng dụng.
						</p>
						<div style={{ display: 'flex', justifyContent: 'center' }}>
							{setup ? <QRCode value={setup.otpauth_uri} /> : <span className={styles.btnSpinner} />}
						</div>
						<div className={styles.inputGroup}>
							<label htmlFor='code' className={styles.inputLabel}>
								Mã xác thực <span className={styles.inputRequired}>*</span>
							</label>
							<div className={styles.inputWrapper}>
								<span className={styles.inputIcon}>
									<KeySvg width={16} height={16} />
								</span>
								<input
									id='code'
									className={styles.inputField}
									inputMode='numeric'
									maxLength={6}
									placeholder='000000'
									autoComplete='one-time-code'
									value={code}
									onChange={(e) => {
										setCode(e.target.value.replace(/\D/g, ''));
										if (error) setError(null);
									}}
									disabled={saving || !setup}
								/>
							</div>
						</div>
						<button type='submit' className={styles.submitBtn} disabled={saving || !setup}>
							{saving ? (
								<>
									<span className={styles.btnSpinner} />
									Đang xác nhận...
								</>
							) : (
								'Xác nhận và bật 2FA'
							)}
						</button>
						<button
							type='button'
							className={styles.forgotLink}
							onClick={required ? () => void handleLogout() : handleLater}
							style={{ background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'center' }}
						>
							{required ? 'Đăng xuất' : 'Để sau'}
						</button>
					</form>
				)}
			</div>
		</AuthLayout>
	);
}
