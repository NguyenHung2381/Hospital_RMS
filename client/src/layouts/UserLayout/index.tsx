import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Logo from '../../assets/logo.png';
import { useNotifications } from '../../features/notifications/hooks/useNotifications';
import type { Notification as ApiNotif } from '../../features/notifications/api/notificationApi';
import {
	clearAuth,
	getStoredUser,
	type StoredUser,
} from '../../lib/authStorage';
import styles from './UserLayout.module.css';
import { Icon } from './icons';

// ─── STORAGE KEY ──────────────────────────
const SIDEBAR_KEY = 'rms_user_sidebar_collapsed';

// ─── ROUTE MAP ────────────────────────────
const KEY_TO_PATH: Record<string, string> = {
	home: '/user',
	myTopics: '/user/my-topics',
	registerTopic: '/user/register-topic',
	profile: '/user/profile',
	deptAccounts: '/user/department-accounts',
};

const PATH_TO_KEY: Record<string, string> = Object.fromEntries(
	Object.entries(KEY_TO_PATH).map(([k, v]) => [v, k]),
);

// ─── NAV CONFIG ───────────────────────────
interface NavItem {
	key: string;
	label: string;
	icon: React.ReactNode;
	badge?: number | string;
	restrictMember?: boolean;
	managerOnly?: boolean;
}
interface NavGroup {
	section: string;
	items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
	{
		section: 'Tổng quan',
		items: [{ key: 'home', label: 'Trang chủ', icon: <Icon.Dashboard /> }],
	},
	{
		section: 'Đề tài nghiên cứu',
		items: [
			{ key: 'myTopics', label: 'Đề tài của tôi', icon: <Icon.Topic /> },
			{
				key: 'registerTopic',
				label: 'Đăng ký đề tài',
				icon: <Icon.Register />,
				restrictMember: true,
			},
		],
	},
	{
		section: 'Tài khoản',
		items: [
			{ key: 'profile', label: 'Hồ sơ cá nhân', icon: <Icon.Profile /> },
			{
				key: 'deptAccounts',
				label: 'Tài khoản trong khoa',
				icon: <Icon.Users />,
				managerOnly: true,
			},
		],
	},
];

// ─── NOTIFICATIONS ────────────────────────
interface Notif {
	id: string;
	type: 'approval' | 'topic' | 'system' | 'warning';
	title: string;
	desc: string;
	time: string;
	read: boolean;
}

const NOTIF_TYPE_MAP: Record<string, Notif['type']> = {
	topic_approved: 'approval',
	topic_rejected: 'approval',
	topic_submitted: 'approval',
	deadline_reminder: 'warning',
	member_added: 'topic',
	account_granted: 'system',
};

function relativeTime(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const m = Math.floor(diff / 60000);
	if (m < 1) return 'Vừa xong';
	if (m < 60) return `${m} phút trước`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h} giờ trước`;
	const d = Math.floor(h / 24);
	if (d === 1) return 'Hôm qua';
	if (d < 7) return `${d} ngày trước`;
	return new Date(iso).toLocaleDateString('vi-VN');
}

function toNotif(n: ApiNotif): Notif {
	return {
		id: n.id,
		type: NOTIF_TYPE_MAP[n.type] ?? 'system',
		title: n.title,
		desc: n.message ?? '',
		time: relativeTime(n.created_at),
		read: n.is_read,
	};
}

// ─── PROPS ────────────────────────────────
export interface UserLayoutProps {
	children?: React.ReactNode;
	pageTitle?: string;
	pageSubtitle?: string;
	breadcrumbs?: { label: string; path?: string }[];
	headerActions?: React.ReactNode;
	userName?: string;
	userRole?: string;
	userInitials?: string;
}

// ─── COMPONENT ────────────────────────────
export default function UserLayout({
	children,
	pageTitle,
	pageSubtitle,
	breadcrumbs,
	headerActions,
	userName = 'Người dùng',
	userRole = 'Thành viên',
	userInitials,
}: UserLayoutProps) {
	const navigate = useNavigate();
	const location = useLocation();

	const activePage = PATH_TO_KEY[location.pathname] ?? 'home';

	const storedAccountType = getStoredUser<StoredUser>()?.account_type;
	const isMemberAccount = storedAccountType === 'member';
	const isManagerAccount = ['admin', 'director', 'manager', 'dept'].includes(
		storedAccountType ?? '',
	);

	const visibleNavGroups = NAV_GROUPS.map((g) => ({
		...g,
		items: g.items.filter((item) => {
			if (item.restrictMember && isMemberAccount) return false;
			if (item.managerOnly && !isManagerAccount) return false;
			return true;
		}),
	})).filter((g) => g.items.length > 0);

	// ── Sidebar collapsed state ───────────────
	const [collapsed, setCollapsed] = useState<boolean>(() => {
		if (typeof window === 'undefined') return false;
		return localStorage.getItem(SIDEBAR_KEY) === 'true';
	});

	const toggleSidebar = useCallback(() => {
		setCollapsed((prev) => {
			const next = !prev;
			localStorage.setItem(SIDEBAR_KEY, String(next));
			return next;
		});
	}, []);

	const handleLogout = useCallback(() => {
		clearAuth();
		navigate('/login');
	}, [navigate]);

	// ── Search state ──────────────────────────
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchValue, setSearchValue] = useState('');
	const searchInputRef = useRef<HTMLInputElement>(null);

	const openSearch = () => {
		setSearchOpen(true);
		setTimeout(() => searchInputRef.current?.focus(), 50);
	};

	const closeSearch = () => {
		setSearchOpen(false);
		setSearchValue('');
	};

	// ── Notification state ────────────────────
	const [notifOpen, setNotifOpen] = useState(false);
	const [notifTab, setNotifTab] = useState<'all' | 'unread'>('all');
	const {
		notifications: rawNotifs,
		unreadCount,
		markOne,
		markAll,
	} = useNotifications();
	const notifs = rawNotifs.map(toNotif);
	const notifWrapRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				closeSearch();
				setNotifOpen(false);
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, []);

	const markAllRead = markAll;
	const markOneRead = markOne;

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (
				notifWrapRef.current &&
				!notifWrapRef.current.contains(e.target as Node)
			) {
				setNotifOpen(false);
			}
		};
		if (notifOpen) document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [notifOpen]);

	// ── Initials ──────────────────────────────
	const initials =
		userInitials ??
		userName
			.split(' ')
			.map((w) => w[0])
			.slice(-2)
			.join('')
			.toUpperCase();

	const currentLabel =
		NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === activePage)
			?.label ?? 'Đề tài của tôi';

	const notifIconMap = {
		approval: { el: <Icon.IcCheck />, cls: styles.iconApproval },
		topic: { el: <Icon.IcDoc />, cls: styles.iconTopic },
		system: { el: <Icon.IcInfo />, cls: styles.iconSystem },
		warning: { el: <Icon.IcWarn />, cls: styles.iconWarning },
	};

	const displayedNotifs =
		notifTab === 'unread' ? notifs.filter((n) => !n.read) : notifs;

	const handleNavClick = (key: string) => {
		const path = KEY_TO_PATH[key];
		if (path) navigate(path);
	};

	return (
		<div className={styles.userWrapper}>
			{/* ══ SIDEBAR ════════════════════════════ */}
			<aside
				className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}
			>
				{/* Header */}
				<div className={styles.sidebarHeader}>
					<div className={styles.sidebarBrand}>
						<div className={styles.sidebarLogo}>
							<img
								src={Logo}
								alt='Logo BV Nghệ An'
							/>
						</div>
						<div className={styles.sidebarBrandText}>
							<div className={styles.sidebarBrandName}>BV Hữu Nghị NK</div>
							<div className={styles.sidebarBrandSub}>Cổng người dùng</div>
						</div>
					</div>
					<button
						className={styles.collapseBtn}
						onClick={toggleSidebar}
						aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
						title={collapsed ? 'Mở rộng' : 'Thu gọn'}
					>
						<Icon.ChevronL />
					</button>
				</div>

				{/* Nav */}
				<nav className={styles.sidebarNav}>
					{visibleNavGroups.map((group) => (
						<React.Fragment key={group.section}>
							<div className={styles.navSection}>{group.section}</div>
							{group.items.map((item) => (
								<button
									key={item.key}
									type='button'
									className={`${styles.navItem} ${activePage === item.key ? styles.active : ''}`}
									data-label={item.label}
									onClick={() => handleNavClick(item.key)}
									title={collapsed ? item.label : undefined}
								>
									{item.icon}
									<span className={styles.navLabel}>{item.label}</span>
									{item.badge !== undefined && (
										<span
											className={
												Number(item.badge) > 50
													? styles.navBadge
													: styles.navBadgeGray
											}
										>
											{item.badge}
										</span>
									)}
								</button>
							))}
						</React.Fragment>
					))}
				</nav>

				{/* Footer user */}
				<div className={styles.sidebarFooter}>
					<div
						className={styles.userCard}
						title={collapsed ? userName : undefined}
					>
						<div className={styles.userAvatar}>{initials}</div>
						<div className={styles.userInfo}>
							<div className={styles.userName}>{userName}</div>
							<div className={styles.userRole}>{userRole}</div>
						</div>
						<span className={styles.userMenuIcon}>
							<Icon.MoreV />
						</span>
					</div>
				</div>
			</aside>

			{/* ══ MAIN ═══════════════════════════════ */}
			<div className={styles.mainContent}>
				{/* Topbar */}
				<header className={styles.topbar}>
					<div className={styles.topbarLeft}>
						{/* Breadcrumb */}
						<div className={styles.breadcrumb}>
							<span className={styles.breadcrumbItem}>Cổng người dùng</span>
							<span className={styles.breadcrumbSep}>/</span>
							{breadcrumbs?.map((bc, i) => (
								<React.Fragment key={i}>
									{bc.path ? (
										<button
											className={styles.breadcrumbItem}
											style={{
												background: 'none',
												border: 'none',
												cursor: 'pointer',
												padding: 0,
												font: 'inherit',
											}}
											onClick={() => navigate(bc.path!)}
										>
											{bc.label}
										</button>
									) : (
										<span className={styles.breadcrumbItem}>{bc.label}</span>
									)}
									<span className={styles.breadcrumbSep}>/</span>
								</React.Fragment>
							))}
							<span className={styles.breadcrumbCurrent}>{currentLabel}</span>
						</div>

						{/* Search bar */}
						<div
							className={`${styles.searchBar} ${searchOpen ? styles.searchOpen : ''}`}
							onClick={!searchOpen ? openSearch : undefined}
							role='search'
						>
							<div className={styles.searchIconBtn}>
								<Icon.Search />
							</div>
							<input
								ref={searchInputRef}
								className={styles.searchInput}
								placeholder='Tìm kiếm đề tài, thông báo...'
								value={searchValue}
								onChange={(e) => setSearchValue(e.target.value)}
								tabIndex={searchOpen ? 0 : -1}
							/>
							{searchOpen && (
								<button
									className={styles.searchClear}
									onClick={closeSearch}
									aria-label='Đóng tìm kiếm'
								>
									<Icon.X />
								</button>
							)}
						</div>
					</div>

					<div className={styles.topbarRight}>
						{/* Round indicator */}
						<div className={styles.roundIndicator}>
							<span className={styles.roundDot} />
							Đợt 1 — 2026
						</div>

						<div className={styles.topbarDivider} />

						{/* Notification */}
						<div
							className={styles.notifWrapper}
							ref={notifWrapRef}
						>
							<button
								className={`${styles.topbarIconBtn} ${notifOpen ? styles.active : ''}`}
								onClick={() => setNotifOpen((o) => !o)}
								aria-label='Thông báo'
								aria-expanded={notifOpen}
							>
								<Icon.Bell />
								{unreadCount > 0 && <span className={styles.notifDot} />}
							</button>

							{notifOpen && (
								<>
									<div
										className={styles.notifOverlay}
										onClick={() => setNotifOpen(false)}
									/>
									<div
										className={styles.notifPanel}
										role='dialog'
										aria-label='Thông báo'
									>
										{/* Header */}
										<div className={styles.notifPanelHeader}>
											<span className={styles.notifPanelTitle}>
												Thông báo
												{unreadCount > 0 && (
													<span
														style={{
															marginLeft: 8,
															background: 'var(--color-accent)',
															color: '#fff',
															fontSize: 11,
															fontWeight: 700,
															padding: '1px 7px',
															borderRadius: 999,
														}}
													>
														{unreadCount}
													</span>
												)}
											</span>
											<div className={styles.notifPanelActions}>
												{unreadCount > 0 && (
													<button
														className={styles.notifMarkAll}
														onClick={markAllRead}
													>
														Đánh dấu đã đọc
													</button>
												)}
												<button
													className={styles.notifClose}
													onClick={() => setNotifOpen(false)}
													aria-label='Đóng'
												>
													<Icon.X />
												</button>
											</div>
										</div>

										{/* Tabs */}
										<div className={styles.notifTabs}>
											{(['all', 'unread'] as const).map((tab) => (
												<div
													key={tab}
													className={`${styles.notifTab} ${notifTab === tab ? styles.notifTabActive : ''}`}
													onClick={() => setNotifTab(tab)}
												>
													{tab === 'all' ? 'Tất cả' : 'Chưa đọc'}
													<span className={styles.notifTabBadge}>
														{tab === 'all' ? notifs.length : unreadCount}
													</span>
												</div>
											))}
										</div>

										{/* List */}
										<div className={styles.notifList}>
											{displayedNotifs.length === 0 ? (
												<div
													style={{
														padding: '32px 24px',
														textAlign: 'center',
														color: 'var(--color-gray-400)',
														fontSize: 13,
													}}
												>
													Không có thông báo nào
												</div>
											) : (
												displayedNotifs.map((n) => {
													const cfg = notifIconMap[n.type];
													return (
														<div
															key={n.id}
															className={`${styles.notifItem} ${!n.read ? styles.unread : ''}`}
															onClick={() => markOneRead(n.id)}
														>
															<div
																className={`${styles.notifItemIcon} ${cfg.cls}`}
															>
																{cfg.el}
															</div>
															<div className={styles.notifItemContent}>
																<div className={styles.notifItemTitle}>
																	{n.title}
																</div>
																<div className={styles.notifItemDesc}>
																	{n.desc}
																</div>
																<div className={styles.notifItemTime}>
																	{n.time}
																</div>
															</div>
														</div>
													);
												})
											)}
										</div>

										{/* Footer */}
										<div className={styles.notifPanelFooter}>
											<button className={styles.notifViewAll}>
												Xem tất cả thông báo →
											</button>
										</div>
									</div>
								</>
							)}
						</div>

						<div className={styles.topbarDivider} />

						{/* Logout */}
						<button
							className={styles.topbarIconBtn}
							onClick={handleLogout}
							title='Đăng xuất'
							aria-label='Đăng xuất'
						>
							<Icon.LogOut />
						</button>
					</div>
				</header>

				{/* Page content */}
				<main className={styles.pageArea}>
					{(pageTitle || headerActions) && (
						<div className={styles.pageHeader}>
							<div className={styles.pageHeaderLeft}>
								{pageTitle && <h1 className={styles.pageTitle}>{pageTitle}</h1>}
								{pageSubtitle && (
									<p className={styles.pageSubtitle}>{pageSubtitle}</p>
								)}
							</div>
							{headerActions && (
								<div className={styles.pageHeaderRight}>{headerActions}</div>
							)}
						</div>
					)}

					{children}
				</main>
			</div>
		</div>
	);
}
