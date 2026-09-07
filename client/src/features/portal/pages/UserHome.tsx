import {
	ActivitySvg,
	BadgeSvg,
	BellSvg,
	BookOpenSvg,
	BuildingSvg,
	CalendarSvg,
	ChevRSvg,
	ClipboardCheckSvg,
	ClockSvg,
	DocPlusSvg,
	DocSvg,
	MailSvg,
	PhoneSvg,
	PlusSvg,
	ProgressSvg,
	UserSvg,
	UsersSvg,
} from '@/assets/icons';
import UserLayout from '../../../layouts/UserLayout';
import { InlineLoading } from '@/shared/components';
import {
	ROLE_LABELS,
	STATUS_LABELS,
	useUserHome,
} from '../hooks/useUserHome';
import styles from './UserHome.module.css';

function formatDate(dateStr?: string): string {
	if (!dateStr) return '—';
	try {
		const d = new Date(dateStr);
		if (isNaN(d.getTime())) return dateStr;
		return d.toLocaleDateString('vi-VN', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
		});
	} catch {
		return dateStr;
	}
}

export default function UserHome() {
	const d = useUserHome();

	return (
		<UserLayout
			pageTitle={undefined}
			userName={d.fullName}
			userRole={d.roleName}
			userInitials={d.initials}
		>
			<div className={styles.homeContainer}>
				{/* ── 1. WELCOME BANNER ── */}
				<section
					className={styles.welcomeBanner}
					aria-label='Thông tin chào mừng'
				>
					<div
						className={styles.bannerBgPattern}
						aria-hidden='true'
					>
						<div className={styles.bannerOrb1} />
						<div className={styles.bannerOrb2} />
						<div className={styles.bannerMeshGrid} />
					</div>

					<div className={styles.welcomeLeft}>
						<div className={styles.avatarWrapper}>
							<div className={styles.welcomeAvatar}>{d.initials}</div>
							<span
								className={styles.onlineBadge}
								title='Đang trực tuyến'
							/>
						</div>

						<div className={styles.welcomeContent}>
							<div className={styles.greetingTag}>
								<ActivitySvg />
								Cổng Nghiên cứu Khoa học
							</div>
							<h2 className={styles.welcomeTitle}>
								{d.greetingTime}, {d.fullName}!
							</h2>
							<div className={styles.welcomeMetaRow}>
								<span className={styles.welcomeBadge}>
									<BuildingSvg />
									{d.dept || 'Bệnh viện Hữu nghị ĐK Nghệ An'}
								</span>
								<span className={styles.welcomeBadge}>
									<BadgeSvg />
									{d.roleName}
								</span>
							</div>
						</div>
					</div>

					<div className={styles.welcomeRight}>
						<div className={styles.roundCard}>
							<div className={styles.roundStatusHeader}>
								<span className={styles.roundLivePill}>
									<span className={styles.roundDot} />
									{d.activeRound
										? 'Đợt NCKH đang mở'
										: 'Đăng ký nghiên cứu'}
								</span>
							</div>

							<div className={styles.roundName}>
								{d.activeRound?.name ?? 'Đợt đăng ký 1 — 2026'}
							</div>

							<div className={styles.roundDeadlineContainer}>
								<span className={styles.roundDeadlineText}>
									<CalendarSvg />
									Hạn nộp:{' '}
									{d.activeRound?.end_date
										? d.activeRound.end_date
										: '31/05/2026'}
								</span>
								<span className={styles.daysLeftPill}>
									{d.daysRemaining !== null
										? `Còn ${d.daysRemaining} ngày`
										: 'Đang mở'}
								</span>
							</div>

							{d.canRegisterTopic && (
								<button
									type='button'
									className={styles.bannerRegisterBtn}
									onClick={() => d.navigate('/user/register-topic')}
								>
									<PlusSvg />
									Đăng ký đề tài mới
								</button>
							)}
						</div>
					</div>
				</section>

				{/* ── 2. STATS ROW ── */}
				<section
					className={styles.statsGrid}
					aria-label='Thống kê tổng quan'
				>
					{/* Card 1: Tổng đề tài */}
					<div
						className={styles.statCard}
						role='button'
						tabIndex={0}
						onClick={() => d.navigate('/user/my-topics')}
						onKeyDown={(e) =>
							e.key === 'Enter' && d.navigate('/user/my-topics')
						}
					>
						<div className={styles.statTopRow}>
							<div
								className={styles.statIconBox}
								style={{ background: '#e8f8f2', color: '#167a4d' }}
							>
								<DocSvg />
							</div>
							<span
								className={styles.statPill}
								style={{ background: '#f0fdf4', color: '#15803d' }}
							>
								Tham gia
							</span>
						</div>
						<div className={styles.statBottomRow}>
							<div className={styles.statData}>
								<div className={styles.statValue}>
									{d.loading ? '—' : d.topics.length}
								</div>
								<div className={styles.statLabel}>Đề tài tham gia</div>
							</div>
							<ChevRSvg className={styles.statArrow} />
						</div>
					</div>

					{/* Card 2: Chờ phê duyệt */}
					<div
						className={styles.statCard}
						role='button'
						tabIndex={0}
						onClick={() => d.navigate('/user/my-topics')}
						onKeyDown={(e) =>
							e.key === 'Enter' && d.navigate('/user/my-topics')
						}
					>
						<div className={styles.statTopRow}>
							<div
								className={styles.statIconBox}
								style={{ background: '#fef3c7', color: '#b45309' }}
							>
								<ClipboardCheckSvg />
							</div>
							<span
								className={styles.statPill}
								style={{ background: '#fffbeb', color: '#b45309' }}
							>
								Chờ xét
							</span>
						</div>
						<div className={styles.statBottomRow}>
							<div className={styles.statData}>
								<div className={styles.statValue}>
									{d.loading ? '—' : d.pendingCount}
								</div>
								<div className={styles.statLabel}>Chờ phê duyệt</div>
							</div>
							<ChevRSvg className={styles.statArrow} />
						</div>
					</div>

					{/* Card 3: Đang thực hiện */}
					<div
						className={styles.statCard}
						role='button'
						tabIndex={0}
						onClick={() => d.navigate('/user/my-topics')}
						onKeyDown={(e) =>
							e.key === 'Enter' && d.navigate('/user/my-topics')
						}
					>
						<div className={styles.statTopRow}>
							<div
								className={styles.statIconBox}
								style={{ background: '#ccfbf1', color: '#0f766e' }}
							>
								<ProgressSvg />
							</div>
							<span
								className={styles.statPill}
								style={{ background: '#f0fdfa', color: '#0f766e' }}
							>
								Tiến hành
							</span>
						</div>
						<div className={styles.statBottomRow}>
							<div className={styles.statData}>
								<div className={styles.statValue}>
									{d.loading ? '—' : d.inProgressCount}
								</div>
								<div className={styles.statLabel}>Đang thực hiện</div>
							</div>
							<ChevRSvg className={styles.statArrow} />
						</div>
					</div>

					{/* Card 4: Thông báo mới */}
					<div
						className={styles.statCard}
						role='button'
						tabIndex={0}
						onClick={() => d.navigate('/user/notifications')}
						onKeyDown={(e) =>
							e.key === 'Enter' && d.navigate('/user/notifications')
						}
					>
						<div className={styles.statTopRow}>
							<div
								className={styles.statIconBox}
								style={{ background: '#fee2e2', color: '#b91c1c' }}
							>
								<BellSvg />
							</div>
							<span
								className={styles.statPill}
								style={
									d.unreadCount > 0
										? { background: '#fef2f2', color: '#dc2626' }
										: { background: '#f1f5f9', color: '#64748b' }
								}
							>
								{d.unreadCount > 0 ? 'Chưa đọc' : 'Hộp thư'}
							</span>
						</div>
						<div className={styles.statBottomRow}>
							<div className={styles.statData}>
								<div className={styles.statValue}>
									{d.loading ? '—' : d.unreadCount}
								</div>
								<div className={styles.statLabel}>Thông báo mới</div>
							</div>
							<ChevRSvg className={styles.statArrow} />
						</div>
					</div>
				</section>

				{/* ── 3. CONTENT GRID (2 COLUMNS) ── */}
				<div className={styles.contentGrid}>
					{/* LEFT COLUMN: Đề tài của tôi */}
					<div className={styles.leftColumn}>
						<div className={styles.card}>
							<div className={styles.cardHeader}>
								<div className={styles.cardTitleWrap}>
									<h3 className={styles.cardTitle}>
										<DocSvg className={styles.cardHeaderIcon} />
										Đề tài của tôi
									</h3>
									{!d.loading && (
										<span className={styles.badgeCount}>
											{d.topics.length}
										</span>
									)}
								</div>
								<button
									type='button'
									className={styles.cardLink}
									onClick={() => d.navigate('/user/my-topics')}
								>
									Xem tất cả
									<ChevRSvg />
								</button>
							</div>

							{d.loading ? (
								<div style={{ padding: '40px 0' }}>
									<InlineLoading label='Đang tải danh sách đề tài…' />
								</div>
							) : d.error ? (
								<div
									style={{
										padding: '36px 24px',
										textAlign: 'center',
										color: '#ef4444',
										fontSize: '0.875rem',
									}}
								>
									{d.error}
								</div>
							) : d.recentTopics.length === 0 ? (
								<div className={styles.emptyStateCard}>
									<div className={styles.emptyIconCircle}>
										<DocSvg />
									</div>
									<h4 className={styles.emptyTitle}>
										Chưa tham gia đề tài nào
									</h4>
									<p className={styles.emptyDesc}>
										Bạn chưa tham gia đề tài nghiên cứu nào trong đợt
										này. Hãy đăng ký ngay khi đợt mở!
									</p>
									{d.canRegisterTopic && (
										<button
											type='button'
											className={styles.emptyBtn}
											onClick={() => d.navigate('/user/register-topic')}
										>
											<DocPlusSvg />
											Đăng ký đề tài mới
										</button>
									)}
								</div>
							) : (
								<div className={styles.topicList}>
									{d.recentTopics.map((t) => {
										const s = STATUS_LABELS[t.status] ?? {
											label: t.status,
											color: '#475569',
											bg: '#f1f5f9',
											border: '#cbd5e1',
										};
										const role = t.my_role
											? ROLE_LABELS[t.my_role]
											: null;
										const progress =
											typeof t.progress === 'number'
												? t.progress
												: t.status === 'approved'
													? 50
													: t.status === 'submitted'
														? 15
														: 0;

										return (
											<div
												key={t.id}
												className={styles.topicItem}
												role='button'
												tabIndex={0}
												onClick={() =>
													d.navigate(`/user/my-topics/${t.id}`, {
														state: { topic: t },
													})
												}
												onKeyDown={(e) => {
													if (e.key === 'Enter') {
														d.navigate(`/user/my-topics/${t.id}`, {
															state: { topic: t },
														});
													}
												}}
											>
												<div className={styles.topicHeaderRow}>
													<div className={styles.topicBadgesLeft}>
														<span className={styles.topicCodeBadge}>
															{t.id}
														</span>
														{role && (
															<span
																className={styles.topicRoleBadge}
																style={{
																	background: role.bg,
																	color: role.color,
																}}
															>
																{role.label}
															</span>
														)}
													</div>

													<span
														className={styles.topicStatusBadge}
														style={{
															color: s.color,
															background: s.bg,
															borderColor: s.border,
														}}
													>
														<span
															className={styles.statusDot}
															style={{ background: s.color }}
														/>
														{s.label}
													</span>
												</div>

												<div
													className={styles.topicTitle}
													title={t.title}
												>
													{t.title}
												</div>

												<div className={styles.topicMetaRow}>
													{t.round_name && (
														<span className={styles.topicMetaItem}>
															<CalendarSvg />
															{t.round_name}
														</span>
													)}
													<span className={styles.topicMetaItem}>
														<UsersSvg />
														{t.member_count ?? 1} thành viên
													</span>
													{t.created_at && (
														<span className={styles.topicMetaItem}>
															<ClockSvg />
															{formatDate(t.created_at)}
														</span>
													)}
												</div>

												<div className={styles.topicProgressSection}>
													<div className={styles.progressHeader}>
														<span className={styles.progressLabel}>
															Tiến độ thực hiện
														</span>
														<span className={styles.progressValue}>
															{progress}%
														</span>
													</div>
													<div className={styles.progressTrack}>
														<div
															className={styles.progressFill}
															style={{ width: `${progress}%` }}
														/>
													</div>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>
					</div>

					{/* RIGHT COLUMN: Thao tác nhanh & Hướng dẫn hỗ trợ */}
					<div className={styles.rightColumn}>
						{/* Quick Actions Card */}
						<div className={styles.card}>
							<div className={styles.cardHeader}>
								<h3 className={styles.cardTitle}>
									<ActivitySvg className={styles.cardHeaderIcon} />
									Thao tác nhanh
								</h3>
							</div>

							<div className={styles.actionList}>
								{d.canRegisterTopic && (
									<button
										type='button'
										className={`${styles.actionBtn} ${styles.actionBtnFeatured}`}
										onClick={() => d.navigate('/user/register-topic')}
									>
										<div
											className={styles.actionIcon}
											style={{ background: '#e8f8f2', color: '#167a4d' }}
										>
											<DocPlusSvg />
										</div>
										<div className={styles.actionText}>
											<div className={styles.actionNameRow}>
												<span className={styles.actionName}>
													Đăng ký đề tài
												</span>
												<span className={styles.actionBadge}>Mở</span>
											</div>
											<div className={styles.actionDesc}>
												Tham gia đợt nghiên cứu khoa học mới
											</div>
										</div>
										<ChevRSvg className={styles.actionArrow} />
									</button>
								)}

								<button
									type='button'
									className={styles.actionBtn}
									onClick={() => d.navigate('/user/my-topics')}
								>
									<div
										className={styles.actionIcon}
										style={{ background: '#e0f2fe', color: '#0369a1' }}
									>
										<ProgressSvg />
									</div>
									<div className={styles.actionText}>
										<div className={styles.actionName}>
											Báo cáo tiến độ
										</div>
										<div className={styles.actionDesc}>
											Cập nhật tiến độ đề tài đang thực hiện
										</div>
									</div>
									<ChevRSvg className={styles.actionArrow} />
								</button>

								<button
									type='button'
									className={styles.actionBtn}
									onClick={() => d.navigate('/user/notifications')}
								>
									<div
										className={styles.actionIcon}
										style={{ background: '#fef3c7', color: '#b45309' }}
									>
										<BellSvg />
									</div>
									<div className={styles.actionText}>
										<div className={styles.actionNameRow}>
											<span className={styles.actionName}>
												Thông báo & Nhắc nhở
											</span>
											{d.unreadCount > 0 && (
												<span className={styles.actionNotifBadge}>
													{d.unreadCount} mới
												</span>
											)}
										</div>
										<div className={styles.actionDesc}>
											Xem thông báo từ Hội đồng & Ban QLKH
										</div>
									</div>
									<ChevRSvg className={styles.actionArrow} />
								</button>

								<button
									type='button'
									className={styles.actionBtn}
									onClick={() => d.navigate('/user/profile')}
								>
									<div
										className={styles.actionIcon}
										style={{ background: '#ede9fe', color: '#6d28d9' }}
									>
										<UserSvg />
									</div>
									<div className={styles.actionText}>
										<div className={styles.actionName}>
											Hồ sơ cá nhân
										</div>
										<div className={styles.actionDesc}>
											Xem và chỉnh sửa thông tin tài khoản
										</div>
									</div>
									<ChevRSvg className={styles.actionArrow} />
								</button>
							</div>
						</div>

						{/* Research Guide & Contact Support Card */}
						<div className={styles.card}>
							<div className={styles.cardHeader}>
								<h3 className={styles.cardTitle}>
									<BookOpenSvg className={styles.cardHeaderIcon} />
									Quy trình & Hỗ trợ NCKH
								</h3>
							</div>

							<div className={styles.supportCardBody}>
								{/* 4-step workflow */}
								<div className={styles.workflowSteps}>
									<div className={styles.stepItem}>
										<div className={styles.stepNumber}>1</div>
										<div className={styles.stepTitle}>Đề cương</div>
									</div>
									<div className={styles.stepItem}>
										<div className={styles.stepNumber}>2</div>
										<div className={styles.stepTitle}>Xét duyệt</div>
									</div>
									<div className={styles.stepItem}>
										<div className={styles.stepNumber}>3</div>
										<div className={styles.stepTitle}>Thực hiện</div>
									</div>
									<div className={styles.stepItem}>
										<div className={styles.stepNumber}>4</div>
										<div className={styles.stepTitle}>Nghiệm thu</div>
									</div>
								</div>

								{/* Contact support info */}
								<div className={styles.contactBox}>
									<div className={styles.contactHeader}>
										<BuildingSvg />
										Ban QL Khoa học & Đào tạo
									</div>
									<div className={styles.contactDetails}>
										<div className={styles.contactItem}>
											<PhoneSvg />
											<span>Điện thoại: 0238.3844.xxx (ML: 115)</span>
										</div>
										<div className={styles.contactItem}>
											<MailSvg />
											<span>Email: nckh@bvdanghean.vn</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</UserLayout>
	);
}
