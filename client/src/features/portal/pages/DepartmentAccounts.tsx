import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CheckSvg from '../../../assets/svg/check.svg?react';
import ChevDSvg from '../../../assets/svg/chev-d.svg?react';
import EditSvg from '../../../assets/svg/edit.svg?react';
import InfoSvg from '../../../assets/svg/info.svg?react';
import KeySvg from '../../../assets/svg/key.svg?react';
import SearchSvg from '../../../assets/svg/search.svg?react';
import TrashSvg from '../../../assets/svg/trash.svg?react';
import UsersSvg from '../../../assets/svg/users.svg?react';
import WarnSvg from '../../../assets/svg/warn.svg?react';
import XSvg from '../../../assets/svg/x.svg?react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import UserLayout from '../../../layouts/UserLayout';
import { getStoredUser, type StoredUser } from '../../../lib/authStorage';
import {
	deleteUser as deleteUserApi,
	getRolesList,
	getUsers,
	resetUserPassword,
	updateUser as updateUserApi,
	type SimpleItem,
} from '../../user/api/userApi';
import type { AccountType, FormErrors, User } from '../../user/types/user.type';
import styles from './DepartmentAccounts.module.css';

// ─── CONSTANTS ────────────────────────────
const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
	{ value: 'manager', label: 'Quản lý' },
	{ value: 'reviewer', label: 'Thẩm định' },
	{ value: 'dept', label: 'TK Khoa' },
	{ value: 'member', label: 'Thành viên' },
];

const ACCOUNT_TYPE_CFG: Record<
	AccountType,
	{ label: string; cls: string; avatarCls: string }
> = {
	admin: { label: 'Quản trị', cls: 'rolePurple', avatarCls: 'avatarPurple' },
	director: { label: 'Giám đốc', cls: 'roleRed', avatarCls: 'avatarRed' },
	reviewer: { label: 'Thẩm định', cls: 'roleGray', avatarCls: 'avatarGray' },
	manager: { label: 'Quản lý', cls: 'roleBlue', avatarCls: 'avatarBlue' },
	dept: { label: 'TK Khoa', cls: 'roleAmber', avatarCls: 'avatarAmber' },
	member: { label: 'Thành viên', cls: 'roleGreen', avatarCls: 'avatarGreen' },
};

// Types a dept manager can assign (only dept-level and below)
const EDITABLE_ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
	{ value: 'dept', label: 'TK Khoa' },
	{ value: 'member', label: 'Thành viên' },
];

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

// ─── ICONS ────────────────────────────────
const Ic = {
	Users: UsersSvg,
	Edit: EditSvg,
	Trash: TrashSvg,
	Check: CheckSvg,
	X: XSvg,
	Search: SearchSvg,
	ChevronDown: ChevDSvg,
	Info: InfoSvg,
	Warn: WarnSvg,
	Key: KeySvg,
};

// ─── BADGE ────────────────────────────────
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
	size?: 'sm' | 'md';
}) {
	const sizeCls = size === 'sm' ? styles.avatarSm : styles.avatarMd;
	return (
		<div
			className={`${styles.avatar} ${styles[cls as keyof typeof styles]} ${sizeCls}`}
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

// ─── EDIT FORM TYPE ───────────────────────
interface EditForm {
	full_name: string;
	staff_number: string;
	email: string;
	role_id: string;
	account_type: AccountType;
	is_active: boolean;
	password: string;
}

// ─── EDIT MODAL ───────────────────────────
interface EditModalProps {
	user: User;
	deptName: string;
	onClose: () => void;
	onSave: (form: EditForm) => Promise<void>;
}

function EditModal({ user, deptName, onClose, onSave }: EditModalProps) {
	const [form, setForm] = useState<EditForm>({
		full_name: user.full_name,
		staff_number: user.staff_number != null ? String(user.staff_number) : '',
		email: user.email ?? '',
		role_id: user.role_id ?? '',
		account_type: user.account_type,
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
		if (form.password && form.password.length < 5)
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
						style={{ background: '#e6f1fb', color: '#0c447c' }}
					>
						<Ic.Edit />
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
							hint='Để trống nếu không muốn đổi mật khẩu'
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
										<Ic.Info />
									</button>
								</div>
								<button
									type='button'
									onClick={() => set('password', '123456')}
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
									Mặc định
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
									{EDITABLE_ACCOUNT_TYPES.map((t) => (
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
								<Ic.Check /> Lưu thay đổi
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── DELETE MODAL ─────────────────────────
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
								<Ic.Trash /> Xác nhận xoá
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── RESET PASSWORD MODAL ─────────────────
function ResetPasswordModal({
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
						<Ic.Key />
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
								<Ic.Key /> Xác nhận
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── MAIN PAGE ────────────────────────────
export default function DepartmentAccounts() {
	const currentUser = getStoredUser<StoredUser>();
	const deptId = currentUser?.department_id ?? null;
	const deptName = currentUser?.department ?? 'Khoa của tôi';

	const [users, setUsers] = useState<User[]>([]);
	const [roles, setRoles] = useState<SimpleItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [search, setSearch] = useState('');
	const [typeFilter, setTypeFilter] = useState<AccountType | 'all'>('all');
	const [refreshKey, setRefreshKey] = useState(0);
	const [editUser, setEditUser] = useState<User | null>(null);
	const [deleteUser, setDeleteUser] = useState<User | null>(null);
	const [resetUser, setResetUser] = useState<User | null>(null);
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

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('user', refreshData);

	useEffect(() => {
		const load = async () => {
			if (!deptId) {
				setIsLoading(false);
				setLoadError('Tài khoản của bạn chưa được gán vào khoa/phòng ban nào.');
				return;
			}
			setIsLoading(true);
			setLoadError(null);
			try {
				const [usersRes, rolesRes] = await Promise.all([
					getUsers({ department_id: deptId, limit: 200 }),
					getRolesList(),
				]);
				setUsers(usersRes.data);
				setRoles(rolesRes.data);
			} catch (err) {
				setLoadError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
			} finally {
				setIsLoading(false);
			}
		};
		void load();
	}, [deptId, refreshKey]);

	// ── Stats ──────────────────────────────
	const stats = useMemo(
		() => ({
			total: users.length,
			active: users.filter((u) => u.is_active).length,
			locked: users.filter((u) => !u.is_active).length,
		}),
		[users],
	);

	// ── Filtered list ──────────────────────
	const filteredUsers = useMemo(() => {
		return users.filter((u) => {
			if (typeFilter !== 'all' && u.account_type !== typeFilter) return false;
			if (search) {
				const q = search.toLowerCase();
				return (
					u.full_name.toLowerCase().includes(q) ||
					u.username.toLowerCase().includes(q) ||
					(u.email ?? '').toLowerCase().includes(q) ||
					(u.staff_number ?? '').toLowerCase().includes(q)
				);
			}
			return true;
		});
	}, [users, typeFilter, search]);

	const getRoleName = useCallback(
		(id: string) => roles.find((r) => r.id === id)?.name ?? '—',
		[roles],
	);

	// ── CRUD handlers ──────────────────────
	const handleEdit = useCallback(
		async (form: EditForm): Promise<void> => {
			if (!editUser) return;
			const updated = await updateUserApi(editUser.id, {
				staff_number: form.staff_number || undefined,
				full_name: form.full_name,
				email: form.email || undefined,
				role_id: form.role_id || undefined,
				account_type: form.account_type,
				is_active: form.is_active,
			});
			if (form.password) await resetUserPassword(editUser.id, form.password);
			setUsers((prev) => prev.map((u) => (u.id === editUser.id ? updated : u)));
			setEditUser(null);
			showToast('Đã cập nhật thông tin tài khoản');
		},
		[editUser, showToast],
	);

	const handleDelete = useCallback(async (): Promise<void> => {
		if (!deleteUser) return;
		await deleteUserApi(deleteUser.id);
		setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
		setDeleteUser(null);
		showToast(`Đã xoá tài khoản ${deleteUser.full_name}`, 'info');
	}, [deleteUser, showToast]);

	const handleResetPassword = useCallback(async (): Promise<void> => {
		if (!resetUser) return;
		await resetUserPassword(resetUser.id, '123456');
		setResetUser(null);
		showToast(
			`Đã đặt lại mật khẩu của ${resetUser.full_name} về mặc định`,
			'info',
		);
	}, [resetUser, showToast]);

	const handleToggleActive = useCallback(
		async (id: string) => {
			const target = users.find((u) => u.id === id);
			if (!target) return;
			try {
				const updated = await updateUserApi(id, {
					is_active: !target.is_active,
				});
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

	// ── Loading / error states ──────────────
	if (isLoading) {
		return (
			<UserLayout
				pageTitle='Tài khoản trong khoa'
				pageSubtitle={deptName ?? ''}
			>
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<Ic.Users />
					</div>
					<div className={styles.emptyTitle}>Đang tải dữ liệu...</div>
				</div>
			</UserLayout>
		);
	}

	if (loadError) {
		return (
			<UserLayout
				pageTitle='Tài khoản trong khoa'
				pageSubtitle={deptName ?? ''}
			>
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<Ic.Info />
					</div>
					<div className={styles.emptyTitle}>Không tải được dữ liệu</div>
					<div className={styles.emptyDesc}>{loadError}</div>
				</div>
			</UserLayout>
		);
	}

	return (
		<UserLayout
			pageTitle='Tài khoản trong khoa'
			pageSubtitle={`Xem và quản lý tài khoản — ${deptName}`}
		>
			{/* ── STATS ── */}
			<div className={styles.statsRow}>
				<div className={`${styles.statCard} ${styles.statGreen}`}>
					<div className={`${styles.statIcon} ${styles.iconGreen}`}>
						<Ic.Users />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{stats.total}</div>
						<div className={styles.statLabel}>Tổng tài khoản</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.statBlue}`}>
					<div className={`${styles.statIcon} ${styles.iconBlue}`}>
						<Ic.Check />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{stats.active}</div>
						<div className={styles.statLabel}>Đang hoạt động</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.statAmber}`}>
					<div className={`${styles.statIcon} ${styles.iconAmber}`}>
						<Ic.X />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{stats.locked}</div>
						<div className={styles.statLabel}>Tạm khoá</div>
					</div>
				</div>
			</div>

			{/* ── PANEL ── */}
			<div className={styles.panel}>
				{/* TOOLBAR */}
				<div className={styles.toolbar}>
					<div className={styles.toolbarLeft}>
						<div className={styles.searchBox}>
							<Ic.Search />
							<input
								className={styles.searchInput}
								placeholder='Tìm theo tên, username, email, mã NV...'
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
							{search && (
								<button
									className={styles.searchClear}
									onClick={() => setSearch('')}
								>
									<Ic.X />
								</button>
							)}
						</div>
						<div className={styles.roleFilters}>
							<button
								className={`${styles.roleFilterBtn} ${typeFilter === 'all' ? styles.roleFilterActive : ''}`}
								onClick={() => setTypeFilter('all')}
							>
								Tất cả
								<span className={styles.roleFilterCount}>{users.length}</span>
							</button>
							{ACCOUNT_TYPES.map((t) => (
								<button
									key={t.value}
									className={`${styles.roleFilterBtn} ${typeFilter === t.value ? styles.roleFilterActive : ''}`}
									onClick={() => setTypeFilter(t.value)}
								>
									{t.label}
									<span className={styles.roleFilterCount}>
										{users.filter((u) => u.account_type === t.value).length}
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

				{/* TABLE */}
				<div className={styles.tableWrap}>
					{filteredUsers.length === 0 ? (
						<div className={styles.emptyState}>
							<div className={styles.emptyIcon}>
								<Ic.Users />
							</div>
							<div className={styles.emptyTitle}>
								{search || typeFilter !== 'all'
									? 'Không tìm thấy kết quả'
									: 'Chưa có tài khoản trong khoa'}
							</div>
							<div className={styles.emptyDesc}>
								{search || typeFilter !== 'all'
									? 'Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm'
									: 'Liên hệ quản trị viên để cấp tài khoản'}
							</div>
						</div>
					) : (
						<table className={styles.table}>
							<thead>
								<tr>
									<th className={styles.th}>#</th>
									<th className={styles.th}>Người dùng</th>
									<th className={styles.th}>Đăng nhập / Mã NV</th>
									<th className={styles.th}>Vai trò</th>
									<th className={styles.th}>Loại TK</th>
									<th className={styles.th}>Trạng thái</th>
									<th className={styles.th}>Ngày tạo</th>
									<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
								</tr>
							</thead>
							<tbody>
								{filteredUsers.map((u, i) => {
									const typeCfg =
										ACCOUNT_TYPE_CFG[u.account_type] ?? ACCOUNT_TYPE_CFG.member;
									return (
										<tr
											key={u.id}
											className={styles.tr}
										>
											<td className={`${styles.td} ${styles.tdIdx}`}>
												{i + 1}
											</td>
											<td className={styles.td}>
												<div className={styles.memberCell}>
													<Avatar
														name={u.full_name}
														cls={typeCfg.avatarCls}
													/>
													<div>
														<div className={styles.memberName}>
															{u.full_name}
														</div>
														<div className={styles.memberId}>{u.id}</div>
													</div>
												</div>
											</td>
											<td className={styles.td}>
												<div>
													<div className={styles.usernameText}>
														{u.username}
													</div>
													<div className={styles.staffNum}>
														MNV: {u.staff_number ?? '—'}
													</div>
												</div>
											</td>
											<td className={styles.td}>
												<span className={styles.roleText}>
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
												<div className={styles.statusToggle}>
													<Toggle
														on={u.is_active}
														onChange={() => handleToggleActive(u.id)}
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
														{u.is_active ? 'Hoạt động' : 'Khoá'}
													</span>
												</div>
											</td>
											<td className={styles.td}>
												<span className={styles.dateText}>
													{formatDate(u.created_at)}
												</span>
											</td>
											<td className={`${styles.td} ${styles.tdActions}`}>
												<button
													className={`${styles.actionBtn} ${styles.actionEdit}`}
													title='Chỉnh sửa'
													onClick={() => setEditUser(u)}
												>
													<Ic.Edit />
												</button>
												<button
													className={`${styles.actionBtn}`}
													title='Đặt lại mật khẩu về 123456'
													onClick={() => setResetUser(u)}
													style={{ color: '#b45309' }}
												>
													<Ic.Key />
												</button>
												<button
													className={`${styles.actionBtn} ${styles.actionDelete}`}
													title='Xoá'
													onClick={() => setDeleteUser(u)}
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
				</div>
			</div>

			{/* ── MODALS ── */}
			{editUser && (
				<EditModal
					user={editUser}
					deptName={deptName ?? ''}
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
			{resetUser && (
				<ResetPasswordModal
					user={resetUser}
					onClose={() => setResetUser(null)}
					onConfirm={handleResetPassword}
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
		</UserLayout>
	);
}
