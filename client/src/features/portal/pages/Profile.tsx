import {
	AlertSvg,
	BadgeSvg,
	CalendarSvg,
	CheckSvg,
	EyeOffSvg,
	EyeSvg,
	LockSvg,
	MailSvg,
	UserSvg,
} from '@/assets/icons';
import UserLayout from '../../../layouts/UserLayout';
import { fmtDate, useProfile } from '../hooks/useProfile';
import styles from './Profile.module.css';

export default function Profile() {
	const d = useProfile();

	return (
		<UserLayout
			pageTitle='Hồ sơ cá nhân'
			pageSubtitle='Xem và quản lý thông tin tài khoản của bạn'
			breadcrumbs={[{ label: 'Hồ sơ cá nhân' }]}
			userName={d.fullName}
			userRole={d.userRole}
			userInitials={d.initials}
		>
			<div className={styles.pageGrid}>
				{/* ── LEFT COL ── */}
				<div className={styles.leftCol}>
					<div className={styles.avatarCard}>
						<div className={styles.avatarCircle}>{d.initials}</div>
						<div className={styles.avatarName}>{d.fullName}</div>
						<div className={styles.avatarRole}>{d.userRole}</div>
						{d.profile && (
							<span
								className={styles.activeBadge}
								style={
									d.profile.is_active
										? {}
										: { background: '#fee2e2', color: '#991b1b' }
								}
							>
								{d.profile.is_active ? 'Đang hoạt động' : 'Đã khoá'}
							</span>
						)}
					</div>

					{d.profile && (
						<div className={styles.infoCard}>
							<div className={styles.infoCardHeader}>Thông tin nhanh</div>
							<div className={styles.infoList}>
								<div className={styles.infoRow}>
									<span className={styles.infoIcon}>
										<UserSvg />
									</span>
									<div className={styles.infoContent}>
										<div className={styles.infoLabel}>Tên đăng nhập</div>
										<div className={styles.infoValue}>{d.profile.username}</div>
									</div>
								</div>
								<div className={styles.infoRow}>
									<span className={styles.infoIcon}>
										<MailSvg />
									</span>
									<div className={styles.infoContent}>
										<div className={styles.infoLabel}>Email</div>
										<div className={styles.infoValue}>
											{d.profile.email || '—'}
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
											{d.profile.staff_number ?? '—'}
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
											{fmtDate(d.profile.created_at)}
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
											{fmtDate(d.profile.password_changed_at)}
										</div>
									</div>
								</div>
							</div>
						</div>
					)}

					{d.loadingProfile && (
						<div className={styles.loadingBox}>
							<div className={styles.spinner} />
							<span>Đang tải thông tin...</span>
						</div>
					)}
				</div>

				{/* ── RIGHT COL ── */}
				<div className={styles.rightCol}>
					{d.profile && (
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
									<div className={styles.detailValue}>
										{d.profile.full_name}
									</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Tên đăng nhập</div>
									<div
										className={styles.detailValue}
										style={{ fontFamily: 'var(--font-mono)' }}
									>
										{d.profile.username}
									</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Email</div>
									<div className={styles.detailValue}>
										{d.profile.email || '—'}
									</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Mã nhân viên</div>
									<div className={styles.detailValue}>
										{d.profile.staff_number ?? '—'}
									</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Chức vụ / Vai trò</div>
									<div className={styles.detailValue}>
										{d.profile.role ?? d.userRole}
									</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Trạng thái</div>
									<div className={styles.detailValue}>
										<span
											className={styles.statusChip}
											style={
												d.profile.is_active
													? { background: '#dcfce7', color: '#166534' }
													: { background: '#fee2e2', color: '#991b1b' }
											}
										>
											{d.profile.is_active ? 'Hoạt động' : 'Đã khoá'}
										</span>
									</div>
								</div>
								<div className={styles.detailItem}>
									<div className={styles.detailLabel}>Ngày tạo</div>
									<div className={styles.detailValue}>
										{fmtDate(d.profile.created_at)}
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
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Mật khẩu hiện tại</label>
								<div className={styles.pwdInput}>
									<input
										type={d.showOld ? 'text' : 'password'}
										className={styles.formInput}
										placeholder='Nhập mật khẩu hiện tại...'
										value={d.oldPwd}
										onChange={(e) => {
											d.setOldPwd(e.target.value);
											d.setPwdError('');
										}}
									/>
									<button
										type='button'
										className={styles.eyeBtn}
										onClick={() => d.setShowOld((v) => !v)}
									>
										{d.showOld ? <EyeOffSvg /> : <EyeSvg />}
									</button>
								</div>
							</div>

							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Mật khẩu mới</label>
								<div className={styles.pwdInput}>
									<input
										type={d.showNew ? 'text' : 'password'}
										className={styles.formInput}
										placeholder='Nhập mật khẩu mới...'
										value={d.newPwd}
										onChange={(e) => {
											d.setNewPwd(e.target.value);
											d.setPwdError('');
										}}
									/>
									<button
										type='button'
										className={styles.eyeBtn}
										onClick={() => d.setShowNew((v) => !v)}
									>
										{d.showNew ? <EyeOffSvg /> : <EyeSvg />}
									</button>
								</div>
								{d.newPwd.length > 0 && (
									<div className={styles.strengthBar}>
										<div
											className={styles.strengthFill}
											style={{
												width:
													d.newPwd.length < 6
														? '33%'
														: d.newPwd.length < 10
															? '66%'
															: '100%',
												background:
													d.newPwd.length < 6
														? '#ef4444'
														: d.newPwd.length < 10
															? '#f59e0b'
															: '#22c55e',
											}}
										/>
									</div>
								)}
							</div>

							<div className={styles.formGroup}>
								<label className={styles.formLabel}>
									Xác nhận mật khẩu mới
								</label>
								<div className={styles.pwdInput}>
									<input
										type={d.showConfirm ? 'text' : 'password'}
										className={styles.formInput}
										placeholder='Nhập lại mật khẩu mới...'
										value={d.confirmPwd}
										onChange={(e) => {
											d.setConfirmPwd(e.target.value);
											d.setPwdError('');
										}}
									/>
									<button
										type='button'
										className={styles.eyeBtn}
										onClick={() => d.setShowConfirm((v) => !v)}
									>
										{d.showConfirm ? <EyeOffSvg /> : <EyeSvg />}
									</button>
								</div>
								{d.confirmPwd && d.newPwd && (
									<div
										className={styles.matchHint}
										style={{
											color: d.confirmPwd === d.newPwd ? '#22c55e' : '#ef4444',
										}}
									>
										{d.confirmPwd === d.newPwd
											? '✓ Mật khẩu khớp'
											: '✗ Mật khẩu không khớp'}
									</div>
								)}
							</div>

							{d.pwdError && (
								<div className={styles.errorMsg}>
									<AlertSvg /> {d.pwdError}
								</div>
							)}

							<div className={styles.pwdFooter}>
								<button
									type='button'
									className={styles.btnPrimary}
									onClick={() => void d.handleChangePassword()}
									disabled={d.pwdSaving}
								>
									{d.pwdSaving ? (
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
									{d.pwdSaving ? 'Đang lưu...' : 'Đổi mật khẩu'}
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>

			{d.toast && (
				<div
					className={`${styles.toast} ${d.toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
				>
					{d.toast.type === 'success' ? <CheckSvg /> : <AlertSvg />}
					{d.toast.msg}
				</div>
			)}
		</UserLayout>
	);
}
