import {
	ChevLSvg,
	LogoutSvg,
	MenuSvg,
	MoreVSvg,
	UserSvg,
	XSvg,
} from '@/assets/icons';
import React, {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Logo from '../../assets/logo.png';
import { logout, type LoginUser } from '../../features/auth/api/authApi';
import { DASHBOARD_TABS } from '../../features/dashboard/constants/dashboardTabs';
import { getMyTasks } from '../../features/my-tasks/api/myTasksApi';
import { NotificationPanel } from '../../features/notifications/components/NotificationPanel';
import { useNotifications } from '../../features/notifications/hooks/useNotifications';
import { toNotif } from '../../features/notifications/utils/notifUtils';
import { getTopics } from '../../features/topics/api/topicApi';
import TwoFactorReminder from '../../shared/components/TwoFactorReminder';
import { useHiddenMenus } from '../../shared/hooks/useMenuConfig';
import { useModules } from '../../shared/hooks/useModules';
import { usePermission } from '../../shared/hooks/usePermission';
import { getInitials } from '../../shared/utils/helper';
import { getStoredUser } from '../../shared/utils/storage';
import { useRealtimeUpdate } from '../hooks/useRealtime';
import styles from './AdminLayout.module.css';
import { ADMIN_MENU, KEY_TO_PATH, NAV_GROUPS, PATH_TO_KEY, moduleOf } from './nav';

// ─── STORAGE KEY ──────────────────────────
const SIDEBAR_KEY = 'rms_sidebar_collapsed';
const NAV_SCROLL_KEY = 'rms_sidebar_scroll';

// ─── PROPS ────────────────────────────────
export interface AdminLayoutProps {
	children?: React.ReactNode;
	pageTitle?: string;
	pageSubtitle?: string;
	breadcrumbs?: { label: string }[];
	headerActions?: React.ReactNode;
}

// ─── COMPONENT ────────────────────────────
export default function AdminLayout({
	children,
	pageTitle,
	pageSubtitle,
	breadcrumbs,
	headerActions,
}: AdminLayoutProps) {
	const storedUser = getStoredUser<LoginUser>();
	const userName = storedUser?.full_name ?? 'Người dùng';
	const userRole = storedUser?.role ?? '';
	const navigate = useNavigate();
	const location = useLocation();

	// Lọc menu theo quyền của vai trò, module bật và mục quản trị tắt ở tab
	// "Menu hiển thị" (giữ nhóm nếu còn ít nhất 1 mục).
	const { has } = usePermission();
	const modules = useModules();
	const hiddenMenus = useHiddenMenus('admin', ADMIN_MENU);
	const navGroups = NAV_GROUPS.map((g) => ({
		...g,
		items: g.items.filter(
			(it) =>
				has(it.perm) &&
				modules[moduleOf(g.section, it.key)] !== false &&
				!hiddenMenus.has(it.key),
		),
	})).filter((g) => g.items.length > 0);
	const moduleOff = [
		...NAV_GROUPS.flatMap((g) =>
			g.items
				.filter((it) => modules[moduleOf(g.section, it.key)] === false)
				.map((it) => KEY_TO_PATH[it.key]),
		),
		...DASHBOARD_TABS.filter(
			(t) => t.module && modules[t.module] === false,
		).map((t) => t.to),
	].some(
		(p) =>
			p && (location.pathname === p || location.pathname.startsWith(`${p}/`)),
	);

	// Tự detect activePage từ URL hiện tại
	// Trang chi tiết (/admin/courses/:id, /admin/seminars/:id…) → mục của trang cha
	const activePage =
		PATH_TO_KEY[location.pathname] ??
		PATH_TO_KEY[location.pathname.replace(/\/[^/]+$/, '')] ??
		'dashboard';
	// Vào thẳng URL của mục đã tắt (kể cả trang con) cũng chặn như module tắt.
	const pageOff = moduleOff || hiddenMenus.has(activePage);

	// ── Ngày hôm nay (topbar) ──
	const todayLabel = new Date().toLocaleDateString('vi-VN', {
		weekday: 'long',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	});

	// ── Sidebar collapsed state (persist) ───
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

	// Thu hồi phiên trên server (refresh token trong cookie) rồi mới rời trang
	const handleLogout = useCallback(async () => {
		await logout();
		navigate('/login');
	}, [navigate]);

	// ── Nav badge counts (từ API) ────────────
	const [navBadges, setNavBadges] = useState<{
		topics?: number;
		myTasks?: number;
		notifications?: number;
	}>({});

	const fetchBadges = useCallback(() => {
		// myTasks: số việc THỰC SỰ chờ actor này (đề tài chờ duyệt theo
		// allowed_actions + chấm tiến độ hội đồng). Không đặt thêm badge ở mục
		// "Phê duyệt" — số đó đã nằm trong "Việc của tôi", hiện 2 lần gây trùng.
		Promise.all([getTopics({ limit: 1 }), getMyTasks()])
			.then(([topicsRes, tasks]) => {
				setNavBadges({
					topics: topicsRes.pagination.total,
					myTasks: tasks.total || undefined,
				});
			})
			.catch(() => {});
	}, []);

	useEffect(() => {
		fetchBadges();
	}, [fetchBadges]);

	useRealtimeUpdate('topic', fetchBadges);

	// ── Notification state ───────────────────
	const [notifOpen, setNotifOpen] = useState(false);
	const {
		notifications: rawNotifs,
		unreadCount,
		markOne,
		markAll,
	} = useNotifications();
	const notifs = rawNotifs.map(toNotif);

	const badges = {
		...navBadges,
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

	// Đóng panels khi bấm Escape
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setNotifOpen(false);
				setUserMenuOpen(false);
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, []);

	// ── Initials ─────────────────────────────
	const initials = getInitials(userName);

	// ── Current page label ───────────────────
	const currentLabel =
		NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === activePage)
			?.label ?? 'Tổng quan';

	// ── Nav click handler ─────────────────────
	const handleNavClick = (key: string) => {
		const path = KEY_TO_PATH[key];
		if (path) {
			setMobileNavOpen(false);
			navigate(path);
		}
	};

	// Mỗi trang tự bọc AdminLayout riêng nên sidebar bị remount khi chuyển tab
	// (mất vị trí cuộn). Khôi phục scrollTop đã lưu trước khi paint; nếu mục
	// active vẫn nằm ngoài khung (vd vào trang bằng link khác) thì cuộn tới nó.
	const navRef = useRef<HTMLElement>(null);
	const activeItemRef = useRef<HTMLButtonElement>(null);
	useLayoutEffect(() => {
		if (navRef.current)
			navRef.current.scrollTop =
				Number(sessionStorage.getItem(NAV_SCROLL_KEY)) || 0;
		activeItemRef.current?.scrollIntoView({ block: 'nearest' });
	}, []);

	return (
		<div className={styles.adminWrapper}>
			{/* Mobile Backdrop Overlay */}
			{mobileNavOpen && (
				<div
					className={styles.mobileBackdrop}
					onClick={() => setMobileNavOpen(false)}
				/>
			)}

			{/* ══ SIDEBAR ════════════════════════════ */}
			<aside
				className={`${styles.sidebar} ${effectiveCollapsed ? styles.collapsed : ''} ${mobileNavOpen ? styles.mobileDrawerOpen : ''}`}
			>
				{/* Header */}
				<div className={styles.sidebarHeader}>
					<div className={styles.sidebarBrand}>
						<div className={styles.logoToggleWrap}>
							<div className={styles.sidebarLogo}>
								<img
									src={Logo}
									alt='Logo BV Nghệ An'
								/>
							</div>
							<button
								className={styles.collapseBtn}
								onClick={toggleSidebar}
								aria-label={
									effectiveCollapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'
								}
								title={effectiveCollapsed ? 'Mở rộng' : 'Thu gọn'}
							>
								<ChevLSvg />
							</button>
						</div>
						<div className={styles.sidebarBrandText}>
							<div className={styles.sidebarBrandName}>
								<span className={styles.sidebarBrandLine}>Bệnh viện</span>
								<span className={styles.sidebarBrandLine}>
									Hữu nghị Đa khoa Nghệ An
								</span>
							</div>
							<div className={styles.sidebarBrandSub}>NCKH – Đào tạo – CME</div>
						</div>
					</div>
					<button
						className={styles.mobileMenuBtn}
						onClick={() => setMobileNavOpen(false)}
						aria-label='Đóng menu'
					>
						<XSvg />
					</button>
				</div>

				{/* Nav */}
				<nav
					ref={navRef}
					className={`${styles.sidebarNav} ${mobileNavOpen ? styles.mobileOpen : ''}`}
					onScroll={(e) =>
						sessionStorage.setItem(
							NAV_SCROLL_KEY,
							String(e.currentTarget.scrollTop),
						)
					}
				>
					{navGroups.map((group) => (
						<React.Fragment key={group.section}>
							<div className={styles.navSection}>{group.section}</div>
							{group.items.map((item) => (
								<button
									key={item.key}
									ref={activePage === item.key ? activeItemRef : undefined}
									type='button'
									className={`${styles.navItem} ${activePage === item.key ? styles.active : ''}`}
									data-label={item.label}
									onClick={() => handleNavClick(item.key)}
									onMouseEnter={(e) => {
										const r = e.currentTarget.getBoundingClientRect();
										e.currentTarget.style.setProperty(
											'--tip-y',
											`${r.top + r.height / 2}px`,
										);
									}}
									title={collapsed ? item.label : undefined}
								>
									{item.icon}
									<span className={styles.navLabel}>{item.label}</span>
									{badges[item.key as keyof typeof badges] !== undefined && (
										<span
											className={
												(badges[item.key as keyof typeof badges] ?? 0) > 50
													? styles.navBadge
													: styles.navBadgeGray
											}
										>
											{badges[item.key as keyof typeof badges]}
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
									onClick={() => navigate('/admin/profile')}
								>
									<UserSvg />
									<span>Cài đặt tài khoản</span>
								</button>
								<button
									className={styles.userDropdownItem}
									onClick={handleLogout}
								>
									<LogoutSvg />
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
								<MoreVSvg style={{ width: 14, height: 14 }} />
							</span>
						</div>
					</div>
				</div>
			</aside>

			{/* ══ MAIN ═══════════════════════════════ */}
			<div className={styles.mainContent}>
				{/* Topbar */}
				<header className={styles.topbar}>
					<div className={styles.topbarLeft}>
						<button
							className={styles.mobileNavTrigger}
							onClick={() => setMobileNavOpen(true)}
							aria-label='Mở menu'
						>
							<MenuSvg />
						</button>
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
							<span className={styles.breadcrumbItem}>RMS Hospital</span>
							<span className={styles.breadcrumbSep}>/</span>
							{breadcrumbs?.map((bc, i) => (
								<React.Fragment key={i}>
									<span className={styles.breadcrumbItem}>{bc.label}</span>
									<span className={styles.breadcrumbSep}>/</span>
								</React.Fragment>
							))}
							<span className={styles.breadcrumbCurrent}>{currentLabel}</span>
						</div>
					</div>

					<div className={styles.topbarRight}>
						{/* Ngày hôm nay */}
						<span className={styles.roundIndicator}>
							<span className={styles.roundDot} />
							{todayLabel}
						</span>
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
							viewAllPath='/admin/notifications'
						/>
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

					<TwoFactorReminder />
					{pageOff ? (
						<div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
							Chức năng này đã được quản trị viên tắt.
						</div>
					) : (
						children
					)}
				</main>
			</div>
		</div>
	);
}
