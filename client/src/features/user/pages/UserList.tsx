// =============================================
// UserList.tsx — Quản lý Người dùng
// Bệnh viện Hữu Nghị Đa Khoa Nghệ An — RMS
// Bảng: users (join departments, roles)
// =============================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CheckSvg from '../../../assets/svg/check.svg?react';
import ChevDSvg from '../../../assets/svg/chev-d.svg?react';
import ChevRSvg from '../../../assets/svg/chev-r.svg?react';
import EditSvg from '../../../assets/svg/edit.svg?react';
import InfoSvg from '../../../assets/svg/info.svg?react';
import KeySvg from '../../../assets/svg/key.svg?react';
import PlusSvg from '../../../assets/svg/plus.svg?react';
import SearchSvg from '../../../assets/svg/search.svg?react';
import TrashSvg from '../../../assets/svg/trash.svg?react';
import UsersSvg from '../../../assets/svg/users.svg?react';
import WarnSvg from '../../../assets/svg/warn.svg?react';
import XSvg from '../../../assets/svg/x.svg?react';
import AdminLayout from '../../../layouts/AdminLayout';
import {
	createUser,
	deleteUser as deleteUserApi,
	getDepts,
	getRolesList,
	getUsers,
	resetUserPassword,
	updateUser as updateUserApi,
	type SimpleItem,
} from '../api/userApi';
import { useRealtimeUpdate } from '../../../hooks/useRealtime';
import type { AccountType, FormErrors, User, UserForm } from '../types/User.type';
import styles from './UserList.module.css';

// ─── CONSTANTS ────────────────────────────
const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
	{ value: 'admin',    label: 'Quản trị'    },
	{ value: 'director', label: 'Giám đốc'    },
	{ value: 'reviewer', label: 'Thẩm định'   },
	{ value: 'manager',  label: 'Quản lý'     },
	{ value: 'dept',     label: 'TK Khoa'     },
	{ value: 'member',   label: 'Thành viên'  },
];

const ACCOUNT_TYPE_CFG: Record<
	AccountType,
	{ label: string; cls: string; avatarCls: string }
> = {
	admin:    { label: 'Quản trị',   cls: 'rolePurple', avatarCls: 'avatarPurple' },
	director: { label: 'Giám đốc',   cls: 'roleRed',    avatarCls: 'avatarRed'    },
	reviewer: { label: 'Thẩm định',  cls: 'roleGray',   avatarCls: 'avatarGray'   },
	manager:  { label: 'Quản lý',    cls: 'roleBlue',   avatarCls: 'avatarBlue'   },
	dept:     { label: 'TK Khoa',    cls: 'roleAmber',  avatarCls: 'avatarAmber'  },
	member:   { label: 'Thành viên', cls: 'roleGreen',  avatarCls: 'avatarGreen'  },
};

// ─── HELPERS ──────────────────────────────
function getInitials(name: string) {
	return name
		.split(' ')
		.filter(Boolean)
		.slice(-2)
		.map((w) => w[0])
		.join('')
		.toUpperCase();
}

function formatDate(dateStr: string | null | undefined): string {
	if (!dateStr) return '—';
	const d = new Date(dateStr);
	if (isNaN(d.getTime())) return dateStr;
	return new Intl.DateTimeFormat('vi-VN').format(d);
}

function isPasswordOld(dateStr: string | null): boolean {
	if (!dateStr) return true;
	const d = new Date(dateStr);
	if (isNaN(d.getTime())) return true;
	return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24) > 90;
}

function removeDiacritics(str: string) {
	return str
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/gi, 'd')
		.toLowerCase();
}

function suggestUsername(fullName: string, staffNumber: string): string {
	const words = fullName.trim().split(/\s+/).filter(Boolean);
	if (!words.length) return '';
	const last = removeDiacritics(words[words.length - 1]);
	const initials = words
		.slice(0, -1)
		.map((w) => removeDiacritics(w)[0] ?? '')
		.join('');
	const base = (last + initials).replace(/[^a-z0-9]/g, '');
	const code = staffNumber.replace(/[^a-z0-9]/gi, '').toLowerCase();
	return code ? `${base}_${code}` : base;
}

// ─── ICONS ────────────────────────────────
const Ic = {
	Users: UsersSvg,
	Plus: PlusSvg,
	Edit: EditSvg,
	Trash: TrashSvg,
	Key: KeySvg,
	Check: CheckSvg,
	X: XSvg,
	Search: SearchSvg,
	ChevronDown: ChevDSvg,
	ChevronRight: ChevRSvg,
	Info: InfoSvg,
	Warn: WarnSvg,
};

// ─── BADGE COMPONENT ──────────────────────
function Badge({
	cls,
	children,
	dot,
}: {
	cls: string;
	children: React.ReactNode;
	dot?: boolean;
}) {
	return (
		<span className={`${styles.badge} ${styles[cls as keyof typeof styles]}`}>
			{dot && <span className={styles.badgeDot} />}
			{children}
		</span>
	);
}

// ─── AVATAR ───────────────────────────────
function Avatar({
	name,
	cls,
	size = 'md',
}: {
	name: string;
	cls: string;
	size?: 'sm' | 'md' | 'lg';
}) {
	return (
		<div
			className={`${styles.avatar} ${styles[cls as keyof typeof styles]} ${styles[`avatar${size.charAt(0).toUpperCase() + size.slice(1)}` as keyof typeof styles]}`}
		>
			{getInitials(name)}
		</div>
	);
}

// ─── TOGGLE ───────────────────────────────
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

// ─── FORM FIELD ───────────────────────────
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

// ─── USER FORM MODAL ──────────────────────
interface UserModalProps {
	mode: 'create' | 'edit';
	user?: User;
	departments: SimpleItem[];
	roles: SimpleItem[];
	defaultDeptId?: string;
	onClose: () => void;
	onSave: (form: UserForm) => Promise<void>;
}

function UserModal({
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
		account_type: user?.account_type ?? 'member',
		is_active: user?.is_active ?? true,
		password: mode === 'create' ? '123456' : '',
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [loading, setLoading] = useState(false);
	const [showPwd, setShowPwd] = useState(false);
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
		const staffNumStr = String(form.staff_number ?? '').trim();
		if (staffNumStr && !/^\d+$/.test(staffNumStr))
			e.staff_number = 'Mã nhân viên chỉ được chứa chữ số';
		if (!form.username.trim()) e.username = 'Vui lòng nhập tên đăng nhập';
		else if (form.username.length < 3)
			e.username = 'Tên đăng nhập ít nhất 3 ký tự';
		if (
			form.email.trim() &&
			!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
		)
			e.email = 'Email không hợp lệ';
		if (!form.department_id) e.department_id = 'Vui lòng chọn phòng ban';
		if (!form.role_id) e.role_id = 'Vui lòng chọn vai trò';
		if (mode === 'create' && !form.password) e.password = 'Vui lòng nhập mật khẩu';
		else if (form.password && form.password.length < 5)
			e.password = 'Mật khẩu ít nhất 5 ký tự';
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
				{/* Header */}
				<div className={styles.modalHeader}>
					<div
						className={styles.modalHeaderIcon}
						style={
							mode === 'create'
								? { background: '#faeeda', color: '#633806' }
								: { background: '#e6f1fb', color: '#0c447c' }
						}
					>
						{mode === 'create' ? <Ic.Key /> : <Ic.Edit />}
					</div>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'create' ? 'Cấp tài khoản mới' : 'Chỉnh sửa tài khoản'}
						</div>
						<div className={styles.modalSubtitle}>
							{mode === 'create'
								? 'Tạo tài khoản cho cán bộ / nhân viên'
								: `Cập nhật thông tin — ${user?.id}`}
						</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
						aria-label='Đóng'
					>
						<Ic.X />
					</button>
				</div>

				{/* Body */}
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
							hint='Mã định danh nhân viên trong bệnh viện'
						>
							<input
								id='staff_number'
								className={`${styles.formInput} ${errors.staff_number ? styles.inputError : ''}`}
								placeholder='vd: BV001234'
								value={form.staff_number}
								onChange={(e) =>
									set('staff_number', e.target.value.trim())
								}
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
							id='username'
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
						</Field>
						<Field
							id='password'
							label={mode === 'create' ? 'Mật khẩu' : 'Mật khẩu mới'}
							required={mode === 'create'}
							error={errors.password}
							hint={
								mode === 'edit'
									? 'Để trống nếu không muốn đổi mật khẩu'
									: 'Mật khẩu mặc định: 123456'
							}
						>
							<div style={{ position: 'relative' }}>
								<input
									id='password'
									type={showPwd ? 'text' : 'password'}
									className={`${styles.formInput} ${errors.password ? styles.inputError : ''}`}
									placeholder={
										mode === 'create'
											? 'Tối thiểu 5 ký tự'
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
									<Ic.Info />
								</button>
							</div>
						</Field>
					</div>

					<div className={styles.formSection}>Phân công & Vai trò</div>
					<div className={styles.formRow}>
						<Field
							id='department_id'
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
								<Ic.ChevronDown />
							</div>
						</Field>
						<Field
							id='role_id'
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
								<Ic.ChevronDown />
							</div>
						</Field>
					</div>
					<div className={styles.formRow}>
						<Field
							id='account_type'
							label='Loại tài khoản'
							required
						>
							<div className={styles.selectWrapper}>
								<select
									id='account_type'
									className={styles.formSelect}
									value={form.account_type}
									onChange={(e) =>
										set('account_type', e.target.value as AccountType)
									}
								>
									{ACCOUNT_TYPES.map((t) => (
										<option
											key={t.value}
											value={t.value}
										>
											{t.label}
										</option>
									))}
								</select>
								<Ic.ChevronDown />
							</div>
						</Field>
						<div />
					</div>

					{/* Active toggle */}
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

				{/* Footer */}
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
						className={
							mode === 'create'
								? styles.btnConfirmAmber
								: styles.btnConfirmBlue
						}
						onClick={handleSubmit}
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
								<Ic.Key /> Cấp tài khoản
							</>
						) : (
							<>
								<Ic.Check /> Lưu thay đổi
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── DELETE CONFIRM MODAL ─────────────────
function DeleteModal({
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
						<Ic.Warn />
					</div>
					<div>
						<div className={styles.modalTitle}>Xoá tài khoản?</div>
						<div
							className={styles.modalSubtitle}
							style={{ marginTop: 6 }}
						>
							Bạn chắc chắn muốn xoá tài khoản{' '}
							<strong>{user.full_name}</strong> ({user.username})? Hành động
							này không thể hoàn tác.
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
								<Ic.Trash /> Xác nhận xoá
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── MAIN PAGE ────────────────────────────
export default function UserList() {
	const [users, setUsers] = useState<User[]>([]);
	const [departments, setDepartments] = useState<SimpleItem[]>([]);
	const [roles, setRoles] = useState<SimpleItem[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [search, setSearch] = useState('');
	const [typeFilters, setTypeFilters] = useState<AccountType[]>([]);
	const [deptFilters, setDeptFilters] = useState<string[]>([]);
	const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
	const [pageSize, setPageSize] = useState(20);
	const [currentPage, setCurrentPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);
	const [showCreate, setShowCreate] = useState(false);
	const [editUser, setEditUser] = useState<User | null>(null);
	const [deleteUser, setDeleteUser] = useState<User | null>(null);
	const [toast, setToast] = useState<{
		msg: string;
		type: 'success' | 'error' | 'info';
	} | null>(null);

	const showToast = useCallback(
		(msg: string, type: 'success' | 'error' | 'info' = 'success') => {
			setToast({ msg, type });
		},
		[],
	);

	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 3000);
		return () => clearTimeout(t);
	}, [toast]);

	// suppressRealtimeRef: sau khi tự mình sửa dữ liệu (create/edit/delete),
	// bỏ qua SSE broadcast trong 3 giây để tránh reload trang thừa.
	const suppressRealtimeRef = React.useRef(false);
	const suppressRealtime = (ms = 3000) => {
		suppressRealtimeRef.current = true;
		setTimeout(() => { suppressRealtimeRef.current = false; }, ms);
	};

	const refreshData = useCallback(() => {
		if (suppressRealtimeRef.current) return;
		setRefreshKey((k) => k + 1);
	}, []);
	useRealtimeUpdate('user', refreshData);

	useEffect(() => {
		const load = async () => {
			setIsLoadingData(true);
			setLoadError(null);
			try {
				const [usersRes, deptsRes, rolesRes] = await Promise.all([
					getUsers({ limit: 200 }),
					getDepts(),
					getRolesList(),
				]);
				setUsers(usersRes.data);
				setDepartments(deptsRes.data);
				setRoles(rolesRes.data);
			} catch (err) {
				setLoadError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
			} finally {
				setIsLoadingData(false);
			}
		};
		void load();
	}, [refreshKey]);

	// ── Stats ──────────────────────────────
	const globalStats = useMemo(
		() => ({
			total: users.length,
			active: users.filter((u) => u.is_active).length,
			inactive: users.filter((u) => !u.is_active).length,
			pwdWarn: users.filter((u) => isPasswordOld(u.password_changed_at))
				.length,
		}),
		[users],
	);

	// ── Filter logic ───────────────────────
	const usersForTypeCount = useMemo(() => {
		return users.filter((u) => {
			if (deptFilters.length > 0 && (!u.department_id || !deptFilters.includes(u.department_id))) return false;
			if (search) {
				const q = search.toLowerCase();
				return (
					u.full_name.toLowerCase().includes(q) ||
					u.username.toLowerCase().includes(q) ||
					(u.email ?? '').toLowerCase().includes(q) ||
					String(u.staff_number ?? '').toLowerCase().includes(q)
				);
			}
			return true;
		});
	}, [users, deptFilters, search]);

	const usersForDeptCount = useMemo(() => {
		return users.filter((u) => {
			if (typeFilters.length > 0 && !typeFilters.includes(u.account_type)) return false;
			if (search) {
				const q = search.toLowerCase();
				return (
					u.full_name.toLowerCase().includes(q) ||
					u.username.toLowerCase().includes(q) ||
					(u.email ?? '').toLowerCase().includes(q) ||
					String(u.staff_number ?? '').toLowerCase().includes(q)
				);
			}
			return true;
		});
	}, [users, typeFilters, search]);

	const filteredUsers = useMemo(() => {
		return users.filter((u) => {
			if (typeFilters.length > 0 && !typeFilters.includes(u.account_type)) return false;
			if (deptFilters.length > 0 && (!u.department_id || !deptFilters.includes(u.department_id))) return false;
			if (search) {
				const q = search.toLowerCase();
				return (
					u.full_name.toLowerCase().includes(q) ||
					u.username.toLowerCase().includes(q) ||
					(u.email ?? '').toLowerCase().includes(q) ||
					String(u.staff_number ?? '').toLowerCase().includes(q)
				);
			}
			return true;
		});
	}, [users, typeFilters, deptFilters, search]);


	const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
	const pagedUsers = useMemo(() => {
		const start = (currentPage - 1) * pageSize;
		return filteredUsers.slice(start, start + pageSize);
	}, [filteredUsers, currentPage, pageSize]);

	const getRoleName = useCallback(
		(id: string) => roles.find((r) => r.id === id)?.name ?? '—',
		[roles],
	);

	const getDeptName = useCallback(
		(id?: string) => {
			if (!id) return '—';
			return departments.find((d) => d.id === id)?.name ?? '—';
		},
		[departments],
	);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (isDeptDropdownOpen && !(e.target as Element).closest('.dept-dropdown-container')) {
				setIsDeptDropdownOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [isDeptDropdownOpen]);

	// ── CRUD handlers ──────────────────────
	const handleCreate = useCallback(
		async (form: UserForm): Promise<void> => {
			const newUser = await createUser({
				username: form.username,
				password: form.password,
				staff_number: form.staff_number || undefined,
				full_name: form.full_name,
				email: form.email || undefined,
				department_id: form.department_id || undefined,
				role_id: form.role_id || undefined,
				account_type: form.account_type,
			});
			suppressRealtime();
			setUsers((prev) => [newUser, ...prev]);
			setShowCreate(false);
			showToast(`Đã cấp tài khoản cho ${newUser.full_name}`);
		},
		[showToast],
	);

	const handleEdit = useCallback(
		async (form: UserForm): Promise<void> => {
			if (!editUser) return;
			suppressRealtime();
			const updated = await updateUserApi(editUser.id, {
				staff_number: form.staff_number || undefined,
				full_name: form.full_name,
				email: form.email || undefined,
				department_id: form.department_id || undefined,
				role_id: form.role_id || undefined,
				account_type: form.account_type,
				is_active: form.is_active,
			});
			if (form.password) await resetUserPassword(editUser.id, form.password);
			setUsers((prev) =>
				prev.map((u) => (u.id === editUser.id ? updated : u)),
			);
			setEditUser(null);
			showToast('Đã cập nhật thông tin tài khoản');
		},
		[editUser, showToast],
	);

	const handleDelete = useCallback(async (): Promise<void> => {
		if (!deleteUser) return;
		await deleteUserApi(deleteUser.id);
		suppressRealtime();
		setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
		setDeleteUser(null);
		showToast(`Đã xoá tài khoản ${deleteUser.full_name}`, 'info');
	}, [deleteUser, showToast]);

	const handleToggleActive = useCallback(
		async (id: string) => {
			const target = users.find((u) => u.id === id);
			if (!target) return;
			try {
				const updated = await updateUserApi(id, {
					is_active: !target.is_active,
				});
				suppressRealtime();
				setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
				showToast(
					updated.is_active ? 'Đã kích hoạt tài khoản' : 'Đã khoá tài khoản',
					'info',
				);
			} catch {
				showToast('Không thể cập nhật trạng thái', 'error');
			}
		},
		[users, showToast],
	);

	// ── Header actions ──────────────────────
	const headerActions = (
		<button
			className={styles.btnGrantHeader}
			onClick={() => setShowCreate(true)}
		>
			<Ic.Key />
			Cấp tài khoản
		</button>
	);

	// ── Loading / error states ──────────────
	if (isLoadingData) {
		return (
			<AdminLayout
				pageTitle='Quản lý người dùng'
				pageSubtitle='Quản lý tài khoản cán bộ, nhân viên'
				headerActions={headerActions}
			>
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<Ic.Users />
					</div>
					<div className={styles.emptyTitle}>Đang tải dữ liệu...</div>
				</div>
			</AdminLayout>
		);
	}

	if (loadError) {
		return (
			<AdminLayout
				pageTitle='Quản lý người dùng'
				pageSubtitle='Quản lý tài khoản cán bộ, nhân viên'
				headerActions={headerActions}
			>
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<Ic.Info />
					</div>
					<div className={styles.emptyTitle}>Không tải được dữ liệu</div>
					<div className={styles.emptyDesc}>{loadError}</div>
				</div>
			</AdminLayout>
		);
	}

	return (
		<AdminLayout
			pageTitle='Quản lý người dùng'
			pageSubtitle='Quản lý tài khoản cán bộ, nhân viên'
			headerActions={headerActions}
		>
			{/* ── GLOBAL STATS ── */}
			<div className={styles.statsRow}>
				<div className={`${styles.statCard} ${styles.statGreen}`}>
					<div className={`${styles.statIcon} ${styles.iconGreen}`}>
						<Ic.Users />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{globalStats.total}</div>
						<div className={styles.statLabel}>Tổng tài khoản</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.statBlue}`}>
					<div className={`${styles.statIcon} ${styles.iconBlue}`}>
						<Ic.Check />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{globalStats.active}</div>
						<div className={styles.statLabel}>Đang hoạt động</div>
						<div className={`${styles.statDelta} ${styles.deltaUp}`}>
							{globalStats.total > 0
								? Math.round((globalStats.active / globalStats.total) * 100)
								: 0}
							% tổng tài khoản
						</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.statAmber}`}>
					<div className={`${styles.statIcon} ${styles.iconAmber}`}>
						<Ic.X />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{globalStats.inactive}</div>
						<div className={styles.statLabel}>Tạm khoá</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.statRed}`}>
					<div className={`${styles.statIcon} ${styles.iconRed}`}>
						<Ic.Key />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{globalStats.pwdWarn}</div>
						<div className={styles.statLabel}>Mật khẩu cũ &gt;90 ngày</div>
						<div className={`${styles.statDelta} ${styles.deltaDown}`}>
							Cần nhắc đổi mật khẩu
						</div>
					</div>
				</div>
			</div>

			{/* ── TOOLBAR & TABLE ── */}
			<div className={styles.tableWrap} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
				<div className={styles.toolbar}>
					<div className={styles.toolbarLeft}>
						<div className={styles.searchBox}>
							<Ic.Search />
							<input
								className={styles.searchInput}
								placeholder='Tìm theo tên, username, email...'
								value={search}
								onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
							/>
							{search && (
								<button
									className={styles.searchClear}
									onClick={() => { setSearch(''); setCurrentPage(1); }}
								>
									<Ic.X />
								</button>
							)}
						</div>
						
						{/* Multi-select Dept */}
						<div className='dept-dropdown-container' style={{ position: 'relative' }}>
							<button 
								className={`${styles.roleFilterBtn} ${deptFilters.length > 0 ? styles.roleFilterActive : ''}`}
								style={{ background: 'var(--color-gray-100)', border: '1px solid var(--color-gray-200)', height: 38, padding: '0 16px', borderRadius: 8, fontSize: 13 }}
								onClick={() => setIsDeptDropdownOpen(!isDeptDropdownOpen)}
							>
								Khoa/Phòng {deptFilters.length > 0 ? `(${deptFilters.length})` : ''}
								<Ic.ChevronDown style={{ width: 14, marginLeft: 4, transform: isDeptDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
							</button>
							
							{isDeptDropdownOpen && (
								<div style={{
									position: 'absolute',
									top: 'calc(100% + 4px)',
									left: 0,
									width: 300,
									maxHeight: 350,
									overflowY: 'auto',
									background: 'var(--color-white)',
									border: '1px solid var(--color-gray-200)',
									borderRadius: 8,
									boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
									zIndex: 100,
									display: 'flex',
									flexDirection: 'column',
									padding: 8,
									gap: 4
								}}>
									{departments.map(d => (
										<label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', borderRadius: 4, transition: 'background 0.1s' }}
											onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-gray-50)')}
											onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
										>
											<input type="checkbox" 
												checked={deptFilters.includes(d.id)}
												onChange={(e) => {
													if (e.target.checked) { setDeptFilters(p => [...p, d.id]); setCurrentPage(1); }
													else { setDeptFilters(p => p.filter(id => id !== d.id)); setCurrentPage(1); }
												}}
												style={{ cursor: 'pointer', accentColor: 'var(--color-primary)' }}
											/>
											<span style={{ fontSize: 13, color: 'var(--color-gray-800)', flex: 1 }}>{d.name}</span>
											<span style={{ fontSize: 11, color: 'var(--color-gray-400)', background: 'var(--color-gray-100)', padding: '2px 6px', borderRadius: 10 }}>
												{usersForDeptCount.filter(u => u.department_id === d.id).length}
											</span>
										</label>
									))}
								</div>
							)}
						</div>

						<div className={styles.roleFilters}>
							<button
								className={`${styles.roleFilterBtn} ${typeFilters.length === 0 ? styles.roleFilterActive : ''}`}
								onClick={() => { setTypeFilters([]); setCurrentPage(1); }}
							>
								Tất cả loại
								<span className={styles.roleFilterCount}>
									{usersForTypeCount.length}
								</span>
							</button>
							{ACCOUNT_TYPES.map((t) => (
								<button
									key={t.value}
									className={`${styles.roleFilterBtn} ${typeFilters.includes(t.value) ? styles.roleFilterActive : ''}`}
									onClick={() => {
										setTypeFilters(prev => 
											prev.includes(t.value) ? prev.filter(v => v !== t.value) : [...prev, t.value]
										);
										setCurrentPage(1);
									}}
								>
									{t.label}
									<span className={styles.roleFilterCount}>
										{usersForTypeCount.filter((u) => u.account_type === t.value).length}
									</span>
								</button>
							))}
						</div>
					</div>
					<div className={styles.toolbarRight}>
						<span className={styles.resultCount}>
							{filteredUsers.length} tài khoản
						</span>
					</div>
				</div>

				{/* USER TABLE */}
				<div className={styles.tableWrap} style={{ border: 'none', borderRadius: 0 }}>
					{filteredUsers.length === 0 ? (
						<div className={styles.emptyState}>
							<div className={styles.emptyIcon}>
								<Ic.Users />
							</div>
							<div className={styles.emptyTitle}>
								{search || typeFilters.length > 0 || deptFilters.length > 0
									? 'Không tìm thấy kết quả'
									: 'Chưa có tài khoản'}
							</div>
							<div className={styles.emptyDesc}>
								{search || typeFilters.length > 0 || deptFilters.length > 0
									? 'Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm'
									: 'Cấp tài khoản đầu tiên'}
							</div>
							{!search && typeFilters.length === 0 && deptFilters.length === 0 && (
								<button
									className={styles.btnGrantHeader}
									onClick={() => setShowCreate(true)}
									style={{ marginTop: 16 }}
								>
									<Ic.Key /> Cấp tài khoản
								</button>
							)}
						</div>
					) : (
						<table className={styles.table}>
							<thead>
								<tr>
									<th className={styles.th}>#</th>
									<th className={styles.th}>
										Người dùng
									</th>
									<th className={styles.th}>
										Khoa / Phòng
									</th>
									<th className={styles.th}>
										Đăng nhập / Mã NV
									</th>
									<th className={styles.th}>Vai trò</th>
									<th className={styles.th}>Loại TK</th>
									<th className={styles.th}>
										Trạng thái
									</th>
									<th className={styles.th}>Ngày tạo</th>
									<th
										className={`${styles.th} ${styles.thRight}`}
									>
										Thao tác
									</th>
								</tr>
							</thead>
							<tbody>
								{pagedUsers.map((u, i) => {
									const rowNum = (currentPage - 1) * pageSize + i + 1;
									const typeCfg =
										ACCOUNT_TYPE_CFG[
											u.account_type
										] ?? ACCOUNT_TYPE_CFG.member;
									return (
										<tr
											key={u.id}
											className={styles.tr}
										>
											<td
												className={`${styles.td} ${styles.tdIdx}`}
											>
												{rowNum}
											</td>
											<td className={styles.td}>
												<div
													className={
														styles.memberCell
													}
												>
													<Avatar
														name={u.full_name}
														cls={typeCfg.avatarCls}
														size='md'
													/>
													<div>
														<div
															className={
																styles.memberName
															}
														>
															{u.full_name}
														</div>
														<div
															className={
																styles.memberId
															}
														>
															{u.id}
														</div>
													</div>
												</div>
											</td>
											<td className={styles.td}>
												<div style={{ fontSize: 13, color: 'var(--color-gray-700)', fontWeight: 500 }}>
													{getDeptName(u.department_id)}
												</div>
											</td>
											<td className={styles.td}>
												<div>
													<div
														className={
															styles.usernameText
														}
													>
														{u.username}
													</div>
													<div
														className={
															styles.staffNum
														}
													>
														MNV:{' '}
														{u.staff_number ?? '—'}
													</div>
												</div>
											</td>
											<td className={styles.td}>
												<span
													className={styles.roleText}
												>
													{getRoleName(u.role_id)}
												</span>
											</td>
											<td className={styles.td}>
												<Badge
													cls={typeCfg.cls}
													dot
												>
													{typeCfg.label}
												</Badge>
											</td>
											<td className={styles.td}>
												<div
													className={
														styles.statusToggle
													}
												>
													<Toggle
														on={u.is_active}
														onChange={() =>
															handleToggleActive(
																u.id,
															)
														}
													/>
													<span
														style={{
															fontSize: 11,
															fontWeight: 600,
															color: u.is_active
																? 'var(--color-primary-dark)'
																: 'var(--color-gray-400)',
														}}
													>
														{u.is_active
															? 'Hoạt động'
															: 'Khoá'}
													</span>
												</div>
											</td>
											<td className={styles.td}>
												<span
													className={styles.dateText}
												>
													{formatDate(u.created_at)}
												</span>
											</td>
											<td
												className={`${styles.td} ${styles.tdActions}`}
											>
												<button
													className={`${styles.actionBtn} ${styles.actionEdit}`}
													title='Chỉnh sửa'
													onClick={() =>
														setEditUser(u)
													}
												>
													<Ic.Edit />
												</button>
												<button
													className={`${styles.actionBtn} ${styles.actionDelete}`}
													title='Xoá'
													onClick={() =>
														setDeleteUser(u)
													}
												>
													<Ic.Trash />
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}

					{/* ── PAGINATION BAR ── */}
					{filteredUsers.length > 0 && (
						<div className={styles.paginationBar}>
							<div className={styles.paginationInfo}>
								Hiển thị{' '}
								<strong>{(currentPage - 1) * pageSize + 1}</strong>
								{' – '}
								<strong>{Math.min(currentPage * pageSize, filteredUsers.length)}</strong>
								{' / '}
								<strong>{filteredUsers.length}</strong> bản ghi
							</div>

							<div className={styles.paginationControls}>
								{/* Per-page selector */}
								<div className={styles.pageSizeSelector}>
									<span className={styles.pageSizeLabel}>Hiển thị</span>
									<select
										className={styles.pageSizeSelect}
										value={pageSize}
										onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
									>
										{[10, 20, 50, 100].map((n) => (
											<option key={n} value={n}>{n}</option>
										))}
									</select>
									<span className={styles.pageSizeLabel}>/ trang</span>
								</div>

								{/* Page buttons */}
								<div className={styles.pageButtons}>
									<button
										className={styles.pageBtn}
										onClick={() => setCurrentPage(1)}
										disabled={currentPage === 1}
										title='Trang đầu'
									>«</button>
									<button
										className={styles.pageBtn}
										onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
										disabled={currentPage === 1}
										title='Trang trước'
									>‹</button>

									{/* Page number pills */}
									{Array.from({ length: totalPages }, (_, i) => i + 1)
										.filter((p) =>
											p === 1 ||
											p === totalPages ||
											Math.abs(p - currentPage) <= 1
										)
										.reduce<(number | 'ellipsis-start' | 'ellipsis-end')[]>((acc, p, idx, arr) => {
											if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) {
												acc.push(idx === 1 ? 'ellipsis-start' : 'ellipsis-end');
											}
											acc.push(p);
											return acc;
										}, [])
										.map((item, idx) =>
											typeof item === 'string' ? (
												<span key={item + idx} className={styles.pageEllipsis}>…</span>
											) : (
												<button
													key={item}
													className={`${styles.pageBtn} ${item === currentPage ? styles.pageBtnActive : ''}`}
													onClick={() => setCurrentPage(item)}
												>{item}</button>
											)
										)}

									<button
										className={styles.pageBtn}
										onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
										disabled={currentPage === totalPages}
										title='Trang sau'
									>›</button>
									<button
										className={styles.pageBtn}
										onClick={() => setCurrentPage(totalPages)}
										disabled={currentPage === totalPages}
										title='Trang cuối'
									>»</button>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* ── MODALS ── */}
			{showCreate && (
				<UserModal
					mode='create'
					departments={departments}
					roles={roles}
					defaultDeptId={departments[0]?.id ?? ''}
					onClose={() => setShowCreate(false)}
					onSave={handleCreate}
				/>
			)}
			{editUser && (
				<UserModal
					mode='edit'
					user={editUser}
					departments={departments}
					roles={roles}
					onClose={() => setEditUser(null)}
					onSave={handleEdit}
				/>
			)}
			{deleteUser && (
				<DeleteModal
					user={deleteUser}
					onClose={() => setDeleteUser(null)}
					onConfirm={handleDelete}
				/>
			)}

			{/* ── TOAST ── */}
			{toast && (
				<div
					className={`${styles.toast} ${styles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}` as keyof typeof styles]}`}
				>
					{toast.type === 'success' && <Ic.Check />}
					{toast.type === 'error' && <Ic.X />}
					{toast.type === 'info' && <Ic.Info />}
					{toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
