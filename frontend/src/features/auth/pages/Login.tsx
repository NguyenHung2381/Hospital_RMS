import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
	canAccessAdminPanel,
	FORCE_PASSWORD_PATH,
	TWO_FACTOR_SETUP_PATH,
} from '../../../app/router/authHelpers';
import AuthLayout from '../../../layouts/AuthLayout';
import { saveAuth } from '../../../shared/utils/storage';
import { getMyProgress } from '../../council/api/councilApi';
import {
	LoginLockedError,
	loginApi,
	verify2FAApi,
	type LoginResponse,
} from '../api/authApi';
import type { FormErrors, LoginForm } from '../types/auth.type';
import styles from './Login.module.css';
import {
	AlertSvg,
	ClipboardCheckSvg,
	EyeOffSvg,
	EyeSvg,
	LockSvg,
	MessageSvg,
	ShieldSvg,
	UserSvg,
} from '@/assets/icons';

// === ICONS ===
const Icon = {
	User: () => (
		<UserSvg
			width={18}
			height={18}
		/>
	),
	Lock: () => (
		<LockSvg
			width={18}
			height={18}
		/>
	),
	Eye: () => (
		<EyeSvg
			width={18}
			height={18}
		/>
	),
	EyeOff: () => (
		<EyeOffSvg
			width={18}
			height={18}
		/>
	),
	Alert: () => (
		<AlertSvg
			width={16}
			height={16}
		/>
	),
	Shield: () => (
		<ShieldSvg
			width={14}
			height={14}
		/>
	),
	Support: () => (
		<MessageSvg
			width={18}
			height={18}
		/>
	),
};

// === COMPONENT ===
export default function Login() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const [form, setForm] = useState<LoginForm>({
		username: '',
		password: '',
		remember: false,
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [showPassword, setShowPassword] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	// Server yêu cầu giải thử thách chống dò mật khẩu (xem loginApi)
	const [isVerifying, setIsVerifying] = useState(false);
	const [apiError, setApiError] = useState<string | null>(null);
	// Popup chọn nơi vào cho tài khoản có ghế trong hội đồng chấm đề tài
	const [councilPrompt, setCouncilPrompt] = useState<{
		dest: string;
		count: number;
	} | null>(null);
	// Bước 2 của đăng nhập cho tài khoản đã bật 2FA — chỉ set khi backend trả
	// requires_2fa=true ở bước 1 (mật khẩu đúng).
	const [preAuthToken, setPreAuthToken] = useState<string | null>(null);
	const [otpCode, setOtpCode] = useState('');
	const [otpError, setOtpError] = useState<string | null>(null);
	// Đăng nhập bị khoá tạm: mốc hết khoá (ms) + số giây còn lại để đếm ngược.
	const [lockedUntil, setLockedUntil] = useState<number | null>(null);
	const [secondsLeft, setSecondsLeft] = useState(0);

	useEffect(() => {
		if (!lockedUntil) return;
		const tick = () => {
			const left = Math.ceil((lockedUntil - Date.now()) / 1000);
			if (left <= 0) {
				setLockedUntil(null);
				setSecondsLeft(0);
				setApiError(null);
			} else {
				setSecondsLeft(left);
			}
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, [lockedUntil]);

	const isLocked = lockedUntil !== null && secondsLeft > 0;
	const countdown = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;

	// Validation
	const validate = useCallback((): boolean => {
		const newErrors: FormErrors = {};

		if (!form.username.trim()) {
			newErrors.username = 'Vui lòng nhập tên đăng nhập hoặc email';
		} else if (form.username.trim().length < 3) {
			newErrors.username = 'Tên đăng nhập ít nhất 3 ký tự';
		}

		if (!form.password) {
			newErrors.password = 'Vui lòng nhập mật khẩu';
		} else if (form.password.length < 5) {
			newErrors.password = 'Mật khẩu ít nhất 5 ký tự';
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	}, [form]);

	// Handle input change
	const handleChange =
		(field: keyof LoginForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
			const value =
				e.target.type === 'checkbox' ? e.target.checked : e.target.value;
			setForm((prev) => ({ ...prev, [field]: value }));
			// Xóa lỗi khi người dùng bắt đầu nhập
			if (errors[field as keyof FormErrors]) {
				setErrors((prev) => ({ ...prev, [field]: undefined }));
			}
			// Giữ thông báo khoá cho tới khi hết giờ đếm ngược.
			if (apiError && !isLocked) setApiError(null);
		};

	// Dùng chung cho cả 2 đường: đăng nhập thường (không 2FA) và sau khi xác
	// minh mã OTP thành công (bước 2 của tài khoản đã bật 2FA).
	const completeLogin = async (data: LoginResponse) => {
		saveAuth(data, form.remember);
		// Mật khẩu tạm do quản trị / khoa cấp: đổi trước, mọi API khác đang bị chặn
		if (data.user.must_change_password) {
			navigate(FORCE_PASSWORD_PATH, { replace: true });
			return;
		}
		// Tài khoản quản trị quá hạn bật 2FA — các chức năng khác đang bị chặn
		if (data.user.twofa_state === 'required') {
			navigate(TWO_FACTOR_SETUP_PATH, { replace: true });
			return;
		}
		const from = searchParams.get('from');
		const dest = from || (canAccessAdminPanel(data.user) ? '/admin' : '/user');

		// Chỉ hỏi khi vào thẳng cổng người dùng (không phải deep-link cụ thể)
		if (!from && !canAccessAdminPanel(data.user)) {
			try {
				const progress = await getMyProgress();
				if (progress.length > 0) {
					setCouncilPrompt({ dest, count: progress.length });
					return;
				}
			} catch {
				// Không chặn đăng nhập nếu kiểm tra ghế hội đồng thất bại
			}
		}
		navigate(dest);
	};

	// Handle submit
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (isLocked || !validate()) return;

		setIsLoading(true);
		setApiError(null);

		try {
			const data = await loginApi(form.username, form.password, form.remember, () =>
				setIsVerifying(true),
			);
			if ('requires_2fa' in data) {
				setPreAuthToken(data.pre_auth_token);
				return;
			}
			await completeLogin(data);
		} catch (err) {
			if (err instanceof LoginLockedError) {
				setLockedUntil(Date.now() + err.retryAfterSeconds * 1000);
				setSecondsLeft(err.retryAfterSeconds);
			}
			setApiError(
				err instanceof Error ? err.message : 'Có lỗi xảy ra, vui lòng thử lại',
			);
		} finally {
			setIsLoading(false);
			setIsVerifying(false);
		}
	};

	const handleVerify2FA = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!preAuthToken || !otpCode.trim()) return;
		setIsLoading(true);
		setOtpError(null);
		try {
			const data = await verify2FAApi(form.username, preAuthToken, otpCode.trim());
			await completeLogin(data);
		} catch (err) {
			setOtpError(err instanceof Error ? err.message : 'Mã xác thực không đúng');
		} finally {
			setIsLoading(false);
		}
	};

	if (preAuthToken) {
		return (
			<AuthLayout>
				<div className={styles.loginHeader}>
					<div className={styles.loginTag}>
						<Icon.Shield />
						Xác thực 2 lớp
					</div>
					<h2 className={styles.loginTitle}>
						Nhập mã <span>xác thực</span>
					</h2>
					<p className={styles.loginSubtitle}>
						Mở ứng dụng xác thực (Google Authenticator...) và nhập mã 6 số hiện tại
					</p>
				</div>

				<div className={styles.loginCard}>
					{otpError && (
						<div
							className={`${styles.alertBox} ${styles.alertError}`}
							role='alert'
						>
							<Icon.Alert />
							<span>{otpError}</span>
						</div>
					)}

					<form
						onSubmit={handleVerify2FA}
						className={styles.loginForm}
						noValidate
					>
						<div className={styles.inputGroup}>
							<label
								htmlFor='otp'
								className={styles.inputLabel}
							>
								Mã xác thực <span className={styles.inputRequired}>*</span>
							</label>
							<div className={styles.inputWrapper}>
								<span className={styles.inputIcon}>
									<Icon.Lock />
								</span>
								<input
									id='otp'
									type='text'
									// Mã 6 số từ ứng dụng xác thực, hoặc mã khôi phục dạng xxxx-xxxx
									maxLength={9}
									className={styles.inputField}
									placeholder='Mã 6 số hoặc mã khôi phục'
									value={otpCode}
									onChange={(e) => {
										setOtpCode(e.target.value.replace(/[^0-9a-zA-Z-]/g, ''));
										if (otpError) setOtpError(null);
									}}
									autoComplete='one-time-code'
									autoFocus
									disabled={isLoading}
								/>
							</div>
						</div>

						<button
							type='submit'
							className={styles.submitBtn}
							disabled={isLoading || otpCode.trim().length === 0}
						>
							{isLoading ? (
								<>
									<span className={styles.btnSpinner} />
									Đang xác thực...
								</>
							) : (
								'Xác nhận'
							)}
						</button>

						<button
							type='button'
							className={styles.backLink}
							onClick={() => {
								setPreAuthToken(null);
								setOtpCode('');
								setOtpError(null);
							}}
							disabled={isLoading}
						>
							← Quay lại đăng nhập
						</button>
					</form>
				</div>
			</AuthLayout>
		);
	}

	return (
		<AuthLayout>
			{/* Header */}
			<div className={styles.loginHeader}>
				<h2 className={styles.loginTitle}>
					Đăng nhập <span>NCKH & Đào tạo</span>
				</h2>
			</div>

			{/* Form card */}
			<div className={styles.loginCard}>
				{/* Thông báo lỗi API */}
				{apiError && (
					<div
						className={`${styles.alertBox} ${styles.alertError}`}
						role='alert'
					>
						<Icon.Alert />
						<span>
							{apiError}
							{isLocked && (
								<>
									{' '}
									Còn lại <strong>{countdown}</strong>.
								</>
							)}
						</span>
					</div>
				)}

				<form
					onSubmit={handleSubmit}
					className={styles.loginForm}
					noValidate
				>
					{/* Tên đăng nhập */}
					<div className={styles.inputGroup}>
						<label
							htmlFor='username'
							className={styles.inputLabel}
						>
							Tên đăng nhập hoặc email <span className={styles.inputRequired}>*</span>
						</label>
						<div className={styles.inputWrapper}>
							<span className={styles.inputIcon}>
								<Icon.User />
							</span>
							<input
								id='username'
								type='text'
								className={`${styles.inputField} ${errors.username ? styles.hasError : ''}`}
								placeholder='Email hoặc tài khoản'
								value={form.username}
								onChange={handleChange('username')}
								autoComplete='username'
								autoFocus
								disabled={isLoading}
								aria-describedby={
									errors.username ? 'username-error' : undefined
								}
							/>
						</div>
						{errors.username && (
							<span
								id='username-error'
								className={styles.inputError}
								role='alert'
							>
								<Icon.Alert />
								{errors.username}
							</span>
						)}
					</div>

					{/* Mật khẩu */}
					<div className={styles.inputGroup}>
						<label
							htmlFor='password'
							className={styles.inputLabel}
						>
							Mật khẩu <span className={styles.inputRequired}>*</span>
						</label>
						<div className={styles.inputWrapper}>
							<span className={styles.inputIcon}>
								<Icon.Lock />
							</span>
							<input
								id='password'
								type={showPassword ? 'text' : 'password'}
								className={`${styles.inputField} ${errors.password ? styles.hasError : ''}`}
								placeholder='Nhập mật khẩu...'
								value={form.password}
								onChange={handleChange('password')}
								autoComplete='current-password'
								disabled={isLoading}
								aria-describedby={
									errors.password ? 'password-error' : undefined
								}
							/>
							<button
								type='button'
								className={styles.passwordToggle}
								onClick={() => setShowPassword((v) => !v)}
								aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
							>
								{showPassword ? <Icon.EyeOff /> : <Icon.Eye />}
							</button>
						</div>
						{errors.password && (
							<span
								id='password-error'
								className={styles.inputError}
								role='alert'
							>
								<Icon.Alert />
								{errors.password}
							</span>
						)}
					</div>

					{/* Tùy chọn */}
					<div className={styles.optionsRow}>
						<label className={styles.checkboxLabel}>
							<input
								type='checkbox'
								className={styles.checkboxInput}
								checked={form.remember}
								onChange={handleChange('remember')}
								disabled={isLoading}
							/>
							<span className={styles.checkboxText}>Ghi nhớ đăng nhập</span>
						</label>
						<Link to='/quen-mat-khau' className={styles.forgotLink}>
							Quên mật khẩu?
						</Link>
					</div>

					{/* Nút đăng nhập */}
					<button
						type='submit'
						className={styles.submitBtn}
						disabled={isLoading || isLocked}
					>
						{isLoading ? (
							<>
								<span className={styles.btnSpinner} />
								{isVerifying ? 'Đang kiểm tra bảo mật...' : 'Đang xác thực...'}
							</>
						) : isLocked ? (
							`Thử lại sau ${countdown}`
						) : (
							'Đăng nhập hệ thống'
						)}
					</button>
				</form>
			</div>

			{/* Hỗ trợ */}
			<div className={styles.supportBox}>
				<div className={styles.supportIcon}>
					<Icon.Support />
				</div>
				<div>
					<div className={styles.supportTitle}>Cần hỗ trợ?</div>
					<p className={styles.supportText}>
						Liên hệ Phòng CNTT: <a href='tel:02383123456'>0238.312.3456</a> hoặc{' '}
						<a href='mailto:cntt@bvhndk.vn'>cntt@bvhndk.vn</a>
					</p>
				</div>
			</div>

			{/* Cổng công khai — không cần tài khoản */}
			<p className={styles.supportText} style={{ textAlign: 'center', marginTop: 12 }}>
				Chưa có tài khoản?{' '}
				<Link to='/dang-ky-khoa-hoc'>Đăng ký khóa học đào tạo</Link> ·{' '}
				<Link to='/tra-cuu-ket-qua'>Tra cứu kết quả</Link>
			</p>

			{councilPrompt &&
				createPortal(
					<div className={styles.destBackdrop}>
						<div
							className={styles.destModal}
							role='alertdialog'
							aria-modal='true'
						>
							<div className={styles.destIcon}>
								<ClipboardCheckSvg />
							</div>
							<h2 className={styles.destTitle}>
								Bạn có nhiệm vụ trong hội đồng
							</h2>
							<p className={styles.destDesc}>
								Bạn đang được phân công đánh giá {councilPrompt.count} đề tài
								với vai trò thành viên hội đồng chấm đề cương. Bạn muốn vào
								đâu?
							</p>
							<div className={styles.destOptions}>
								<button
									className={styles.destOptionPrimary}
									onClick={() => navigate('/user/council-progress')}
								>
									Vào cổng đánh giá hội đồng
								</button>
								<button
									className={styles.destOptionSecondary}
									onClick={() => navigate(councilPrompt.dest)}
								>
									Vào trang chủ
								</button>
							</div>
						</div>
					</div>,
					document.body,
				)}
		</AuthLayout>
	);
}
