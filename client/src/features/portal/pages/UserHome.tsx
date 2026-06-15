import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CalendarSvg from '../../../assets/svg/calendar.svg?react';
import ChevRSvg from '../../../assets/svg/chev-r.svg?react';
import ClipboardCheckSvg from '../../../assets/svg/clipboard-check.svg?react';
import DocPlusSvg from '../../../assets/svg/doc-plus.svg?react';
import DocSvg from '../../../assets/svg/doc.svg?react';
import ProgressSvg from '../../../assets/svg/progress.svg?react';
import UserSvg from '../../../assets/svg/user.svg?react';
import WarnSvg from '../../../assets/svg/warn.svg?react';
import UserLayout from '../../../layouts/UserLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getStoredUser, type StoredUser } from '../../../lib/authStorage';
import { getTopics } from '../../topics/api/topicApi';
import type { Topic, TopicStatus } from '../../topics/types/topic.type';
import styles from './UserHome.module.css';

// ─── CONFIG ───────────────────────────────
const STATUS_LABELS: Record<
	TopicStatus,
	{ label: string; color: string; bg: string }
> = {
	submitted: { label: 'Chờ duyệt', color: '#c17d10', bg: '#fdf3dc' },
	approved: { label: 'Đang thực hiện', color: '#1e9460', bg: '#e8f7f0' },
	rejected: { label: 'Từ chối', color: '#991b1b', bg: '#fee2e2' },
	supplement: { label: 'Bổ sung', color: '#5b21b6', bg: '#ede9fe' },
};

// ─── COMPONENT ────────────────────────────
export default function UserHome() {
	const navigate = useNavigate();
	const user = getStoredUser<StoredUser>() ?? {};

	const fullName: string = user.full_name ?? user.username ?? 'Người dùng';
	const roleName: string = user.role_name ?? user.role ?? 'Thành viên';
	const dept: string = user.department ?? '';
	const currentUserId: string = user.id ?? '';

	const initials = fullName
		.split(' ')
		.map((w: string) => w[0])
		.filter(Boolean)
		.slice(-2)
		.join('')
		.toUpperCase();

	// ── State ──
	const [topics, setTopics] = useState<Topic[]>([]);
	const [loading, setLoading] = useState(!!currentUserId);
	const [error, setError] = useState('');
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('topic', refreshData);

	// ── Fetch ──
	useEffect(() => {
		if (!currentUserId) return;
		let cancelled = false;
		getTopics({ limit: 200, participant_id: currentUserId })
			.then((res) => {
				if (!cancelled) {
					setTopics(res.data);
					setLoading(false);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setError('Không thể tải dữ liệu.');
					setLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [currentUserId, refreshKey]);

	// ── Derived stats ──
	const pendingCount = topics.filter((t) => t.status === 'submitted').length;
	const recentTopics = topics.slice(0, 3);

	return (
		<UserLayout
			pageTitle={undefined}
			userName={fullName}
			userRole={roleName}
			userInitials={initials}
		>
			{/* ── Welcome banner ── */}
			<div className={styles.welcomeBanner}>
				<div className={styles.welcomeLeft}>
					<div className={styles.welcomeAvatar}>{initials}</div>
					<div className={styles.welcomeText}>
						<h2 className={styles.welcomeTitle}>
							Xin chào, {fullName.split(' ').pop()}!
						</h2>
						<p className={styles.welcomeSub}>
							{roleName}
							{dept ? ` · ${dept}` : ''}
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
							{loading ? '—' : topics.length}
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
							{loading ? '—' : pendingCount}
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
							onClick={() => navigate('/user/my-topics')}
						>
							Xem tất cả →
						</button>
					</div>

					{loading ? (
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
					) : error ? (
						<div
							style={{
								padding: '24px 0',
								textAlign: 'center',
								color: '#ef4444',
								fontSize: '0.875rem',
							}}
						>
							{error}
						</div>
					) : recentTopics.length === 0 ? (
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
							{recentTopics.map((t) => {
								const s = STATUS_LABELS[t.status];
								return (
									<div
										key={t.id}
										className={styles.topicItem}
										style={{ cursor: 'pointer' }}
										onClick={() =>
											navigate(`/user/my-topics/${t.id}`, {
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
							onClick={() => navigate('/user/register-topic')}
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
							onClick={() => navigate('/user/my-topics')}
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
							onClick={() => navigate('/user/profile')}
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
