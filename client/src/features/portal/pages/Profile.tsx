import { useEffect, useMemo, useState } from 'react';
import AlertSvg from '../../../assets/svg/alert.svg?react';
import BadgeSvg from '../../../assets/svg/badge.svg?react';
import CalendarSvg from '../../../assets/svg/calendar.svg?react';
import CheckSvg from '../../../assets/svg/check.svg?react';
import EyeOffSvg from '../../../assets/svg/eye-off.svg?react';
import EyeSvg from '../../../assets/svg/eye.svg?react';
import LockSvg from '../../../assets/svg/lock.svg?react';
import MailSvg from '../../../assets/svg/mail.svg?react';
import UserSvg from '../../../assets/svg/user.svg?react';
import UserLayout from '../../../layouts/UserLayout';
import { apiClient } from '../../../lib/apiClient';
import { getStoredUser } from '../../../lib/authStorage';
import styles from './Profile.module.css';

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
	return new Date(iso).toLocaleDateString('vi-VN', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	});
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
	admin: 'Quản trị viên',
	manager: 'Quản lý',
	member: 'Thành viên',
	viewer: 'Người xem',
};

// ─── COMPONENT ────────────────────────────
export default function Profile() {
	const storedUser = useMemo(() => getStoredUser<Record<string, string>>(), []);

	const fullName =
		storedUser?.full_name ?? storedUser?.username ?? 'Người dùng';
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
	const [toast, setToast] = useState<{
		msg: string;
		type: 'success' | 'error';
	} | null>(null);

	function showToast(msg: string, type: 'success' | 'error') {
		setToast({ msg, type });
		setTimeout(() => setToast(null), 3500);
	}

	async function handleChangePassword() {
		setPwdError('');
		if (!oldPwd) {
			setPwdError('Vui lòng nhập mật khẩu hiện tại.');
			return;
		}
		if (newPwd.length < 6) {
			setPwdError('Mật khẩu mới phải có ít nhất 6 ký tự.');
			return;
		}
		if (newPwd !== confirmPwd) {
			setPwdError('Mật khẩu xác nhận không khớp.');
			return;
		}

		setPwdSaving(true);
		try {
			await apiClient.post('/auth/change-password', {
				old_password: oldPwd,
				new_password: newPwd,
			});
			setOldPwd('');
			setNewPwd('');
			setConfirmPwd('');
			showToast('Đổi mật khẩu thành công!', 'success');
		} catch (e: unknown) {
			const msg =
				e instanceof Error ? e.message : 'Có lỗi xảy ra, vui lòng thử lại.';
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
								style={
									profile.is_active
										? {}
										: { background: '#fee2e2', color: '#991b1b' }
								}
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
									<span className={styles.infoIcon}>
										<UserSvg />
									</span>
									<div className={styles.infoContent}>
										<div className={styles.infoLabel}>Tên đăng nhập</div>
										<div className={styles.infoValue}>{profile.username}</div>
									</div>
								</div>
								<div className={styles.infoRow}>
									<span className={styles.infoIcon}>
										<MailSvg />
									</span>
									<div className={styles.infoContent}>
										<div className={styles.infoLabel}>Email</div>
										<div className={styles.infoValue}>
											{profile.email || '—'}
										</div>
									</div>
								</div>
								<div className={styles.infoRow}>
									<span className={styles.infoIcon}>
										<BadgeSvg />
									</span>
									<div className={styles.infoContent}>
										<div className={styles.infoLabel}>Mã nhân viên</div>
										<div className={styles.infoValue}>
											{profile.staff_number ?? '—'}
										</div>
									</div>
								</div>
								<div className={styles.infoRow}>
									<span className={styles.infoIcon}>
										<CalendarSvg />
									</span>
									<div className={styles.infoContent}>
										<div className={styles.infoLabel}>Ngày tạo tài khoản</div>
										<div className={styles.infoValue}>
											{fmtDate(profile.created_at)}
										</div>
									</div>
								</div>
								<div className={styles.infoRow}>
									<span className={styles.infoIcon}>
										<LockSvg />
									</span>
									<div className={styles.infoContent}>
										<div className={styles.infoLabel}>
											Đổi mật khẩu lần cuối
										</div>
										<div className={styles.infoValue}>
											{fmtDate(profile.password_changed_at)}
										</div>
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
								<div
									className={styles.detailCardIcon}
									style={{ background: '#dbeafe', color: '#1a6abd' }}
								>
									<UserSvg />
								</div>
								<div>
									<div className={styles.detailCardTitle}>
										Thông tin tài khoản
									</div>
									<div className={styles.detailCardSub}>
										Chi tiết hồ sơ người dùng
									</div>
								</div>
							</div>

							<div className={styles.detailGrid}>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Họ và tên</div>
									<div className={styles.detailValue}>{profile.full_name}</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Tên đăng nhập</div>
									<div
										className={styles.detailValue}
										style={{ fontFamily: 'var(--font-mono)' }}
									>
										{profile.username}
									</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Email</div>
									<div className={styles.detailValue}>
										{profile.email || '—'}
									</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Mã nhân viên</div>
									<div className={styles.detailValue}>
										{profile.staff_number ?? '—'}
									</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Chức vụ / Vai trò</div>
									<div className={styles.detailValue}>
										{profile.role ?? userRole}
									</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Loại tài khoản</div>
									<div className={styles.detailValue}>
										{ACCOUNT_TYPE_LABEL[profile.account_type] ??
											profile.account_type}
									</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Trạng thái</div>
									<div className={styles.detailValue}>
										<span
											className={styles.statusChip}
											style={
												profile.is_active
													? { background: '#dcfce7', color: '#166534' }
													: { background: '#fee2e2', color: '#991b1b' }
											}
										>
											{profile.is_active ? 'Hoạt động' : 'Đã khoá'}
										</span>
									</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Ngày tạo</div>
									<div className={styles.detailValue}>
										{fmtDate(profile.created_at)}
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Change password */}
					<div className={styles.detailCard}>
						<div className={styles.detailCardHeader}>
							<div
								className={styles.detailCardIcon}
								style={{ background: '#fef3c7', color: '#92400e' }}
							>
								<LockSvg />
							</div>
							<div>
								<div className={styles.detailCardTitle}>Đổi mật khẩu</div>
								<div className={styles.detailCardSub}>
									Mật khẩu mới phải có ít nhất 6 ký tự
								</div>
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
										onChange={(e) => {
											setOldPwd(e.target.value);
											setPwdError('');
										}}
									/>
									<button
										type='button'
										className={styles.eyeBtn}
										onClick={() => setShowOld((v) => !v)}
										aria-label={showOld ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
									>
										{showOld ? <EyeOffSvg /> : <EyeSvg />}
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
										onChange={(e) => {
											setNewPwd(e.target.value);
											setPwdError('');
										}}
									/>
									<button
										type='button'
										className={styles.eyeBtn}
										onClick={() => setShowNew((v) => !v)}
										aria-label={showNew ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
									>
										{showNew ? <EyeOffSvg /> : <EyeSvg />}
									</button>
								</div>
								{newPwd.length > 0 && (
									<div className={styles.strengthBar}>
										<div
											className={styles.strengthFill}
											style={{
												width:
													newPwd.length < 6
														? '33%'
														: newPwd.length < 10
															? '66%'
															: '100%',
												background:
													newPwd.length < 6
														? '#ef4444'
														: newPwd.length < 10
															? '#f59e0b'
															: '#22c55e',
											}}
										/>
									</div>
								)}
							</div>

							{/* Confirm password */}
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>
									Xác nhận mật khẩu mới
								</label>
								<div className={styles.pwdInput}>
									<input
										type={showConfirm ? 'text' : 'password'}
										className={styles.formInput}
										placeholder='Nhập lại mật khẩu mới...'
										value={confirmPwd}
										onChange={(e) => {
											setConfirmPwd(e.target.value);
											setPwdError('');
										}}
									/>
									<button
										type='button'
										className={styles.eyeBtn}
										onClick={() => setShowConfirm((v) => !v)}
										aria-label={showConfirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
									>
										{showConfirm ? <EyeOffSvg /> : <EyeSvg />}
									</button>
								</div>
								{confirmPwd && newPwd && (
									<div
										className={styles.matchHint}
										style={{
											color: confirmPwd === newPwd ? '#22c55e' : '#ef4444',
										}}
									>
										{confirmPwd === newPwd
											? '✓ Mật khẩu khớp'
											: '✗ Mật khẩu không khớp'}
									</div>
								)}
							</div>

							{pwdError && (
								<div className={styles.errorMsg}>
									<AlertSvg /> {pwdError}
								</div>
							)}

							<div className={styles.pwdFooter}>
								<button
									type='button'
									className={styles.btnPrimary}
									onClick={handleChangePassword}
									disabled={pwdSaving}
								>
									{pwdSaving ? (
										<span
											className={styles.spinner}
											style={{
												width: 14,
												height: 14,
												border: '2px solid rgba(255,255,255,0.4)',
												borderTopColor: '#fff',
											}}
										/>
									) : (
										<CheckSvg />
									)}
									{pwdSaving ? 'Đang lưu...' : 'Đổi mật khẩu'}
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Toast */}
			{toast && (
				<div
					className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
				>
					{toast.type === 'success' ? <CheckSvg /> : <AlertSvg />}
					{toast.msg}
				</div>
			)}
		</UserLayout>
	);
}
