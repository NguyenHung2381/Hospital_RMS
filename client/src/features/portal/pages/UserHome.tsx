import {
	CalendarSvg,
	ChevRSvg,
	ClipboardCheckSvg,
	DocPlusSvg,
	DocSvg,
	ProgressSvg,
	UserSvg,
	WarnSvg,
} from '@/assets/icons';
import UserLayout from '../../../layouts/UserLayout';
import { STATUS_LABELS, useUserHome } from '../hooks/useUserHome';
import styles from './UserHome.module.css';

export default function UserHome() {
	const d = useUserHome();

	return (
		<UserLayout
			pageTitle={undefined}
			userName={d.fullName}
			userRole={d.roleName}
			userInitials={d.initials}
		>
			{/* ── Welcome banner ── */}
			<div className={styles.welcomeBanner}>
				<div className={styles.welcomeLeft}>
					<div className={styles.welcomeAvatar}>{d.initials}</div>
					<div className={styles.welcomeText}>
						<h2 className={styles.welcomeTitle}>
							Xin chào, {d.fullName.split(' ').pop()}!
						</h2>
						<p className={styles.welcomeSub}>
							{d.roleName}
							{d.dept ? ` · ${d.dept}` : ''}
						</p>
					</div>
				</div>
				<div className={styles.welcomeRight}>
					<div className={styles.roundBadge}>
						<span className={styles.roundDot} />
						Đợt đăng ký 1 — 2026 đang mở
					</div>
					<p className={styles.roundDeadline}>Hạn đăng ký: 31/05/2026</p>
				</div>
			</div>

			{/* ── Stats ── */}
			<div className={styles.statsRow}>
				<div className={styles.statCard}>
					<div
						className={styles.statIcon}
						style={{ background: '#e8f7f0', color: '#1e9460' }}
					>
						<DocSvg />
					</div>
					<div className={styles.statInfo}>
						<div className={styles.statValue}>
							{d.loading ? '—' : d.topics.length}
						</div>
						<div className={styles.statLabel}>Đề tài tham gia</div>
					</div>
				</div>
				<div className={styles.statCard}>
					<div
						className={styles.statIcon}
						style={{ background: '#fdf3dc', color: '#c17d10' }}
					>
						<ClipboardCheckSvg />
					</div>
					<div className={styles.statInfo}>
						<div className={styles.statValue}>
							{d.loading ? '—' : d.pendingCount}
						</div>
						<div className={styles.statLabel}>Chờ phê duyệt</div>
					</div>
				</div>
				<div className={styles.statCard}>
					<div
						className={styles.statIcon}
						style={{ background: '#fcebeb', color: '#791f1f' }}
					>
						<WarnSvg />
					</div>
					<div className={styles.statInfo}>
						<div className={styles.statValue}>0</div>
						<div className={styles.statLabel}>Thông báo mới</div>
					</div>
				</div>
				<div className={styles.statCard}>
					<div
						className={styles.statIcon}
						style={{ background: '#e6f1fb', color: '#0c447c' }}
					>
						<CalendarSvg />
					</div>
					<div className={styles.statInfo}>
						<div className={styles.statValue}>28</div>
						<div className={styles.statLabel}>Ngày đến hạn nộp</div>
					</div>
				</div>
			</div>

			{/* ── Content grid ── */}
			<div className={styles.contentGrid}>
				{/* My topics */}
				<div className={styles.card}>
					<div className={styles.cardHeader}>
						<h3 className={styles.cardTitle}>Đề tài của tôi</h3>
						<button
							className={styles.cardLink}
							onClick={() => d.navigate('/user/my-topics')}
						>
							Xem tất cả →
						</button>
					</div>
					{d.loading ? (
						<div
							style={{
								padding: '24px 0',
								textAlign: 'center',
								color: '#888',
								fontSize: '0.875rem',
							}}
						>
							Đang tải...
						</div>
					) : d.error ? (
						<div
							style={{
								padding: '24px 0',
								textAlign: 'center',
								color: '#ef4444',
								fontSize: '0.875rem',
							}}
						>
							{d.error}
						</div>
					) : d.recentTopics.length === 0 ? (
						<div
							style={{
								padding: '24px 0',
								textAlign: 'center',
								color: '#888',
								fontSize: '0.875rem',
							}}
						>
							Chưa có đề tài nào.
						</div>
					) : (
						<div className={styles.topicList}>
							{d.recentTopics.map((t) => {
								const s = STATUS_LABELS[t.status];
								return (
									<div
										key={t.id}
										className={styles.topicItem}
										style={{ cursor: 'pointer' }}
										onClick={() =>
											d.navigate(`/user/my-topics/${t.id}`, {
												state: { topic: t },
											})
										}
									>
										<div className={styles.topicId}>{t.id}</div>
										<div className={styles.topicTitle}>{t.title}</div>
										<div className={styles.topicMeta}>
											<span
												className={styles.topicStatus}
												style={{ color: s.color, background: s.bg }}
											>
												{s.label}
											</span>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>

				{/* Quick actions */}
				<div className={styles.card}>
					<div className={styles.cardHeader}>
						<h3 className={styles.cardTitle}>Thao tác nhanh</h3>
					</div>
					<div className={styles.actionList}>
						<button
							className={styles.actionBtn}
							onClick={() => d.navigate('/user/register-topic')}
						>
							<div
								className={styles.actionIcon}
								style={{ background: '#e8f7f0', color: '#1e9460' }}
							>
								<DocPlusSvg />
							</div>
							<div className={styles.actionText}>
								<div className={styles.actionName}>Đăng ký đề tài</div>
								<div className={styles.actionDesc}>
									Tham gia đợt nghiên cứu 1 — 2026
								</div>
							</div>
							<ChevRSvg className={styles.actionArrow} />
						</button>
						<button
							className={styles.actionBtn}
							onClick={() => d.navigate('/user/my-topics')}
						>
							<div
								className={styles.actionIcon}
								style={{ background: '#e6f1fb', color: '#0c447c' }}
							>
								<ProgressSvg />
							</div>
							<div className={styles.actionText}>
								<div className={styles.actionName}>Báo cáo tiến độ</div>
								<div className={styles.actionDesc}>
									Cập nhật tiến độ đề tài đang thực hiện
								</div>
							</div>
							<ChevRSvg className={styles.actionArrow} />
						</button>
						<button
							className={styles.actionBtn}
							onClick={() => d.navigate('/user/profile')}
						>
							<div
								className={styles.actionIcon}
								style={{ background: '#f3f0fb', color: '#5b3fa6' }}
							>
								<UserSvg />
							</div>
							<div className={styles.actionText}>
								<div className={styles.actionName}>Hồ sơ cá nhân</div>
								<div className={styles.actionDesc}>
									Xem và chỉnh sửa thông tin tài khoản
								</div>
							</div>
							<ChevRSvg className={styles.actionArrow} />
						</button>
					</div>
				</div>
			</div>
		</UserLayout>
	);
}
