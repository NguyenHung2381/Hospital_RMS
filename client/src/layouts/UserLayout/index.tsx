import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Logo from '../../assets/logo.png';
import { NotificationPanel } from '../../features/notifications/components/NotificationPanel';
import { useNotifications } from '../../features/notifications/hooks/useNotifications';
import { toNotif } from '../../features/notifications/utils/notifUtils';
import {
	clearAuth,
	getStoredUser,
	type StoredUser,
} from '../../shared/utils/storage';
import styles from './UserLayout.module.css';
import { Icon } from './icons';

// ─── STORAGE KEY ──────────────────────────
const SIDEBAR_KEY = 'rms_user_sidebar_collapsed';

// ─── ROUTE MAP ────────────────────────────
const KEY_TO_PATH: Record<string, string> = {
	home: '/user',
	myTopics: '/user/my-topics',
	registerTopic: '/user/register-topic',
	councilProgress: '/user/council-progress',
	profile: '/user/profile',
	deptAccounts: '/user/department-accounts',
	notifications: '/user/notifications',
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
			{
				key: 'councilProgress',
				label: 'Đánh giá tiến độ',
				icon: <Icon.Grading />,
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
			{ key: 'notifications', label: 'Thông báo', icon: <Icon.Notif /> },
		],
	},
];

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
	hideSidebar?: boolean;
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
	hideSidebar = false,
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

	const [isMobile, setIsMobile] = useState(() =>
		typeof window !== 'undefined' ? window.innerWidth <= 1024 : false,
	);

	useEffect(() => {
		const mq = window.matchMedia('(max-width: 1024px)');
		const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	}, []);

	const effectiveCollapsed = isMobile ? false : collapsed;

	const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
	const {
		notifications: rawNotifs,
		unreadCount,
		markOne,
		markAll,
	} = useNotifications();
	const notifs = rawNotifs.map(toNotif);

	const navBadges: Record<string, number | undefined> = {
		notifications: unreadCount > 0 ? unreadCount : undefined,
	};

	// ── User menu state ──────────────────────
	const [userMenuOpen, setUserMenuOpen] = useState(false);
	const userMenuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (
				userMenuRef.current &&
				!userMenuRef.current.contains(e.target as Node)
			) {
				setUserMenuOpen(false);
			}
		};
		if (userMenuOpen) document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [userMenuOpen]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				closeSearch();
				setNotifOpen(false);
				setUserMenuOpen(false);
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, []);

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

	const handleNavClick = (key: string) => {
		const path = KEY_TO_PATH[key];
		if (path) {
			setMobileNavOpen(false);
			navigate(path);
		}
	};

	return (
		<div className={styles.userWrapper}>
			{/* Mobile Backdrop Overlay */}
			{!hideSidebar && mobileNavOpen && (
				<div
					className={styles.mobileBackdrop}
					onClick={() => setMobileNavOpen(false)}
				/>
			)}

			{/* ══ SIDEBAR ════════════════════════════ */}
			{!hideSidebar && (
			<aside
				className={`${styles.sidebar} ${effectiveCollapsed ? styles.collapsed : ''} ${mobileNavOpen ? styles.mobileDrawerOpen : ''}`}
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
						aria-label={
							effectiveCollapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'
						}
						title={effectiveCollapsed ? 'Mở rộng' : 'Thu gọn'}
					>
						<Icon.ChevronL />
					</button>
					<button
						className={styles.mobileMenuBtn}
						onClick={() => setMobileNavOpen(false)}
						aria-label='Đóng menu'
					>
						<Icon.X />
					</button>
				</div>

				{/* Nav */}
				<nav
					className={`${styles.sidebarNav} ${mobileNavOpen ? styles.mobileOpen : ''}`}
				>
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
									{(item.badge !== undefined || navBadges[item.key] !== undefined) && (
										<span
											className={
												Number(item.badge ?? navBadges[item.key]) > 50
													? styles.navBadge
													: styles.navBadgeGray
											}
										>
											{item.badge ?? navBadges[item.key]}
										</span>
									)}
								</button>
							))}
						</React.Fragment>
					))}
				</nav>

				{/* Footer user */}
				<div
					className={`${styles.sidebarFooter} ${mobileNavOpen ? styles.mobileOpen : ''}`}
				>
					<div
						className={styles.userMenuWrap}
						ref={userMenuRef}
					>
						{userMenuOpen && (
							<div className={styles.userDropdown}>
								<button
									className={styles.userDropdownItem}
									onClick={handleLogout}
								>
									<Icon.LogOut />
									<span>Đăng xuất</span>
								</button>
							</div>
						)}
						<div
							className={styles.userCard}
							title={collapsed ? userName : undefined}
							onClick={() => setUserMenuOpen((o) => !o)}
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
				</div>
			</aside>
			)}

			{/* ══ MAIN ═══════════════════════════════ */}
			<div className={`${styles.mainContent} ${hideSidebar ? styles.noSidebar : ''}`}>
				{/* Topbar */}
				<header className={styles.topbar}>
					<div className={styles.topbarLeft}>
						{!hideSidebar && (
						<button
							className={styles.mobileNavTrigger}
							onClick={() => setMobileNavOpen(true)}
							aria-label='Mở menu'
						>
							<Icon.Menu />
						</button>
						)}
						<div className={styles.mobileHeaderBrand}>
							<img
								src={Logo}
								alt='Logo'
								className={styles.mobileBrandLogo}
							/>
							<span className={styles.mobileBrandTitle}>Hospital RMS</span>
						</div>
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
						<NotificationPanel
							open={notifOpen}
							onToggle={() => setNotifOpen((o) => !o)}
							onClose={() => setNotifOpen(false)}
							notifications={notifs}
							unreadCount={unreadCount}
							onMarkAll={markAll}
							onMarkOne={markOne}
							s={styles}
						/>

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
