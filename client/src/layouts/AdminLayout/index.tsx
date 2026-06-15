import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Logo from '../../assets/logo.png';
import type { LoginUser } from '../../features/auth/api/authApi';
import { NotificationPanel } from '../../features/notifications/components/NotificationPanel';
import { useNotifications } from '../../features/notifications/hooks/useNotifications';
import { toNotif } from '../../features/notifications/utils/notifUtils';
import { getTopics } from '../../features/topics/api/topicApi';
import { clearAuth, getStoredUser } from '../../lib/authStorage';
import { useRealtimeUpdate } from '../hooks/useRealtime';
import styles from './AdminLayout.module.css';
import { Icon } from './icons';

// ─── STORAGE KEY ──────────────────────────
const SIDEBAR_KEY = 'rms_sidebar_collapsed';

// ─── ROUTE MAP ────────────────────────────
// Map từ nav key → đường dẫn URL thực tế
const KEY_TO_PATH: Record<string, string> = {
	dashboard: '/admin',
	topics: '/admin/topics',
	rounds: '/admin/rounds',
	approvals: '/admin/approvals',
	progress: '/admin/progress',
	members: '/admin/members',
	files: '/admin/files',
	departments: '/admin/departments',
	categories: '/admin/categories',
	levels: '/admin/levels',
	users: '/admin/users',
	roles: '/admin/roles',
	reports: '/admin/reports',
};

// Map ngược từ URL pathname → nav key (để highlight sidebar)
const PATH_TO_KEY: Record<string, string> = Object.fromEntries(
	Object.entries(KEY_TO_PATH).map(([k, v]) => [v, k]),
);

// ─── NAV CONFIG ───────────────────────────
interface NavItem {
	key: string;
	label: string;
	icon: React.ReactNode;
	badge?: number | string;
}
interface NavGroup {
	section: string;
	items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
	{
		section: 'Tổng quan',
		items: [{ key: 'dashboard', label: 'Dashboard', icon: <Icon.Dashboard /> }],
	},
	{
		section: 'Quản lý đề tài',
		items: [
			{ key: 'topics', label: 'Đề tài nghiên cứu', icon: <Icon.Topic /> },
			{ key: 'rounds', label: 'Đợt nghiên cứu', icon: <Icon.Round /> },
			{ key: 'approvals', label: 'Phê duyệt', icon: <Icon.Approval /> },
			{ key: 'members', label: 'Thành viên đề tài', icon: <Icon.Members /> },
		],
	},
	{
		section: 'Danh mục',
		items: [
			{ key: 'departments', label: 'Phòng ban', icon: <Icon.Dept /> },
			{ key: 'categories', label: 'Phân loại', icon: <Icon.List /> },
			{ key: 'levels', label: 'Cấp độ', icon: <Icon.List /> },
		],
	},
	{
		section: 'Hệ thống',
		items: [
			{ key: 'users', label: 'Người dùng', icon: <Icon.User /> },
			{ key: 'roles', label: 'Vai trò & Quyền', icon: <Icon.Role /> },
		],
	},
	{
		section: 'Xuất dữ liệu',
		items: [{ key: 'reports', label: 'Báo cáo & Xuất', icon: <Icon.Report /> }],
	},
];

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

	// Tự detect activePage từ URL hiện tại
	const activePage = PATH_TO_KEY[location.pathname] ?? 'dashboard';

	// ── Sidebar collapsed state (persist) ───
	const [collapsed, setCollapsed] = useState<boolean>(() => {
		if (typeof window === 'undefined') return false;
		return localStorage.getItem(SIDEBAR_KEY) === 'true';
	});

	const [isMobile, setIsMobile] = useState(() =>
		typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
	);

	useEffect(() => {
		const mq = window.matchMedia('(max-width: 768px)');
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

	// ── Nav badge counts (từ API) ────────────
	const [navBadges, setNavBadges] = useState<{
		topics?: number;
		approvals?: number;
	}>({});

	const fetchBadges = useCallback(() => {
		Promise.all([
			getTopics({ limit: 1 }),
			getTopics({ limit: 1, status: 'submitted' }),
		])
			.then(([topicsRes, approvalsRes]) => {
				setNavBadges({
					topics: topicsRes.pagination.total,
					approvals: approvalsRes.pagination.total,
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
	const initials = userName
		.split(' ')
		.map((w) => w[0])
		.slice(-2)
		.join('')
		.toUpperCase();

	// ── Current page label ───────────────────
	const currentLabel =
		NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === activePage)
			?.label ?? 'Dashboard';

	// ── Nav click handler ─────────────────────
	const handleNavClick = (key: string) => {
		const path = KEY_TO_PATH[key];
		if (path) {
			setMobileNavOpen(false);
			navigate(path);
		}
	};

	return (
		<div className={styles.adminWrapper}>
			{/* ══ SIDEBAR ════════════════════════════ */}
			<aside
				className={`${styles.sidebar} ${effectiveCollapsed ? styles.collapsed : ''}`}
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
							<div className={styles.sidebarBrandName}>
								Bệnh viện Hữu nghi Đa khoa Nghệ An
							</div>
							<div className={styles.sidebarBrandSub}>Quản lý NCKH</div>
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
						onClick={() => setMobileNavOpen((o) => !o)}
						aria-label={mobileNavOpen ? 'Đóng menu' : 'Mở menu'}
					>
						{mobileNavOpen ? (
							<Icon.X />
						) : (
							<svg
								viewBox='0 0 24 24'
								fill='none'
								stroke='currentColor'
								strokeWidth='2'
								strokeLinecap='round'
							>
								<line
									x1='3'
									y1='6'
									x2='21'
									y2='6'
								/>
								<line
									x1='3'
									y1='12'
									x2='21'
									y2='12'
								/>
								<line
									x1='3'
									y1='18'
									x2='21'
									y2='18'
								/>
							</svg>
						)}
					</button>
				</div>

				{/* Nav */}
				<nav
					className={`${styles.sidebarNav} ${mobileNavOpen ? styles.mobileOpen : ''}`}
				>
					{NAV_GROUPS.map((group) => (
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
									{navBadges[item.key as keyof typeof navBadges] !==
										undefined && (
										<span
											className={
												(navBadges[item.key as keyof typeof navBadges] ?? 0) >
												50
													? styles.navBadge
													: styles.navBadgeGray
											}
										>
											{navBadges[item.key as keyof typeof navBadges]}
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

			{/* ══ MAIN ═══════════════════════════════ */}
			<div className={styles.mainContent}>
				{/* Topbar */}
				<header className={styles.topbar}>
					<div className={styles.topbarLeft}>
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
