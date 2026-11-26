import PortalHomeHeader from '@/shared/components/PortalHomeHeader';
import {
	ActivitySvg,
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
				<PortalHomeHeader label='Cổng người dùng' title={d.fullName || 'Trang cá nhân'} detail={[d.dept, d.roleName].filter(Boolean).join(' · ')}>
					<p>Đăng ký nghiên cứu khoa học</p>
					<h2>{d.activeRound?.name ?? (d.loading ? 'Đang tải đợt đăng ký…' : 'Chưa có đợt mở đăng ký')}</h2>
					{d.deadline && (
								<div className={styles.roundDeadlineContainer}>
									<span className={styles.roundDeadlineText}>
										<CalendarSvg />
										{d.deadline.label}: {d.deadline.date}
									</span>
									{d.daysRemaining !== null && (
										<span className={styles.daysLeftPill}>
											{d.daysRemaining > 0 ? `Còn ${d.daysRemaining} ngày` : 'Hôm nay là hạn cuối'}
										</span>
									)}
								</div>
							)}

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
				</PortalHomeHeader>

				{/* ── 2. STATS ROW ── */}
				<section
					className={styles.statsGrid}
					aria-label='Thống kê tổng quan'
				>
					{/* Card 1: Đề tài tham gia */}
					<button
						type='button'
						className={`${styles.statCard}`}
						onClick={() => d.navigate('/user/my-topics')}
					>
						<div className={styles.statTopRow}>
							<div className={`${styles.statIconBox} ${styles.iconGreen}`}>
								<DocSvg />
							</div>
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
					</button>

					{/* Card 2: Chờ phê duyệt (người nộp chỉ chờ — không tô hồng) */}
					<button
						type='button'
						className={`${styles.statCard}`}
						onClick={() => d.navigate('/user/my-topics')}
					>
						<div className={styles.statTopRow}>
							<div className={`${styles.statIconBox} ${styles.iconAmber}`}>
								<ClipboardCheckSvg />
							</div>
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
					</button>

					{/* Card 3: Đang thực hiện */}
					<button
						type='button'
						className={`${styles.statCard}`}
						onClick={() => d.navigate('/user/my-topics')}
					>
						<div className={styles.statTopRow}>
							<div className={`${styles.statIconBox} ${styles.iconBlue}`}>
								<ProgressSvg />
							</div>
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
					</button>

					{/* Card 4: Thông báo chưa đọc — hồng chỉ khi có thông báo đang chờ bạn */}
					<button
						type='button'
						className={`${styles.statCard}${d.unreadCount > 0 ? ` ${styles.statAttention}` : ''}`}
						onClick={() => d.navigate('/user/notifications')}
					>
						<div className={styles.statTopRow}>
							<div className={`${styles.statIconBox} ${d.unreadCount > 0 ? styles.iconAttention : styles.iconGray}`}>
								<BellSvg />
							</div>
							{d.unreadCount > 0 && <span className={styles.statPill}>Chưa đọc</span>}
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
					</button>
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
										color: 'var(--tone-red-fg)',
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
											color: 'var(--tone-gray-fg)',
											bg: 'var(--tone-gray-bg)',
											border: 'var(--color-gray-300)',
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

						{/* Quy trình & Hỗ trợ NCKH — đặt ở cột trái dưới "Đề tài của tôi": cân chiều cao
						    2 cột và đọc liền mạch "đề tài của tôi → quy trình đề tài đi qua" */}
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

					{/* RIGHT COLUMN: Thao tác nhanh */}
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
								<button
									type='button'
									className={styles.actionBtn}
									onClick={() => d.navigate('/user/my-topics')}
								>
									<div
										className={styles.actionIcon}
										style={{ background: 'var(--tone-blue-bg)', color: 'var(--tone-blue-fg)' }}
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
									onClick={() => d.navigate('/user/khoa-hoc')}
								>
									<div
										className={styles.actionIcon}
										style={{ background: 'var(--tone-teal-bg)', color: 'var(--tone-teal-fg)' }}
									>
										<BookOpenSvg />
									</div>
									<div className={styles.actionText}>
										<div className={styles.actionName}>Khóa học của tôi</div>
										<div className={styles.actionDesc}>
											Lịch học, kết quả, chứng chỉ và đăng ký khóa mới
										</div>
									</div>
									<ChevRSvg className={styles.actionArrow} />
								</button>

								<button
									type='button'
									className={styles.actionBtn}
									onClick={() => d.navigate('/user/cme')}
								>
									<div
										className={styles.actionIcon}
										style={{ background: 'var(--tone-amber-bg)', color: 'var(--tone-amber-fg)' }}
									>
										<CalendarSvg />
									</div>
									<div className={styles.actionText}>
										<div className={styles.actionName}>Tín chỉ CME</div>
										<div className={styles.actionDesc}>
											Tín chỉ tích lũy trong năm so với yêu cầu
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
										style={{ background: 'var(--tone-gray-bg)', color: 'var(--tone-gray-fg)' }}
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
					</div>
				</div>
			</div>
		</UserLayout>
	);
}
