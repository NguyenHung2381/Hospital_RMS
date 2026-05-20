import React, { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../../../layouts/AuthLayout';
import { saveAuth } from '../../../lib/authStorage';
import type { LoginUser } from '../api/authApi';
import { loginApi } from '../api/authApi';
import type { FormErrors, LoginForm } from '../types/Auth.type';
import styles from './Login.module.css';

function isAdminUser(u: LoginUser): boolean {
	if (u.account_type === 'admin') return true;
	const role = (u.role ?? '').toLowerCase();
	return (
		role.includes('giám đốc') ||
		role.includes('giam_doc') ||
		role.includes('giam doc') ||
		role.includes('director')
	);
}

// === ICONS (inline SVG để không phụ thuộc thư viện) ===
const IconUser = () => (
	<svg
		width='18'
		height='18'
		viewBox='0 0 24 24'
		fill='none'
		stroke='currentColor'
		strokeWidth='2'
		strokeLinecap='round'
		strokeLinejoin='round'
	>
		<path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' />
		<circle
			cx='12'
			cy='7'
			r='4'
		/>
	</svg>
);

const IconLock = () => (
	<svg
		width='18'
		height='18'
		viewBox='0 0 24 24'
		fill='none'
		stroke='currentColor'
		strokeWidth='2'
		strokeLinecap='round'
		strokeLinejoin='round'
	>
		<rect
			x='3'
			y='11'
			width='18'
			height='11'
			rx='2'
			ry='2'
		/>
		<path d='M7 11V7a5 5 0 0 1 10 0v4' />
	</svg>
);

const IconEye = () => (
	<svg
		width='18'
		height='18'
		viewBox='0 0 24 24'
		fill='none'
		stroke='currentColor'
		strokeWidth='2'
		strokeLinecap='round'
		strokeLinejoin='round'
	>
		<path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' />
		<circle
			cx='12'
			cy='12'
			r='3'
		/>
	</svg>
);

const IconEyeOff = () => (
	<svg
		width='18'
		height='18'
		viewBox='0 0 24 24'
		fill='none'
		stroke='currentColor'
		strokeWidth='2'
		strokeLinecap='round'
		strokeLinejoin='round'
	>
		<path d='M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' />
		<line
			x1='1'
			y1='1'
			x2='23'
			y2='23'
		/>
	</svg>
);

const IconAlert = () => (
	<svg
		width='16'
		height='16'
		viewBox='0 0 24 24'
		fill='none'
		stroke='currentColor'
		strokeWidth='2.5'
		strokeLinecap='round'
		strokeLinejoin='round'
	>
		<circle
			cx='12'
			cy='12'
			r='10'
		/>
		<line
			x1='12'
			y1='8'
			x2='12'
			y2='12'
		/>
		<line
			x1='12'
			y1='16'
			x2='12.01'
			y2='16'
		/>
	</svg>
);

const IconShield = () => (
	<svg
		width='14'
		height='14'
		viewBox='0 0 24 24'
		fill='none'
		stroke='currentColor'
		strokeWidth='2'
		strokeLinecap='round'
		strokeLinejoin='round'
	>
		<path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
	</svg>
);

const IconSupport = () => (
	<svg
		width='18'
		height='18'
		viewBox='0 0 24 24'
		fill='none'
		stroke='currentColor'
		strokeWidth='2'
		strokeLinecap='round'
		strokeLinejoin='round'
	>
		<path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' />
	</svg>
);

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
	const [apiError, setApiError] = useState<string | null>(null);

	// Validation
	const validate = useCallback((): boolean => {
		const newErrors: FormErrors = {};

		if (!form.username.trim()) {
			newErrors.username = 'Vui lòng nhập tên đăng nhập';
		} else if (form.username.trim().length < 3) {
			newErrors.username = 'Tên đăng nhập ít nhất 3 ký tự';
		}

		if (!form.password) {
			newErrors.password = 'Vui lòng nhập mật khẩu';
		} else if (form.password.length < 2) {
			newErrors.password = 'Mật khẩu ít nhất 6 ký tự';
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
			if (apiError) setApiError(null);
		};

	// Handle submit
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!validate()) return;

		setIsLoading(true);
		setApiError(null);

		try {
			const data = await loginApi(form.username, form.password);
			saveAuth(data, form.remember);
			const from = searchParams.get('from');
			const dest = from || (isAdminUser(data.user) ? '/admin' : '/user');
			navigate(dest);
		} catch (err) {
			setApiError(
				err instanceof Error ? err.message : 'Có lỗi xảy ra, vui lòng thử lại',
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<AuthLayout>
			{/* Header */}
			<div className={styles.loginHeader}>
				<div className={styles.loginTag}>
					<span />
					Hệ thống nội bộ
				</div>
				<h2 className={styles.loginTitle}>
					Đăng nhập <span>nghiên cứu</span>
				</h2>
				<p className={styles.loginSubtitle}>
					Sử dụng tài khoản được cấp bởi Phòng CNTT để truy cập hệ thống
				</p>
			</div>

			{/* Form card */}
			<div className={styles.loginCard}>
				{/* Thông báo lỗi API */}
				{apiError && (
					<div
						className={`${styles.alertBox} ${styles.alertError}`}
						role='alert'
					>
						<IconAlert />
						<span>{apiError}</span>
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
							Tên đăng nhập <span className={styles.inputRequired}>*</span>
						</label>
						<div className={styles.inputWrapper}>
							<span className={styles.inputIcon}>
								<IconUser />
							</span>
							<input
								id='username'
								type='text'
								className={`${styles.inputField} ${errors.username ? styles.hasError : ''}`}
								placeholder='Nhập tên đăng nhập...'
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
								<IconAlert />
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
								<IconLock />
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
								{showPassword ? <IconEyeOff /> : <IconEye />}
							</button>
						</div>
						{errors.password && (
							<span
								id='password-error'
								className={styles.inputError}
								role='alert'
							>
								<IconAlert />
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
						<a
							href='/forgot-password'
							className={styles.forgotLink}
						>
							Quên mật khẩu?
						</a>
					</div>

					{/* Nút đăng nhập */}
					<button
						type='submit'
						className={styles.submitBtn}
						disabled={isLoading}
					>
						{isLoading ? (
							<>
								<span className={styles.btnSpinner} />
								Đang xác thực...
							</>
						) : (
							'Đăng nhập hệ thống'
						)}
					</button>
				</form>
			</div>

			{/* Hỗ trợ */}
			<div className={styles.supportBox}>
				<div className={styles.supportIcon}>
					<IconSupport />
				</div>
				<div>
					<div className={styles.supportTitle}>Cần hỗ trợ?</div>
					<p className={styles.supportText}>
						Liên hệ Phòng CNTT: <a href='tel:02383123456'>0238.312.3456</a> hoặc{' '}
						<a href='mailto:cntt@bvhndk.vn'>cntt@bvhndk.vn</a>
					</p>
				</div>
			</div>

			{/* Security badges */}
			<div className={styles.securityBadges}>
				<span className={styles.secBadge}>
					<IconShield />
					Kết nối bảo mật SSL
				</span>
				<span className={styles.secBadge}>
					<IconShield />
					Mã hóa AES-256
				</span>
				<span className={styles.secBadge}>
					<IconShield />
					Xác thực 2 lớp
				</span>
			</div>
		</AuthLayout>
	);
}
