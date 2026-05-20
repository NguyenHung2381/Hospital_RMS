import { useState, useEffect, useMemo } from 'react';
import UserLayout from '../../../layouts/UserLayout';
import styles from './Profile.module.css';
import { getStoredUser } from '../../../lib/authStorage';
import { apiClient } from '../../../lib/apiClient';

// ─── TYPES ────────────────────────────────
interface ProfileData {
	id: string;
	username: string;
	full_name: string;
	email: string;
	staff_number: string | null;
	department_id: string | null;
	role: string | null;
	account_type: string;
	is_active: boolean;
	password_changed_at: string | null;
	created_at: string;
}

// ─── HELPERS ──────────────────────────────
function fmtDate(iso: string | null) {
	if (!iso) return '—';
	return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getInitials(name: string) {
	return name
		.split(' ')
		.map((w) => w[0])
		.filter(Boolean)
		.slice(-2)
		.join('')
		.toUpperCase();
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
	admin:   'Quản trị viên',
	manager: 'Quản lý',
	member:  'Thành viên',
	viewer:  'Người xem',
};

// ─── ICONS ────────────────────────────────
const Icon = {
	User: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' /><circle cx='12' cy='7' r='4' />
		</svg>
	),
	Lock: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<rect x='3' y='11' width='18' height='11' rx='2' ry='2' />
			<path d='M7 11V7a5 5 0 0 1 10 0v4' />
		</svg>
	),
	Eye: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' /><circle cx='12' cy='12' r='3' />
		</svg>
	),
	EyeOff: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<path d='M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' />
			<line x1='1' y1='1' x2='23' y2='23' />
		</svg>
	),
	Check: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
			<polyline points='20 6 9 17 4 12' />
		</svg>
	),
	AlertCircle: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<circle cx='12' cy='12' r='10' /><line x1='12' y1='8' x2='12' y2='12' /><line x1='12' y1='16' x2='12.01' y2='16' />
		</svg>
	),
	Mail: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<path d='M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z' />
			<polyline points='22,6 12,13 2,6' />
		</svg>
	),
	Badge: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<circle cx='12' cy='8' r='6' /><path d='M15.477 12.89L17 22l-5-3-5 3 1.523-9.11' />
		</svg>
	),
	Calendar: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<rect x='3' y='4' width='18' height='18' rx='2' ry='2' />
			<line x1='16' y1='2' x2='16' y2='6' /><line x1='8' y1='2' x2='8' y2='6' /><line x1='3' y1='10' x2='21' y2='10' />
		</svg>
	),
};

// ─── COMPONENT ────────────────────────────
export default function Profile() {
	const storedUser = useMemo(() => getStoredUser<Record<string, string>>(), []);

	const fullName = storedUser?.full_name ?? storedUser?.username ?? 'Người dùng';
	const userRole = storedUser?.role ?? storedUser?.role_name ?? 'Thành viên';
	const initials = getInitials(fullName);

	// ── Profile data ──
	const [profile, setProfile] = useState<ProfileData | null>(null);
	const [loadingProfile, setLoadingProfile] = useState(true);

	useEffect(() => {
		apiClient
			.get<ProfileData>('/users/me')
			.then((profileData) => setProfile(profileData))
			.catch(() => {
				if (storedUser) {
					setProfile({
						id: storedUser.id ?? '',
						username: storedUser.username ?? '',
						full_name: storedUser.full_name ?? storedUser.username ?? '',
						email: storedUser.email ?? '',
						staff_number: storedUser.staff_number ?? null,
						department_id: storedUser.department_id ?? null,
						role: storedUser.role ?? storedUser.role_name ?? null,
						account_type: storedUser.account_type ?? 'member',
						is_active: true,
						password_changed_at: null,
						created_at: new Date().toISOString(),
					});
				}
			})
			.finally(() => setLoadingProfile(false));
	}, [storedUser]);

	// ── Change password ──
	const [oldPwd, setOldPwd] = useState('');
	const [newPwd, setNewPwd] = useState('');
	const [confirmPwd, setConfirmPwd] = useState('');
	const [showOld, setShowOld] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);
	const [pwdError, setPwdError] = useState('');
	const [pwdSaving, setPwdSaving] = useState(false);
	const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

	function showToast(msg: string, type: 'success' | 'error') {
		setToast({ msg, type });
		setTimeout(() => setToast(null), 3500);
	}

	async function handleChangePassword() {
		setPwdError('');
		if (!oldPwd) { setPwdError('Vui lòng nhập mật khẩu hiện tại.'); return; }
		if (newPwd.length < 6) { setPwdError('Mật khẩu mới phải có ít nhất 6 ký tự.'); return; }
		if (newPwd !== confirmPwd) { setPwdError('Mật khẩu xác nhận không khớp.'); return; }

		setPwdSaving(true);
		try {
			await apiClient.post('/auth/change-password', { old_password: oldPwd, new_password: newPwd });
			setOldPwd('');
			setNewPwd('');
			setConfirmPwd('');
			showToast('Đổi mật khẩu thành công!', 'success');
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : 'Có lỗi xảy ra, vui lòng thử lại.';
			showToast(msg, 'error');
		} finally {
			setPwdSaving(false);
		}
	}

	return (
		<UserLayout
			pageTitle='Hồ sơ cá nhân'
			pageSubtitle='Xem và quản lý thông tin tài khoản của bạn'
			breadcrumbs={[{ label: 'Hồ sơ cá nhân' }]}
			userName={fullName}
			userRole={userRole}
			userInitials={initials}
		>
			<div className={styles.pageGrid}>
				{/* ── LEFT COL ── */}
				<div className={styles.leftCol}>
					{/* Avatar card */}
					<div className={styles.avatarCard}>
						<div className={styles.avatarCircle}>{initials}</div>
						<div className={styles.avatarName}>{fullName}</div>
						<div className={styles.avatarRole}>{userRole}</div>
						{profile && (
							<span
								className={styles.activeBadge}
								style={profile.is_active ? {} : { background: '#fee2e2', color: '#991b1b' }}
							>
								{profile.is_active ? 'Đang hoạt động' : 'Đã khoá'}
							</span>
						)}
					</div>

					{/* Quick info */}
					{profile && (
						<div className={styles.infoCard}>
							<div className={styles.infoCardHeader}>Thông tin nhanh</div>
							<div className={styles.infoList}>
								<div className={styles.infoRow}>
									<span className={styles.infoIcon}><Icon.User /></span>
									<div className={styles.infoContent}>
										<div className={styles.infoLabel}>Tên đăng nhập</div>
										<div className={styles.infoValue}>{profile.username}</div>
									</div>
								</div>
								<div className={styles.infoRow}>
									<span className={styles.infoIcon}><Icon.Mail /></span>
									<div className={styles.infoContent}>
										<div className={styles.infoLabel}>Email</div>
										<div className={styles.infoValue}>{profile.email || '—'}</div>
									</div>
								</div>
								<div className={styles.infoRow}>
									<span className={styles.infoIcon}><Icon.Badge /></span>
									<div className={styles.infoContent}>
										<div className={styles.infoLabel}>Mã nhân viên</div>
										<div className={styles.infoValue}>{profile.staff_number ?? '—'}</div>
									</div>
								</div>
								<div className={styles.infoRow}>
									<span className={styles.infoIcon}><Icon.Calendar /></span>
									<div className={styles.infoContent}>
										<div className={styles.infoLabel}>Ngày tạo tài khoản</div>
										<div className={styles.infoValue}>{fmtDate(profile.created_at)}</div>
									</div>
								</div>
								<div className={styles.infoRow}>
									<span className={styles.infoIcon}><Icon.Lock /></span>
									<div className={styles.infoContent}>
										<div className={styles.infoLabel}>Đổi mật khẩu lần cuối</div>
										<div className={styles.infoValue}>{fmtDate(profile.password_changed_at)}</div>
									</div>
								</div>
							</div>
						</div>
					)}

					{loadingProfile && (
						<div className={styles.loadingBox}>
							<div className={styles.spinner} />
							<span>Đang tải thông tin...</span>
						</div>
					)}
				</div>

				{/* ── RIGHT COL ── */}
				<div className={styles.rightCol}>
					{/* Account details */}
					{profile && (
						<div className={styles.detailCard}>
							<div className={styles.detailCardHeader}>
								<div className={styles.detailCardIcon} style={{ background: '#dbeafe', color: '#1a6abd' }}>
									<Icon.User />
								</div>
								<div>
									<div className={styles.detailCardTitle}>Thông tin tài khoản</div>
									<div className={styles.detailCardSub}>Chi tiết hồ sơ người dùng</div>
								</div>
							</div>

							<div className={styles.detailGrid}>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Họ và tên</div>
									<div className={styles.detailValue}>{profile.full_name}</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Tên đăng nhập</div>
									<div className={styles.detailValue} style={{ fontFamily: 'var(--font-mono)' }}>{profile.username}</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Email</div>
									<div className={styles.detailValue}>{profile.email || '—'}</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Mã nhân viên</div>
									<div className={styles.detailValue}>{profile.staff_number ?? '—'}</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Chức vụ / Vai trò</div>
									<div className={styles.detailValue}>{profile.role ?? userRole}</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Loại tài khoản</div>
									<div className={styles.detailValue}>
										{ACCOUNT_TYPE_LABEL[profile.account_type] ?? profile.account_type}
									</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Trạng thái</div>
									<div className={styles.detailValue}>
										<span className={styles.statusChip} style={
											profile.is_active
												? { background: '#dcfce7', color: '#166534' }
												: { background: '#fee2e2', color: '#991b1b' }
										}>
											{profile.is_active ? 'Hoạt động' : 'Đã khoá'}
										</span>
									</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Ngày tạo</div>
									<div className={styles.detailValue}>{fmtDate(profile.created_at)}</div>
								</div>
							</div>
						</div>
					)}

					{/* Change password */}
					<div className={styles.detailCard}>
						<div className={styles.detailCardHeader}>
							<div className={styles.detailCardIcon} style={{ background: '#fef3c7', color: '#92400e' }}>
								<Icon.Lock />
							</div>
							<div>
								<div className={styles.detailCardTitle}>Đổi mật khẩu</div>
								<div className={styles.detailCardSub}>Mật khẩu mới phải có ít nhất 6 ký tự</div>
							</div>
						</div>

						<div className={styles.pwdForm}>
							{/* Old password */}
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Mật khẩu hiện tại</label>
								<div className={styles.pwdInput}>
									<input
										type={showOld ? 'text' : 'password'}
										className={styles.formInput}
										placeholder='Nhập mật khẩu hiện tại...'
										value={oldPwd}
										onChange={(e) => { setOldPwd(e.target.value); setPwdError(''); }}
									/>
									<button
										type='button'
										className={styles.eyeBtn}
										onClick={() => setShowOld((v) => !v)}
										aria-label={showOld ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
									>
										{showOld ? <Icon.EyeOff /> : <Icon.Eye />}
									</button>
								</div>
							</div>

							{/* New password */}
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Mật khẩu mới</label>
								<div className={styles.pwdInput}>
									<input
										type={showNew ? 'text' : 'password'}
										className={styles.formInput}
										placeholder='Nhập mật khẩu mới...'
										value={newPwd}
										onChange={(e) => { setNewPwd(e.target.value); setPwdError(''); }}
									/>
									<button
										type='button'
										className={styles.eyeBtn}
										onClick={() => setShowNew((v) => !v)}
										aria-label={showNew ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
									>
										{showNew ? <Icon.EyeOff /> : <Icon.Eye />}
									</button>
								</div>
								{newPwd.length > 0 && (
									<div className={styles.strengthBar}>
										<div
											className={styles.strengthFill}
											style={{
												width: newPwd.length < 6 ? '33%' : newPwd.length < 10 ? '66%' : '100%',
												background: newPwd.length < 6 ? '#ef4444' : newPwd.length < 10 ? '#f59e0b' : '#22c55e',
											}}
										/>
									</div>
								)}
							</div>

							{/* Confirm password */}
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Xác nhận mật khẩu mới</label>
								<div className={styles.pwdInput}>
									<input
										type={showConfirm ? 'text' : 'password'}
										className={styles.formInput}
										placeholder='Nhập lại mật khẩu mới...'
										value={confirmPwd}
										onChange={(e) => { setConfirmPwd(e.target.value); setPwdError(''); }}
									/>
									<button
										type='button'
										className={styles.eyeBtn}
										onClick={() => setShowConfirm((v) => !v)}
										aria-label={showConfirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
									>
										{showConfirm ? <Icon.EyeOff /> : <Icon.Eye />}
									</button>
								</div>
								{confirmPwd && newPwd && (
									<div className={styles.matchHint} style={{ color: confirmPwd === newPwd ? '#22c55e' : '#ef4444' }}>
										{confirmPwd === newPwd ? '✓ Mật khẩu khớp' : '✗ Mật khẩu không khớp'}
									</div>
								)}
							</div>

							{pwdError && (
								<div className={styles.errorMsg}>
									<Icon.AlertCircle /> {pwdError}
								</div>
							)}

							<div className={styles.pwdFooter}>
								<button
									type='button'
									className={styles.btnPrimary}
									onClick={handleChangePassword}
									disabled={pwdSaving}
								>
									{pwdSaving ? <span className={styles.spinner} style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff' }} /> : <Icon.Check />}
									{pwdSaving ? 'Đang lưu...' : 'Đổi mật khẩu'}
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Toast */}
			{toast && (
				<div className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}>
					{toast.type === 'success' ? <Icon.Check /> : <Icon.AlertCircle />}
					{toast.msg}
				</div>
			)}
		</UserLayout>
	);
}
