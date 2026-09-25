import React, { useState } from 'react';
import { CheckSvg, EditSvg, InfoSvg, XSvg } from '@/assets/icons';
import type { FormErrors, User } from '../../user/types/user.type';
import type { EditForm } from '../utils/deptAccountsHelpers';
import { checkPassword, generateTempPassword } from '../../../shared/utils/password';
import styles from '../pages/DepartmentAccounts.module.css';

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
	return (
		<button
			type='button'
			className={`${styles.toggleTrack} ${on ? styles.on : ''}`}
			onClick={onChange}
			aria-pressed={on}
		>
			<span className={styles.toggleThumb} />
		</button>
	);
}

function Field({
	id,
	label,
	required,
	error,
	hint,
	children,
}: {
	id: string;
	label: string;
	required?: boolean;
	error?: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.formGroup}>
			<label
				htmlFor={id}
				className={styles.formLabel}
			>
				{label}
				{required && <span className={styles.required}>*</span>}
			</label>
			{children}
			{error && <span className={styles.fieldError}>{error}</span>}
			{!error && hint && <span className={styles.formHint}>{hint}</span>}
		</div>
	);
}

interface DeptAccountsEditModalProps {
	user: User;
	deptName: string;
	onClose: () => void;
	onSave: (form: EditForm) => Promise<void>;
}

export function DeptAccountsEditModal({
	user,
	deptName,
	onClose,
	onSave,
}: DeptAccountsEditModalProps) {
	const [form, setForm] = useState<EditForm>({
		full_name: user.full_name,
		staff_number: user.staff_number != null ? String(user.staff_number) : '',
		email: user.email ?? '',
		is_active: user.is_active,
		password: '',
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [loading, setLoading] = useState(false);
	const [showPwd, setShowPwd] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	const set = (field: keyof EditForm, value: unknown) => {
		setForm((p) => ({ ...p, [field]: value }));
		if (errors[field])
			setErrors((p) => {
				const n = { ...p };
				delete n[field];
				return n;
			});
	};

	const validate = (): boolean => {
		const e: FormErrors = {};
		if (!form.full_name.trim()) e.full_name = 'Vui lòng nhập họ và tên';
		if (!form.staff_number.trim())
			e.staff_number = 'Vui lòng nhập mã nhân viên';
		if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
			e.email = 'Email không hợp lệ';
		const pwdError = form.password ? checkPassword(form.password, user.username) : null;
		if (pwdError)
			e.password = pwdError;
		setErrors(e);
		return Object.keys(e).length === 0;
	};

	const handleSubmit = async () => {
		if (!validate()) return;
		setLoading(true);
		setSaveError(null);
		try {
			await onSave(form);
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
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
				className={styles.modal}
				role='dialog'
				aria-modal='true'
			>
				<div className={styles.modalHeader}>
					<div
						className={styles.modalHeaderIcon}
						style={{ background: '#e6f1fb', color: '#0c447c' }}
					>
						<EditSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Chỉnh sửa tài khoản</div>
						<div className={styles.modalSubtitle}>
							Cập nhật thông tin — {user.username}
						</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
						aria-label='Đóng'
					>
						<XSvg />
					</button>
				</div>

				<div className={styles.modalBody}>
					<div className={styles.formSection}>Thông tin cá nhân</div>
					<div className={styles.formRow}>
						<Field
							id='full_name'
							label='Họ và tên'
							required
							error={errors.full_name}
						>
							<input
								id='full_name'
								className={`${styles.formInput} ${errors.full_name ? styles.inputError : ''}`}
								placeholder='Nguyễn Văn A'
								value={form.full_name}
								onChange={(e) => set('full_name', e.target.value)}
							/>
						</Field>
						<Field
							id='staff_number'
							label='Mã nhân viên'
							required
							error={errors.staff_number}
						>
							<input
								id='staff_number'
								className={`${styles.formInput} ${errors.staff_number ? styles.inputError : ''}`}
								placeholder='vd: BV001234'
								value={form.staff_number}
								onChange={(e) => set('staff_number', e.target.value.trim())}
							/>
						</Field>
					</div>
					<div className={styles.formRow}>
						<div className={styles.formRowFull}>
							<Field
								id='email'
								label='Email'
								error={errors.email}
							>
								<input
									id='email'
									type='email'
									className={`${styles.formInput} ${errors.email ? styles.inputError : ''}`}
									placeholder='email@bvhndk.vn'
									value={form.email}
									onChange={(e) => set('email', e.target.value)}
								/>
							</Field>
						</div>
					</div>

					<div className={styles.formSection}>Thông tin tài khoản</div>
					<div className={styles.formRow}>
						<Field
							id='username_ro'
							label='Tên đăng nhập'
							hint='Không thể thay đổi'
						>
							<div className={styles.readonlyField}>{user.username}</div>
						</Field>
						<Field
							id='password'
							label='Đặt lại mật khẩu'
							error={errors.password}
							hint='Để trống nếu không muốn đổi. Người dùng phải đổi lại ở lần đăng nhập tới.'
						>
							<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
								<div style={{ position: 'relative', flex: 1 }}>
									<input
										id='password'
										type={showPwd ? 'text' : 'password'}
										className={`${styles.formInput} ${errors.password ? styles.inputError : ''}`}
										placeholder='(để trống = giữ nguyên)'
										value={form.password}
										onChange={(e) => set('password', e.target.value)}
										style={{ paddingRight: 40 }}
									/>
									<button
										type='button'
										onClick={() => setShowPwd((v) => !v)}
										style={{
											position: 'absolute',
											right: 10,
											top: '50%',
											transform: 'translateY(-50%)',
											background: 'none',
											border: 'none',
											cursor: 'pointer',
											color: 'var(--color-gray-400)',
											display: 'flex',
										}}
										aria-label={showPwd ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
									>
										<InfoSvg />
									</button>
								</div>
								<button
									type='button'
									onClick={() => {
										set('password', generateTempPassword());
										setShowPwd(true);
									}}
									style={{
										flexShrink: 0,
										height: 38,
										padding: '0 12px',
										borderRadius: 8,
										border: '1px solid var(--color-gray-200)',
										background: 'var(--color-gray-50)',
										color: 'var(--color-gray-600)',
										fontSize: 12,
										fontWeight: 500,
										cursor: 'pointer',
										whiteSpace: 'nowrap',
									}}
								>
									Tạo ngẫu nhiên
								</button>
							</div>
						</Field>
					</div>

					<div className={styles.formSection}>Phân công</div>
					<div className={styles.formRow}>
						<Field
							id='dept_ro'
							label='Khoa / Phòng ban'
							hint='Không thể thay đổi'
						>
							<div className={styles.readonlyField}>{deptName}</div>
						</Field>
						{/* Chỉ quản trị hệ thống đổi được vai trò (backend bỏ qua role_id của
						    người khác) — đổi ở trang quản trị Người dùng. */}
						<Field
							id='role_ro'
							label='Vai trò'
							hint='Đổi tại trang quản trị Người dùng'
						>
							<div className={styles.readonlyField}>{user.role_name ?? '—'}</div>
						</Field>
					</div>

					<div className={styles.formToggleRow}>
						<div>
							<div className={styles.formToggleLabel}>Trạng thái tài khoản</div>
							<div className={styles.formToggleSub}>
								{form.is_active
									? 'Tài khoản đang hoạt động'
									: 'Tài khoản bị tạm khoá'}
							</div>
						</div>
						<Toggle
							on={form.is_active}
							onChange={() => set('is_active', !form.is_active)}
						/>
					</div>
				</div>

				<div className={styles.modalFooter}>
					{saveError && (
						<span
							className={styles.fieldError}
							style={{ flex: 1 }}
						>
							{saveError}
						</span>
					)}
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
						className={styles.btnConfirmBlue}
						onClick={handleSubmit}
						disabled={loading}
					>
						{loading ? (
							<>
								<span className={styles.spinner} /> Đang lưu...
							</>
						) : (
							<>
								<CheckSvg /> Lưu thay đổi
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
