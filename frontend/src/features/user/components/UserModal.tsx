import { Toggle } from '@/shared/components/Input/Toggle';
import { FormField } from '@/shared/components/Input/FormField';
import { Modal } from '@/shared/components';
import { CheckSvg, ChevDSvg, EditSvg, InfoSvg, KeySvg } from '@/assets/icons';
import { useState } from 'react';
import type { SimpleItem } from '../api/userApi';
import styles from '../pages/UserList.module.css';
import type { FormErrors, User, UserForm } from '../types/user.type';
import { getInitials } from '../../../shared/utils/helper';
import { suggestUsername } from '../utils/userHelpers';
import {
	checkPassword,
	generateTempPassword,
	PASSWORD_HINT,
} from '../../../shared/utils/password';

function Avatar({
	name,
	cls,
	size = 'md',
}: {
	name: string;
	cls: string;
	size?: 'sm' | 'md' | 'lg';
}) {
	const sizeCls =
		`avatar${size.charAt(0).toUpperCase() + size.slice(1)}` as keyof typeof styles;
	return (
		<div
			className={`${styles.avatar} ${styles[cls as keyof typeof styles]} ${styles[sizeCls]}`}
		>
			{getInitials(name)}
		</div>
	);
}

interface UserModalProps {
	mode: 'create' | 'edit';
	user?: User;
	departments: SimpleItem[];
	roles: SimpleItem[];
	defaultDeptId?: string;
	onClose: () => void;
	onSave: (form: UserForm) => Promise<void>;
}

export function UserModal({
	mode,
	user,
	departments,
	roles,
	defaultDeptId,
	onClose,
	onSave,
}: UserModalProps) {
	const [form, setForm] = useState<UserForm>({
		username: user?.username ?? '',
		staff_number: user?.staff_number != null ? String(user.staff_number) : '',
		full_name: user?.full_name ?? '',
		email: user?.email ?? '',
		department_id: user?.department_id ?? defaultDeptId ?? '',
		role_id: user?.role_id ?? '',
		is_active: user?.is_active ?? true,
		// Mật khẩu tạm ngẫu nhiên — người dùng phải đổi ở lần đăng nhập đầu
		password: mode === 'create' ? generateTempPassword() : '',
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [loading, setLoading] = useState(false);
	const [showPwd, setShowPwd] = useState(mode === 'create');
	const [usernameTouched, setUsernameTouched] = useState(mode === 'edit');
	const [saveError, setSaveError] = useState<string | null>(null);

	const set = (field: keyof UserForm, value: unknown) => {
		if (field === 'username') setUsernameTouched(true);
		setForm((p) => {
			const next = { ...p, [field]: value };
			if (
				mode === 'create' &&
				!usernameTouched &&
				(field === 'full_name' || field === 'staff_number')
			) {
				next.username = suggestUsername(
					field === 'full_name' ? (value as string) : p.full_name,
					field === 'staff_number' ? (value as string) : p.staff_number,
				);
			}
			return next;
		});
		if (errors[field as string])
			setErrors((p) => {
				const n = { ...p };
				delete n[field as string];
				return n;
			});
	};

	const validate = (): boolean => {
		const e: FormErrors = {};
		if (!form.full_name.trim()) e.full_name = 'Vui lòng nhập họ và tên';
		const staffNumStr = String(form.staff_number ?? '').trim();
		if (staffNumStr && !/^\d+$/.test(staffNumStr))
			e.staff_number = 'Mã nhân viên chỉ được chứa chữ số';
		if (!form.username.trim()) e.username = 'Vui lòng nhập tên đăng nhập';
		else if (form.username.length < 3)
			e.username = 'Tên đăng nhập ít nhất 3 ký tự';
		if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
			e.email = 'Email không hợp lệ';
		if (!form.department_id) e.department_id = 'Vui lòng chọn phòng ban';
		if (!form.role_id) e.role_id = 'Vui lòng chọn vai trò';
		if (mode === 'create' && !form.password)
			e.password = 'Vui lòng nhập mật khẩu';
		else if (form.password) {
			const pwdError = checkPassword(form.password, form.username);
			if (pwdError) e.password = pwdError;
		}
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
		<Modal
			open
			onClose={onClose}
			icon={mode === 'create' ? <KeySvg /> : <EditSvg />}
			iconStyle={
				mode === 'create'
					? { background: '#faeeda', color: '#633806' }
					: { background: '#e6f1fb', color: '#0c447c' }
			}
			title={mode === 'create' ? 'Cấp tài khoản mới' : 'Chỉnh sửa tài khoản'}
			subtitle={mode === 'create' ? 'Tạo tài khoản cho cán bộ / nhân viên' : `Cập nhật thông tin — ${user?.id}`}
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<>
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
						className={
							mode === 'create' ? styles.btnConfirmAmber : styles.btnConfirmBlue
						}
						onClick={() => void handleSubmit()}
						disabled={loading}
					>
						{loading ? (
							<>
								<span
									className={`${styles.spinner} ${mode === 'create' ? styles.spinnerDark : ''}`}
								/>{' '}
								Đang lưu...
							</>
						) : mode === 'create' ? (
							<>
								<KeySvg /> Cấp tài khoản
							</>
						) : (
							<>
								<CheckSvg /> Lưu thay đổi
							</>
						)}
					</button>
				</>
			}
		>
			<div className={styles.formSection}>Thông tin cá nhân</div>
			<div className={styles.formRow}>
				<FormField
					htmlFor='full_name'
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
				</FormField>
				<FormField
					htmlFor='staff_number'
					label='Mã nhân viên'
					required
					error={errors.staff_number}
					hint='Mã định danh nhân viên trong bệnh viện'
				>
					<input
						id='staff_number'
						className={`${styles.formInput} ${errors.staff_number ? styles.inputError : ''}`}
						placeholder='vd: BV001234'
						value={form.staff_number}
						onChange={(e) => set('staff_number', e.target.value.trim())}
					/>
				</FormField>
			</div>
			<div className={styles.formRow}>
				<div className={styles.formRowFull}>
					<FormField
						htmlFor='email'
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
					</FormField>
				</div>
			</div>

			<div className={styles.formSection}>Thông tin tài khoản</div>
			<div className={styles.formRow}>
				<FormField
					htmlFor='username'
					label='Tên đăng nhập'
					required
					error={errors.username}
					hint='Chỉ gồm chữ, số, dấu gạch dưới'
				>
					<input
						id='username'
						className={`${styles.formInput} ${errors.username ? styles.inputError : ''}`}
						placeholder='vd: bsnguyen_a'
						value={form.username}
						onChange={(e) =>
							set(
								'username',
								e.target.value.toLowerCase().replace(/\s/g, ''),
							)
						}
						disabled={mode === 'edit'}
						style={mode === 'edit' ? { opacity: 0.6 } : {}}
					/>
				</FormField>
				<FormField
					htmlFor='password'
					label={mode === 'create' ? 'Mật khẩu' : 'Mật khẩu mới'}
					required={mode === 'create'}
					error={errors.password}
					hint={
						mode === 'edit'
							? 'Để trống nếu không muốn đổi mật khẩu'
							: 'Mật khẩu tạm — người dùng phải đổi ở lần đăng nhập đầu'
					}
				>
					<div style={{ position: 'relative' }}>
						<input
							id='password'
							type={showPwd ? 'text' : 'password'}
							className={`${styles.formInput} ${errors.password ? styles.inputError : ''}`}
							placeholder={
								mode === 'create'
									? PASSWORD_HINT
									: '(để trống = giữ nguyên)'
							}
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
				</FormField>
			</div>

			<div className={styles.formSection}>Phân công &amp; Vai trò</div>
			<div className={styles.formRow}>
				<FormField
					htmlFor='department_id'
					label='Phòng ban / Khoa'
					required
					error={errors.department_id}
				>
					<div className={styles.selectWrapper}>
						<select
							id='department_id'
							className={styles.formSelect}
							value={form.department_id}
							onChange={(e) => set('department_id', e.target.value)}
						>
							<option value=''>— Chọn phòng ban —</option>
							{departments.map((d) => (
								<option
									key={d.id}
									value={d.id}
								>
									{d.name}
								</option>
							))}
						</select>
						<ChevDSvg />
					</div>
				</FormField>
				<FormField
					htmlFor='role_id'
					label='Vai trò'
					required
					error={errors.role_id}
				>
					<div className={styles.selectWrapper}>
						<select
							id='role_id'
							className={styles.formSelect}
							value={form.role_id}
							onChange={(e) => set('role_id', e.target.value)}
						>
							<option value=''>— Chọn vai trò —</option>
							{roles.map((r) => (
								<option
									key={r.id}
									value={r.id}
								>
									{r.name}
								</option>
							))}
						</select>
						<ChevDSvg />
					</div>
				</FormField>
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
		</Modal>
	);
}

export { Avatar, Toggle };
