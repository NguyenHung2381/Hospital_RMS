import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isAdmin } from '../../../app/router/authHelpers';
import AuthLayout from '../../../layouts/AuthLayout';
import { saveAuth } from '../../../shared/utils/storage';
import { getMyProgress } from '../../council/api/councilApi';
import { loginApi } from '../api/authApi';
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
	const [apiError, setApiError] = useState<string | null>(null);
	// Popup chọn nơi vào cho tài khoản có ghế trong hội đồng chấm đề tài
	const [councilPrompt, setCouncilPrompt] = useState<{
		dest: string;
		count: number;
	} | null>(null);

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
			const dest = from || (isAdmin(data.user) ? '/admin' : '/user');

			// Chỉ hỏi khi vào thẳng cổng người dùng (không phải deep-link cụ thể)
			if (!from && !isAdmin(data.user)) {
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
						<Icon.Alert />
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
								<Icon.User />
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
