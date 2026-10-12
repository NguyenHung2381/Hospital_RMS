import {
	AlertSvg,
	BadgeSvg,
	CalendarSvg,
	CheckSvg,
	EyeOffSvg,
	EyeSvg,
	KeySvg,
	LockSvg,
	LogoutSvg,
	MailSvg,
	ShieldSvg,
	UserSvg,
} from '@/assets/icons';
import { QRCode } from 'antd';
import { useLocation } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import UserLayout from '../../../layouts/UserLayout';
import { InlineLoading } from '@/shared/components';
import { PASSWORD_HINT } from '@/shared/utils/password';
import { fmtDate, useProfile } from '../hooks/useProfile';
import styles from './Profile.module.css';

const SPINNER = (
	<span
		className={styles.spinner}
		style={{
			width: 14,
			height: 14,
			border: '2px solid rgba(255,255,255,0.4)',
			borderTopColor: '#fff',
		}}
	/>
);

export default function Profile() {
	const d = useProfile();
	// Dùng chung 2 cổng như MyTasks: vào từ /admin/... thì giữ layout admin.
	const isAdmin = useLocation().pathname.startsWith('/admin');
	const Layout = isAdmin ? AdminLayout : UserLayout;

	return (
		<Layout
			pageTitle='Hồ sơ cá nhân'
			pageSubtitle='Xem và quản lý thông tin tài khoản của bạn'
			breadcrumbs={[{ label: 'Hồ sơ cá nhân' }]}
			{...(!isAdmin && {
				userName: d.fullName,
				userRole: d.userRole,
				userInitials: d.initials,
			})}
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

					{d.loadingProfile && <InlineLoading label='Đang tải thông tin…' />}
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
									{d.nameDraft === null ? (
										<div className={styles.detailValue}>
											{d.profile.full_name}{' '}
											<button
												type='button'
												className={styles.linkBtn}
												onClick={() => d.setNameDraft(d.profile!.full_name)}
											>
												Sửa
											</button>
										</div>
									) : (
										<form
											style={{ display: 'flex', gap: 8 }}
											onSubmit={(e) => {
												e.preventDefault();
												d.handleSaveName();
											}}
										>
											<input
												className={styles.pwdInput}
												value={d.nameDraft}
												maxLength={200}
												autoFocus
												aria-label='Họ và tên'
												onChange={(e) => d.setNameDraft(e.target.value)}
											/>
											<button className={styles.btnPrimary} disabled={d.nameSaving}>
												Lưu
											</button>
											<button
												type='button'
												className={styles.linkBtn}
												onClick={() => d.setNameDraft(null)}
											>
												Huỷ
											</button>
										</form>
									)}
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
									{PASSWORD_HINT}; không chứa tên đăng nhập
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
													d.newPwd.length < 8
														? '33%'
														: d.newPwd.length < 12
															? '66%'
															: '100%',
												background:
													d.newPwd.length < 8
														? '#ef4444'
														: d.newPwd.length < 12
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

					{/* 2FA (TOTP) */}
					<div className={styles.detailCard}>
						<div
							className={`${styles.detailCardHeader} ${d.twoFaEnabled === false && !d.twoFaSetup ? styles.headerOnly : ''}`}
						>
							<div
								className={styles.detailCardIcon}
								style={{ background: '#e0e7ff', color: '#4338ca' }}
							>
								<KeySvg />
							</div>
							<div className={styles.headerText}>
								<div className={styles.detailCardTitle}>
									Xác thực 2 lớp (2FA)
									{d.twoFaEnabled !== null && (
										<span
											className={styles.statusChip}
											style={
												d.twoFaEnabled
													? { background: '#dcfce7', color: '#166534' }
													: { background: 'var(--color-gray-100)', color: 'var(--color-gray-600)' }
											}
										>
											{d.twoFaEnabled ? 'Đang bật' : 'Chưa bật'}
										</span>
									)}
								</div>
								<div className={styles.detailCardSub}>
									{d.twoFaEnabled
										? 'Mỗi lần đăng nhập cần thêm mã từ ứng dụng xác thực'
										: 'Bảo vệ tài khoản bằng mã OTP từ Google Authenticator hoặc ứng dụng tương tự'}
								</div>
							</div>
							{d.twoFaEnabled === false && !d.twoFaSetup && (
								<button
									type='button'
									className={`${styles.btnPrimary} ${styles.headerAction}`}
									onClick={() => void d.handleStart2FASetup()}
									disabled={d.twoFaSaving}
								>
									{d.twoFaSaving ? SPINNER : <KeySvg />}
									Bật xác thực 2 lớp
								</button>
							)}
						</div>

						{d.twoFaEnabled === null ? null : d.twoFaSetup ? (
							<div className={styles.pwdForm}>
								<div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
									<QRCode value={d.twoFaSetup.otpauth_uri} />
									<div style={{ flex: 1, minWidth: 220 }}>
										<div className={styles.formLabel} style={{ marginBottom: 6 }}>
											1. Quét mã QR bằng ứng dụng xác thực (Google Authenticator, Authy...)
										</div>
										<div className={styles.formLabel} style={{ marginBottom: 6 }}>
											2. Nhập mã 6 số hiện tại để xác nhận
										</div>
										<input
											type='text'
											inputMode='numeric'
											maxLength={6}
											className={styles.formInput}
											placeholder='000000'
											value={d.twoFaCode}
											onChange={(e) => d.setTwoFaCode(e.target.value.replace(/\D/g, ''))}
										/>
									</div>
								</div>

								{d.twoFaError && (
									<div className={styles.errorMsg}>
										<AlertSvg /> {d.twoFaError}
									</div>
								)}

								<div className={styles.pwdFooter}>
									<button
										type='button'
										className={styles.btnPrimary}
										onClick={() => void d.handleConfirm2FASetup()}
										disabled={d.twoFaSaving || d.twoFaCode.trim().length === 0}
									>
										{d.twoFaSaving ? (
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
										Xác nhận & bật 2FA
									</button>
									<button
										type='button'
										className={styles.btnPrimary}
										style={{ background: 'var(--color-gray-400)' }}
										onClick={d.handleCancel2FASetup}
										disabled={d.twoFaSaving}
									>
										Huỷ
									</button>
								</div>
							</div>
						) : d.twoFaEnabled ? (
							<div className={styles.pwdForm}>
								{/* Mã khôi phục: dùng khi mất điện thoại — mỗi mã 1 lần */}
								{d.backupCodes ? (
									<div
										style={{
											border: '1px solid #fde68a',
											background: '#fefce8',
											borderRadius: 8,
											padding: 12,
										}}
									>
										<div className={styles.formLabel} style={{ color: '#92400e', marginBottom: 8 }}>
											Lưu các mã khôi phục dưới đây ở nơi an toàn (in ra hoặc lưu vào trình quản lý
											mật khẩu). Mất điện thoại thì dùng 1 mã thay cho mã 6 số — mỗi mã chỉ dùng
											được 1 lần. Các mã <strong>chỉ hiển thị lần này</strong>.
										</div>
										<div
											style={{
												display: 'grid',
												gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
												gap: 6,
												fontFamily: 'var(--font-mono)',
												fontSize: 15,
												userSelect: 'all',
											}}
										>
											{d.backupCodes.map((c) => (
												<span key={c}>{c}</span>
											))}
										</div>
										<div className={styles.pwdFooter}>
											<button
												type='button'
												className={styles.btnPrimary}
												onClick={() => void navigator.clipboard?.writeText(d.backupCodes?.join('\n') ?? '')}
											>
												Sao chép
											</button>
											<button
												type='button'
												className={styles.btnPrimary}
												style={{ background: 'var(--color-gray-400)' }}
												onClick={d.dismissBackupCodes}
											>
												Đã lưu, đóng lại
											</button>
										</div>
									</div>
								) : d.showRegenBackup ? (
									<>
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>
												Nhập mật khẩu để tạo bộ mã khôi phục mới (bộ cũ sẽ mất hiệu lực)
											</label>
											<input
												type='password'
												className={styles.formInput}
												placeholder='Mật khẩu hiện tại...'
												value={d.regenPwd}
												onChange={(e) => d.setRegenPwd(e.target.value)}
											/>
										</div>
										{d.twoFaError && (
											<div className={styles.errorMsg}>
												<AlertSvg /> {d.twoFaError}
											</div>
										)}
										<div className={styles.pwdFooter}>
											<button
												type='button'
												className={styles.btnPrimary}
												onClick={() => void d.handleRegenerateBackupCodes()}
												disabled={d.twoFaSaving || !d.regenPwd}
											>
												Tạo mã mới
											</button>
											<button
												type='button'
												className={styles.btnPrimary}
												style={{ background: 'var(--color-gray-400)' }}
												onClick={() => {
													d.setShowRegenBackup(false);
													d.setRegenPwd('');
												}}
												disabled={d.twoFaSaving}
											>
												Huỷ
											</button>
										</div>
									</>
								) : (
									!d.showDisable2Fa && (
										<div className={styles.formLabel}>
											Còn <strong>{d.backupRemaining}</strong> mã khôi phục chưa dùng.{' '}
											<button
												type='button'
												onClick={() => d.setShowRegenBackup(true)}
												style={{
													background: 'none',
													border: 'none',
													padding: 0,
													color: 'var(--color-primary)',
													cursor: 'pointer',
													textDecoration: 'underline',
												}}
											>
												Tạo lại mã khôi phục
											</button>
										</div>
									)
								)}
								{d.backupCodes || d.showRegenBackup ? null : !d.showDisable2Fa ? (
									<div className={styles.pwdFooter}>
										<button
											type='button'
											className={styles.btnPrimary}
											style={{ background: '#dc2626' }}
											onClick={() => d.setShowDisable2Fa(true)}
										>
											Tắt xác thực 2 lớp
										</button>
									</div>
								) : (
									<>
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>Nhập mật khẩu để xác nhận</label>
											<input
												type='password'
												className={styles.formInput}
												placeholder='Mật khẩu hiện tại...'
												value={d.disablePwd}
												onChange={(e) => d.setDisablePwd(e.target.value)}
											/>
										</div>
										{d.twoFaError && (
											<div className={styles.errorMsg}>
												<AlertSvg /> {d.twoFaError}
											</div>
										)}
										<div className={styles.pwdFooter}>
											<button
												type='button'
												className={styles.btnPrimary}
												style={{ background: '#dc2626' }}
												onClick={() => void d.handleDisable2FA()}
												disabled={d.twoFaSaving || !d.disablePwd}
											>
												Xác nhận tắt 2FA
											</button>
											<button
												type='button'
												className={styles.btnPrimary}
												style={{ background: 'var(--color-gray-400)' }}
												onClick={() => {
													d.setShowDisable2Fa(false);
													d.setDisablePwd('');
												}}
												disabled={d.twoFaSaving}
											>
												Huỷ
											</button>
										</div>
									</>
								)}
							</div>
						) : null}
					</div>

					{/* Security: revoke all sessions */}
					<div className={styles.detailCard}>
						<div className={`${styles.detailCardHeader} ${styles.headerOnly}`}>
							<div
								className={styles.detailCardIcon}
								style={{ background: '#fee2e2', color: '#dc2626' }}
							>
								<ShieldSvg />
							</div>
							<div className={styles.headerText}>
								<div className={styles.detailCardTitle}>Phiên đăng nhập</div>
								<div className={styles.detailCardSub}>
									Đăng xuất khỏi tất cả thiết bị đang dùng tài khoản này, kể cả thiết bị hiện tại
								</div>
							</div>
							<button
								type='button'
								className={`${styles.btnDangerOutline} ${styles.headerAction}`}
								onClick={() => void d.handleLogoutAll()}
								disabled={d.loggingOutAll}
							>
								<LogoutSvg />
								{d.loggingOutAll ? 'Đang đăng xuất...' : 'Đăng xuất mọi thiết bị'}
							</button>
						</div>
					</div>
				</div>
			</div>

		</Layout>
	);
}
