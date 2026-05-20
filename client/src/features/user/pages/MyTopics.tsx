import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import UserLayout from '../../../layouts/UserLayout';
import { useRealtimeUpdate } from '../../../hooks/useRealtime';
import styles from './MyTopics.module.css';
import { getStoredUser } from '../../../lib/authStorage';
import { getTopics } from '../../topics/api/topicApi';
import type { Topic, TopicStatus, MemberRole } from '../../topics/types/topic.type';

// ─── CONFIG ───────────────────────────────
const STATUS_CFG: Record<
	TopicStatus,
	{ label: string; dot: string; bg: string; color: string }
> = {
	submitted: {
		label: 'Chờ duyệt',
		dot: '#f59e0b',
		bg: '#fef3c7',
		color: '#92400e',
	},
	approved: {
		label: 'Đã duyệt',
		dot: '#22c55e',
		bg: '#dcfce7',
		color: '#166534',
	},
	rejected: {
		label: 'Từ chối',
		dot: '#ef4444',
		bg: '#fee2e2',
		color: '#991b1b',
	},
	supplement: {
		label: 'Bổ sung',
		dot: '#8b5cf6',
		bg: '#ede9fe',
		color: '#5b21b6',
	},
};

type CategoryTab = 'department' | 'mine';
type FilterTab = 'all' | TopicStatus;

const STATUS_TABS: { key: FilterTab; label: string }[] = [
	{ key: 'all', label: 'Tất cả' },
	{ key: 'submitted', label: 'Chờ duyệt' },
	{ key: 'approved', label: 'Đã duyệt' },
	{ key: 'rejected', label: 'Từ chối' },
	{ key: 'supplement', label: 'Bổ sung' },
];

function isDeptAccount(accountType: string) {
	return (
		accountType === 'manager' ||
		accountType === 'admin' ||
		accountType === 'dept'
	);
}

// ─── ICONS ────────────────────────────────
const Icon = {
	Plus: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<line
				x1='12'
				y1='5'
				x2='12'
				y2='19'
			/>
			<line
				x1='5'
				y1='12'
				x2='19'
				y2='12'
			/>
		</svg>
	),
	Search: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<circle
				cx='11'
				cy='11'
				r='8'
			/>
			<line
				x1='21'
				y1='21'
				x2='16.65'
				y2='16.65'
			/>
		</svg>
	),
	Users: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' />
			<circle
				cx='9'
				cy='7'
				r='4'
			/>
			<path d='M23 21v-2a4 4 0 0 0-3-3.87' />
			<path d='M16 3.13a4 4 0 0 1 0 7.75' />
		</svg>
	),
	Calendar: () => (
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
	),
	Building: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<rect
				x='2'
				y='3'
				width='20'
				height='14'
				rx='2'
				ry='2'
			/>
			<path d='M8 21h8' />
			<path d='M12 17v4' />
		</svg>
	),
	UserCheck: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' />
			<circle
				cx='9'
				cy='7'
				r='4'
			/>
			<polyline points='16 11 18 13 22 9' />
		</svg>
	),
	Empty: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.5'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
			<polyline points='14 2 14 8 20 8' />
		</svg>
	),
};

function fmtDate(iso: string) {
	return new Date(iso).toLocaleDateString('vi-VN', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	});
}

// ─── TOPIC CARD ───────────────────────────
const ROLE_LABEL: Record<MemberRole, string> = {
	leader: 'Chủ nhiệm',
	secretary: 'Thư ký',
	member: 'Thành viên',
};

function TopicCard({
	topic,
	isMine,
	onClick,
}: {
	topic: Topic;
	isMine: boolean;
	onClick: () => void;
}) {
	const cfg = STATUS_CFG[topic.status];
	return (
		<div
			className={styles.topicCard}
			onClick={onClick}
			style={{ cursor: 'pointer' }}
		>
			<div className={styles.cardTop}>
				<div className={styles.topicId}>{topic.id}</div>
				<div className={styles.cardTopRight}>
					{isMine && topic.my_role && (
						<span className={styles.roleBadge}>
							{ROLE_LABEL[topic.my_role]}
						</span>
					)}
					<span
						className={styles.statusBadge}
						style={{ background: cfg.bg, color: cfg.color }}
					>
						<span
							className={styles.statusDot}
							style={{ background: cfg.dot }}
						/>
						{cfg.label}
					</span>
				</div>
			</div>
			<div className={styles.topicTitle}>{topic.title}</div>
			{topic.description && (
				<div className={styles.topicDesc}>{topic.description}</div>
			)}
			<div className={styles.cardMeta}>
				<span className={styles.metaItem}>
					<Icon.Users />
					{topic.member_count ?? 0} thành viên
				</span>
				<span className={styles.metaItem}>
					<Icon.Calendar />
					{fmtDate(topic.created_at)}
				</span>
			</div>
			<div className={styles.progressRow}>
				<span className={styles.progressLabel}>Tiến độ</span>
				<span className={styles.progressValue}>{topic.progress ?? 0}%</span>
			</div>
			<div className={styles.progressBar}>
				<div
					className={styles.progressFill}
					style={{ width: `${topic.progress ?? 0}%` }}
				/>
			</div>
		</div>
	);
}

// ─── TOPIC SECTION ────────────────────────
function TopicSection({
	topics,
	search,
	isMine,
	canRegister,
	onRegister,
	onTopicClick,
}: {
	topics: Topic[];
	search: string;
	isMine: boolean;
	canRegister: boolean;
	onRegister: () => void;
	onTopicClick: (topic: Topic) => void;
}) {
	const [activeTab, setActiveTab] = useState<FilterTab>('all');

	const counts = useMemo(() => {
		const map: Record<FilterTab, number> = {
			all: topics.length,
			submitted: 0,
			approved: 0,
			rejected: 0,
			supplement: 0,
		};
		topics.forEach((t) => {
			map[t.status] = (map[t.status] ?? 0) + 1;
		});
		return map;
	}, [topics]);

	const filtered = useMemo(() => {
		let list = topics;
		if (activeTab !== 'all') list = list.filter((t) => t.status === activeTab);
		if (search.trim()) {
			const q = search.toLowerCase();
			list = list.filter(
				(t) =>
					t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q),
			);
		}
		return list;
	}, [topics, activeTab, search]);

	return (
		<div className={styles.section}>
			<div className={styles.statusBar}>
				<div className={styles.statusTabs}>
					{STATUS_TABS.map((tab) => (
						<button
							key={tab.key}
							className={`${styles.statusTab} ${activeTab === tab.key ? styles.statusTabActive : ''}`}
							onClick={() => setActiveTab(tab.key)}
						>
							{tab.label}
							<span
								className={`${styles.tabBadge} ${activeTab === tab.key ? styles.tabBadgeActive : ''}`}
							>
								{counts[tab.key]}
							</span>
						</button>
					))}
				</div>
				<span className={styles.totalLabel}>{topics.length} đề tài</span>
			</div>

			{filtered.length === 0 ? (
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<Icon.Empty />
					</div>
					<div className={styles.emptyTitle}>
						{search ? 'Không tìm thấy đề tài phù hợp' : 'Chưa có đề tài nào'}
					</div>
					<div className={styles.emptyDesc}>
						{search
							? 'Thử từ khoá khác hoặc đổi bộ lọc.'
							: isMine
								? 'Bạn chưa tham gia hoặc đăng ký đề tài nào.'
								: 'Khoa chưa có đề tài nào trong hệ thống.'}
					</div>
					{!search && isMine && canRegister && (
						<button
							className={styles.btnPrimary}
							onClick={onRegister}
						>
							<Icon.Plus />
							Đăng ký đề tài mới
						</button>
					)}
				</div>
			) : (
				<div className={styles.topicGrid}>
					{filtered.map((t) => (
						<TopicCard
							key={t.id}
							topic={t}
							isMine={isMine}
							onClick={() => onTopicClick(t)}
						/>
					))}
				</div>
			)}
		</div>
	);
}

// ─── MAIN COMPONENT ───────────────────────
export default function MyTopics() {
	const navigate = useNavigate();
	const userInfo = getStoredUser<Record<string, string>>();

	const fullName = userInfo?.full_name ?? userInfo?.username ?? 'Người dùng';
	const userRole = userInfo?.role ?? userInfo?.role_name ?? 'Thành viên';
	const currentUserId = userInfo?.id ?? '';
	const userDeptId = userInfo?.department_id ?? '';
	const accountType = userInfo?.account_type ?? 'member';
	const canSeeDept = isDeptAccount(accountType);

	const initials = fullName
		.split(' ')
		.map((w: string) => w[0])
		.filter(Boolean)
		.slice(-2)
		.join('')
		.toUpperCase();

	// ── State ──
	const [deptTopics, setDeptTopics] = useState<Topic[]>([]);
	const [myTopics, setMyTopics] = useState<Topic[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [search, setSearch] = useState('');
	const [category, setCategory] = useState<CategoryTab>('department');
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('topic', refreshData);

	// ── Fetch ──
	useEffect(() => {
		if (!currentUserId) return;

		const deptParams = userDeptId
			? { limit: 200, department_id: userDeptId }
			: { limit: 200 };

		async function fetchTopics() {
			setLoading(true);
			setError('');
			try {
				if (canSeeDept) {
					const [deptRes, myRes] = await Promise.all([
						getTopics(deptParams),
						getTopics({ limit: 200, participant_id: currentUserId }),
					]);
					setDeptTopics(deptRes.data);
					setMyTopics(myRes.data);
				} else {
					const res = await getTopics({
						limit: 200,
						participant_id: currentUserId,
					});
					setMyTopics(res.data);
				}
			} catch {
				setError('Không thể tải danh sách đề tài.');
			} finally {
				setLoading(false);
			}
		}

		fetchTopics();
	}, [canSeeDept, currentUserId, userDeptId, refreshKey]);

	const activeTopics = canSeeDept
		? category === 'department'
			? deptTopics
			: myTopics
		: myTopics;

	const canRegister = accountType !== 'member';

	const headerActions = canRegister ? (
		<button
			className={styles.btnPrimary}
			onClick={() => navigate('/user/register-topic')}
		>
			<Icon.Plus />
			Đăng ký đề tài mới
		</button>
	) : null;

	return (
		<UserLayout
			pageTitle='Đề tài nghiên cứu'
			pageSubtitle={
				canSeeDept
					? 'Quản lý đề tài theo khoa và cá nhân'
					: 'Đề tài bạn tham gia hoặc đăng ký'
			}
			breadcrumbs={[{ label: 'Đề tài nghiên cứu' }]}
			headerActions={headerActions}
			userName={fullName}
			userRole={userRole}
			userInitials={initials}
		>
			{loading ? (
				<div className={styles.stateBox}>
					<div className={styles.spinner} />
					<span>Đang tải...</span>
				</div>
			) : error ? (
				<div
					className={styles.stateBox}
					style={{ color: '#ef4444' }}
				>
					{error}
				</div>
			) : (
				<>
					{/* ── Search ── */}
					<div className={styles.searchBox}>
						<span className={styles.searchIcon}>
							<Icon.Search />
						</span>
						<input
							className={styles.searchInput}
							placeholder='Tìm kiếm đề tài...'
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>

					{/* ── Category cards — chỉ tài khoản khoa mới thấy ── */}
					{canSeeDept && (
						<div className={styles.categoryRow}>
							<button
								className={`${styles.categoryCard} ${category === 'department' ? styles.categoryCardActive : ''}`}
								onClick={() => {
									setCategory('department');
									setSearch('');
								}}
							>
								<div
									className={`${styles.categoryIcon} ${category === 'department' ? styles.categoryIconActive : ''}`}
								>
									<Icon.Building />
								</div>
								<div className={styles.categoryText}>
									<div className={styles.categoryLabel}>Đề tài của khoa</div>
									<div className={styles.categoryDesc}>
										Toàn bộ đề tài thuộc khoa/phòng
									</div>
								</div>
								<div
									className={`${styles.categoryCount} ${category === 'department' ? styles.categoryCountActive : ''}`}
								>
									{deptTopics.length}
								</div>
							</button>

							<button
								className={`${styles.categoryCard} ${category === 'mine' ? styles.categoryCardActive : ''}`}
								onClick={() => {
									setCategory('mine');
									setSearch('');
								}}
							>
								<div
									className={`${styles.categoryIcon} ${category === 'mine' ? styles.categoryIconActive : ''}`}
								>
									<Icon.UserCheck />
								</div>
								<div className={styles.categoryText}>
									<div className={styles.categoryLabel}>
										Đề tài tôi tham gia
									</div>
									<div className={styles.categoryDesc}>
										Đề tài tôi đăng ký hoặc là thành viên
									</div>
								</div>
								<div
									className={`${styles.categoryCount} ${category === 'mine' ? styles.categoryCountActive : ''}`}
								>
									{myTopics.length}
								</div>
							</button>
						</div>
					)}

					{/* ── Section label ── */}
					<div className={styles.sectionHeading}>
						<span className={styles.sectionDot} />
						{canSeeDept
							? category === 'department'
								? 'Đề tài của khoa'
								: 'Đề tài tôi tham gia'
							: 'Đề tài của tôi'}
					</div>

					{/* ── Topic section ── */}
					<TopicSection
						key={category}
						topics={activeTopics}
						search={search}
						isMine={!canSeeDept || category === 'mine'}
						canRegister={canRegister}
						onRegister={() => navigate('/user/register-topic')}
						onTopicClick={(t) =>
							navigate(`/user/my-topics/${t.id}`, { state: { topic: t } })
						}
					/>
				</>
			)}
		</UserLayout>
	);
}
