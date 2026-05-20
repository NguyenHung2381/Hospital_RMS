import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import UserLayout from '../../../layouts/UserLayout';
import { useRealtimeUpdate } from '../../../hooks/useRealtime';
import styles from './UserHome.module.css';
import { getStoredUser, type StoredUser } from '../../../lib/authStorage';
import { getTopics } from '../../topics/api/topicApi';
import type { Topic, TopicStatus } from '../../topics/types/topic.type';

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
						<svg
							viewBox='0 0 24 24'
							fill='none'
							stroke='currentColor'
							strokeWidth='2'
							strokeLinecap='round'
							strokeLinejoin='round'
						>
							<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
							<polyline points='14 2 14 8 20 8' />
						</svg>
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
						<svg
							viewBox='0 0 24 24'
							fill='none'
							stroke='currentColor'
							strokeWidth='2'
							strokeLinecap='round'
							strokeLinejoin='round'
						>
							<polyline points='9 11 12 14 22 4' />
							<path d='M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' />
						</svg>
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
						<svg
							viewBox='0 0 24 24'
							fill='none'
							stroke='currentColor'
							strokeWidth='2'
							strokeLinecap='round'
							strokeLinejoin='round'
						>
							<path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' />
							<line
								x1='12'
								y1='9'
								x2='12'
								y2='13'
							/>
							<line
								x1='12'
								y1='17'
								x2='12.01'
								y2='17'
							/>
						</svg>
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
						<svg
							viewBox='0 0 24 24'
							fill='none'
							stroke='currentColor'
							strokeWidth='2'
							strokeLinecap='round'
							strokeLinejoin='round'
						>
							<rect
								x='3'
								y='4'
								width='18'
								height='18'
								rx='2'
								ry='2'
							/>
							<line
								x1='16'
								y1='2'
								x2='16'
								y2='6'
							/>
							<line
								x1='8'
								y1='2'
								x2='8'
								y2='6'
							/>
							<line
								x1='3'
								y1='10'
								x2='21'
								y2='10'
							/>
						</svg>
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
						<div style={{ padding: '24px 0', textAlign: 'center', color: '#888', fontSize: '0.875rem' }}>
							Đang tải...
						</div>
					) : error ? (
						<div style={{ padding: '24px 0', textAlign: 'center', color: '#ef4444', fontSize: '0.875rem' }}>
							{error}
						</div>
					) : recentTopics.length === 0 ? (
						<div style={{ padding: '24px 0', textAlign: 'center', color: '#888', fontSize: '0.875rem' }}>
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
								<svg
									viewBox='0 0 24 24'
									fill='none'
									stroke='currentColor'
									strokeWidth='2'
									strokeLinecap='round'
									strokeLinejoin='round'
								>
									<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
									<polyline points='14 2 14 8 20 8' />
									<line
										x1='12'
										y1='18'
										x2='12'
										y2='12'
									/>
									<line
										x1='9'
										y1='15'
										x2='15'
										y2='15'
									/>
								</svg>
							</div>
							<div className={styles.actionText}>
								<div className={styles.actionName}>Đăng ký đề tài</div>
								<div className={styles.actionDesc}>
									Tham gia đợt nghiên cứu 1 — 2026
								</div>
							</div>
							<svg
								className={styles.actionArrow}
								viewBox='0 0 24 24'
								fill='none'
								stroke='currentColor'
								strokeWidth='2'
								strokeLinecap='round'
								strokeLinejoin='round'
							>
								<polyline points='9 18 15 12 9 6' />
							</svg>
						</button>

						<button
							className={styles.actionBtn}
							onClick={() => navigate('/user/my-topics')}
						>
							<div
								className={styles.actionIcon}
								style={{ background: '#e6f1fb', color: '#0c447c' }}
							>
								<svg
									viewBox='0 0 24 24'
									fill='none'
									stroke='currentColor'
									strokeWidth='2'
									strokeLinecap='round'
									strokeLinejoin='round'
								>
									<line
										x1='18'
										y1='20'
										x2='18'
										y2='10'
									/>
									<line
										x1='12'
										y1='20'
										x2='12'
										y2='4'
									/>
									<line
										x1='6'
										y1='20'
										x2='6'
										y2='14'
									/>
								</svg>
							</div>
							<div className={styles.actionText}>
								<div className={styles.actionName}>Báo cáo tiến độ</div>
								<div className={styles.actionDesc}>
									Cập nhật tiến độ đề tài đang thực hiện
								</div>
							</div>
							<svg
								className={styles.actionArrow}
								viewBox='0 0 24 24'
								fill='none'
								stroke='currentColor'
								strokeWidth='2'
								strokeLinecap='round'
								strokeLinejoin='round'
							>
								<polyline points='9 18 15 12 9 6' />
							</svg>
						</button>

						<button
							className={styles.actionBtn}
							onClick={() => navigate('/user/profile')}
						>
							<div
								className={styles.actionIcon}
								style={{ background: '#f3f0fb', color: '#5b3fa6' }}
							>
								<svg
									viewBox='0 0 24 24'
									fill='none'
									stroke='currentColor'
									strokeWidth='2'
									strokeLinecap='round'
									strokeLinejoin='round'
								>
									<path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' />
									<circle
										cx='12'
										cy='7'
										r='4'
									/>
								</svg>
							</div>
							<div className={styles.actionText}>
								<div className={styles.actionName}>Hồ sơ cá nhân</div>
								<div className={styles.actionDesc}>
									Xem và chỉnh sửa thông tin tài khoản
								</div>
							</div>
							<svg
								className={styles.actionArrow}
								viewBox='0 0 24 24'
								fill='none'
								stroke='currentColor'
								strokeWidth='2'
								strokeLinecap='round'
								strokeLinejoin='round'
							>
								<polyline points='9 18 15 12 9 6' />
							</svg>
						</button>
					</div>
				</div>
			</div>
		</UserLayout>
	);
}
