import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../../../layouts/AuthLayout';
import { checkPassword, PASSWORD_HINT } from '../../../shared/utils/password';
import { forgotPasswordApi, resetPasswordApi } from '../api/authApi';
import styles from './Login.module.css';
import { AlertSvg } from '@/assets/icons';

// Bước 1: nhập tên đăng nhập hoặc email → server gửi OTP tới email của tài khoản.
// Bước 2: nhập OTP + mật khẩu mới.
export default function ForgotPassword() {
	const navigate = useNavigate();
	// Link trong email (?u=tên đăng nhập) đi thẳng tới bước nhập OTP
	const linkedUser = useSearchParams()[0].get('u') ?? '';
	const [step, setStep] = useState<1 | 2>(linkedUser ? 2 : 1);
	const [username, setUsername] = useState(linkedUser);
	const [code, setCode] = useState('');
	const [pwd, setPwd] = useState('');
	const [confirm, setConfirm] = useState('');
	const [info, setInfo] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const run = async (fn: () => Promise<void>) => {
		setError(null);
		setBusy(true);
		try {
			await fn();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Có lỗi xảy ra, vui lòng thử lại.');
		} finally {
			setBusy(false);
		}
	};

	const sendOtp = (e?: React.FormEvent) => {
		e?.preventDefault();
		if (!username.trim()) return setError('Vui lòng nhập tên đăng nhập hoặc email.');
		void run(async () => {
			setInfo(await forgotPasswordApi(username.trim()));
			setStep(2);
		});
	};

	const submitReset = (e: React.FormEvent) => {
		e.preventDefault();
		if (!/^\d{6}$/.test(code)) return setError('Mã OTP gồm 6 chữ số.');
		const policyError = checkPassword(pwd, username.trim());
		if (policyError) return setError(policyError);
		if (pwd !== confirm) return setError('Mật khẩu xác nhận không khớp.');
		void run(async () => {
			await resetPasswordApi(username.trim(), code, pwd);
			navigate('/login', { replace: true });
		});
	};

	const input = (id: string, label: string, value: string, set: (v: string) => void, extra = {}) => (
		<div className={styles.inputGroup}>
			<label htmlFor={id} className={styles.inputLabel}>{label}</label>
			<div className={styles.inputWrapper}>
				<input
					id={id}
					className={styles.inputField}
					value={value}
					onChange={(e) => { set(e.target.value); setError(null); }}
					disabled={busy}
					{...extra}
				/>
			</div>
		</div>
	);

	return (
		<AuthLayout>
			<div className={styles.loginHeader}>
				<h2 className={styles.loginTitle}>Quên <span>mật khẩu</span></h2>
				<p className={styles.loginSubtitle}>
					{step === 1
						? 'Nhập tên đăng nhập hoặc email, mã OTP sẽ được gửi tới email của tài khoản.'
						: 'Nhập mã OTP trong email và đặt mật khẩu mới.'}
				</p>
			</div>
			<div className={styles.loginCard}>
				{error && (
					<div className={`${styles.alertBox} ${styles.alertError}`} role='alert'>
						<AlertSvg width={16} height={16} />
						<span>{error}</span>
					</div>
				)}
				{step === 2 && info && <p className={styles.loginSubtitle}>{info}</p>}
				<form onSubmit={step === 1 ? sendOtp : submitReset} className={styles.loginForm} noValidate>
					{step === 1 ? (
						input('username', 'Tên đăng nhập hoặc email', username, setUsername, { autoFocus: true, autoComplete: 'username', placeholder: 'Email hoặc tài khoản' })
					) : (
						<>
							{input('otp', 'Mã OTP (6 số)', code, setCode, { inputMode: 'numeric', maxLength: 6, autoComplete: 'one-time-code', autoFocus: true })}
							{input('pwd', 'Mật khẩu mới', pwd, setPwd, { type: 'password', autoComplete: 'new-password' })}
							{input('confirm', 'Nhập lại mật khẩu mới', confirm, setConfirm, { type: 'password', autoComplete: 'new-password' })}
							<p className={styles.loginSubtitle} style={{ margin: 0 }}>{PASSWORD_HINT}; không chứa tên đăng nhập.</p>
						</>
					)}
					<button type='submit' className={styles.submitBtn} disabled={busy}>
						{busy ? 'Đang xử lý...' : step === 1 ? 'Gửi mã OTP' : 'Đặt lại mật khẩu'}
					</button>
					{step === 2 && (
						<button type='button' className={styles.forgotLink} disabled={busy} onClick={() => sendOtp()}
							style={{ background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'center' }}>
							Gửi lại mã
						</button>
					)}
					<Link to='/login' className={styles.forgotLink} style={{ alignSelf: 'center' }}>
						Quay lại đăng nhập
					</Link>
				</form>
			</div>
		</AuthLayout>
	);
}
