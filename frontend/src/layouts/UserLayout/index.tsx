import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Logo from '../../assets/logo.png';
import { getMyProgressCount } from '../../features/council/api/councilApi';
import { getMyTasks } from '../../features/my-tasks/api/myTasksApi';
import { mentoringApi } from '../../features/portal/api/mentoringApi';
import { useRegistrationOpen } from '../../features/round/hooks/useRegistrationOpen';
import { NotificationPanel } from '../../features/notifications/components/NotificationPanel';
import { useNotifications } from '../../features/notifications/hooks/useNotifications';
import { toNotif } from '../../features/notifications/utils/notifUtils';
import { useHiddenMenus } from '../../shared/hooks/useMenuConfig';
import { useMediaQuery } from '../../shared/hooks/useMediaQuery';
import { useModules } from '../../shared/hooks/useModules';
import { usePermission } from '../../shared/hooks/usePermission';
import { maxWidth } from '../../shared/utils/breakpoints';
import { scopeOf } from '../../shared/utils/permissions';
import { getInitials } from '../../shared/utils/helper';
import { getStoredUser, type StoredUser } from '../../shared/utils/storage';
import { logout } from '../../features/auth/api/authApi';
import TwoFactorReminder from '../../shared/components/TwoFactorReminder';
import { isTraineeAccount, isTraineePath } from '../../app/router/authHelpers';
import { DisabledFeature } from '../components/DisabledFeature';
import { MAIN_ID, SkipLink } from '../components/SkipLink';
import { useAccountMenu } from '../hooks/useAccountMenu';
import { useMobileDrawer } from '../hooks/useMobileDrawer';
import { useRealtimeUpdate } from '../hooks/useRealtime';
import TraineeLayout from '../TraineeLayout';
import styles from './UserLayout.module.css';
import {
	ACCOUNT_NAV,
	ALL_NAV,
	KEY_TO_PATH,
	NAV_GROUPS,
	PATH_TO_KEY,
	USER_MENU,
	type NavItem,
} from './nav';
import {
	ChevLSvg,
	ChevRSvg,
	LogoutSvg,
	MenuSvg,
	MoreVSvg,
	XSvg,
} from '@/assets/icons';

// ─── STORAGE KEY ──────────────────────────
// Riêng với AdminLayout (rms_sidebar_collapsed) — hai cổng thu gọn độc lập.
const SIDEBAR_KEY = 'rms_user_sidebar_collapsed';

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
	/** Ẩn sidebar điều hướng, chỉ còn thanh trên + nội dung. */
	hideSidebar?: boolean;
}

// Tài khoản học viên (ngoại viện) dùng cổng học viên riêng — mọi trang dùng
// UserLayout (hồ sơ, thông báo, điểm danh QR, khảo sát…) tự hiện trong khung đó.
// Đang ở /hoc-vien/... thì luôn giữ khung học viên, kể cả khi phiên đã lưu thiếu
// role_code — nếu không, các trang dùng chung bị nhảy sang khung cổng nhân viên.
export default function UserLayout(props: UserLayoutProps) {
	const { pathname } = useLocation();
	return isTraineeAccount() || isTraineePath(pathname) ? <TraineeLayout {...props} /> : <PortalLayout {...props} />;
}

// ─── COMPONENT ────────────────────────────
function PortalLayout({
	children,
	pageTitle,
	pageSubtitle,
	breadcrumbs,
	headerActions,
	userName,
	userRole,
	userInitials,
	hideSidebar = false,
}: UserLayoutProps) {
	const navigate = useNavigate();
	const location = useLocation();

	// Trang không truyền tên/vai trò (Thi online, Khảo sát, Việc của tôi...) thì lấy
	// từ phiên đăng nhập — tránh chip tài khoản hiện "Người dùng" chung chung.
	const stored = getStoredUser<StoredUser>();
	userName ??= stored?.full_name ?? stored?.username ?? 'Người dùng';
	userRole ??= stored?.role_name ?? stored?.role ?? 'Thành viên';

	// Trang con (/user/khoa-hoc/:id, /user/my-topics/:id) sáng mục cha.
	const activePage =
		PATH_TO_KEY[location.pathname] ??
		Object.keys(KEY_TO_PATH).find(
			(k) => KEY_TO_PATH[k] !== '/user' && location.pathname.startsWith(`${KEY_TO_PATH[k]}/`),
		) ??
		'home';
	const isSubPage = location.pathname !== KEY_TO_PATH[activePage];

	const { has, user } = usePermission();
	// "restrictMember": ẩn với vai trò chỉ tham gia đề tài (không tạo được đề tài).
	const canRegisterTopic = has('topics:create');
	// "needsRegistrationWindow": chỉ hiện mục Đăng ký đề tài khi đợt đang mở cửa
	// sổ đăng ký. Chỉ cần kiểm tra khi user có quyền tạo đề tài.
	const { open: registrationOpen } = useRegistrationOpen(
		!hideSidebar && canRegisterTopic,
	);
	// "managerOnly": các mục điều hành khoa / hệ thống.
	const topicScope = scopeOf(user, 'topics');
	const isManagerAccount =
		has('admin_panel:access') ||
		topicScope === 'department' ||
		topicScope === 'all' ||
		has('users:read');

	// Chỉ hiện "Đánh giá tiến độ" khi user thực sự có ghế trong hội đồng.
	const [isCouncilMember, setIsCouncilMember] = useState(false);
	useEffect(() => {
		if (hideSidebar) return;
		let alive = true;
		getMyProgressCount()
			.then((r) => {
				if (alive) setIsCouncilMember((r?.count ?? 0) > 0);
			})
			.catch(() => {
				if (alive) setIsCouncilMember(false);
			});
		return () => {
			alive = false;
		};
	}, [hideSidebar]);

	// Số việc đang chờ (đề tài chờ duyệt + chấm tiến độ) → badge ở "Việc của tôi".
	const [taskCount, setTaskCount] = useState(0);
	const fetchTaskCount = useCallback(() => {
		if (hideSidebar) return;
		getMyTasks()
			.then((r) => setTaskCount(r.total ?? 0))
			.catch(() => {});
	}, [hideSidebar]);
	useEffect(() => {
		fetchTaskCount();
	}, [fetchTaskCount]);
	useRealtimeUpdate('topic', fetchTaskCount);

	// "Hướng dẫn thực hành": chỉ hiện cho người hướng dẫn vòng GPHN; badge = vòng chờ mình đánh giá.
	const [mentor, setMentor] = useState({ total: 0, awaiting: 0 });
	const fetchMentor = useCallback(() => {
		if (hideSidebar) return;
		mentoringApi
			.count()
			.then(setMentor)
			.catch(() => setMentor({ total: 0, awaiting: 0 }));
	}, [hideSidebar]);
	useEffect(() => {
		fetchMentor();
	}, [fetchMentor]);
	useRealtimeUpdate('course_enrollment', fetchMentor);

	const modules = useModules();
	const hiddenMenus = useHiddenMenus('user', USER_MENU);
	const keep = (item: NavItem) => {
		if (item.module && !modules[item.module]) return false;
		if (hiddenMenus.has(item.key)) return false;
		if (item.restrictMember && !canRegisterTopic) return false;
		if (item.managerOnly && !isManagerAccount) return false;
		if (item.councilOnly && !isCouncilMember) return false;
		if (item.mentorOnly && !mentor.total) return false;
		if (item.needsRegistrationWindow && !registrationOpen) return false;
		return true;
	};
	const navGroups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(keep) })).filter(
		(g) => g.items.length > 0,
	);
	const accountNav = ACCOUNT_NAV.filter(keep);

	const showNav = !hideSidebar;

	// ── Sidebar: thu gọn (desktop) / ngăn kéo (màn hẹp) ──
	const [collapsed, setCollapsed] = useState(() => {
		try {
			return localStorage.getItem(SIDEBAR_KEY) === '1';
		} catch {
			return false;
		}
	});
	const toggleCollapsed = () =>
		setCollapsed((c) => {
			try {
				localStorage.setItem(SIDEBAR_KEY, c ? '0' : '1');
			} catch {
				/* không lưu được thì chỉ giữ trong phiên */
			}
			return !c;
		});
	const [mobileNavOpen, setMobileNavOpen] = useState(false);
	const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
	// Màn hẹp (≤1024px): sidebar là ngăn kéo. Cùng mốc với @media trong CSS.
	const isMobile = useMediaQuery(maxWidth('lg'));
	const drawerActive = showNav && isMobile && mobileNavOpen;
	const mobileTriggerRef = useRef<HTMLButtonElement>(null);
	const drawerCloseRef = useRef<HTMLButtonElement>(null);
	useMobileDrawer({
		active: drawerActive,
		onClose: closeMobileNav,
		initialFocusRef: drawerCloseRef,
		triggerRef: mobileTriggerRef,
	});

	// Thu hồi phiên trên server (refresh token trong cookie) rồi mới rời trang
	const handleLogout = useCallback(async () => {
		await logout();
		navigate('/login');
	}, [navigate]);

	// ── Notification state ────────────────────
	const [notifOpen, setNotifOpen] = useState(false);
	const {
		notifications: rawNotifs,
		unreadCount,
		markOne,
		markAll,
	} = useNotifications();
	const notifs = rawNotifs.map(toNotif);

	// ── User menu state ──────────────────────
	const {
		open: userMenuOpen,
		toggle: toggleUserMenu,
		close: closeUserMenu,
		wrapRef: userMenuWrapRef,
		triggerRef: userMenuTriggerRef,
		menuRef: userMenuListRef,
		onMenuKeyDown: onUserMenuKeyDown,
		onTriggerKeyDown: onUserTriggerKeyDown,
	} = useAccountMenu();

	// Đóng bảng thông báo khi bấm Escape (menu tài khoản và drawer tự xử lý Esc)
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setNotifOpen(false);
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, []);

	// ── Initials ──────────────────────────────
	const initials = userInitials ?? getInitials(userName);

	// Mục điều hướng là <Link> thật (chuột giữa mở tab mới được); handler chỉ còn
	// tác dụng phụ: đóng ngăn kéo mobile và menu tài khoản.
	const handleNavClick = () => {
		setMobileNavOpen(false);
		closeUserMenu();
	};
	const pathOf = (key: string) => KEY_TO_PATH[key] ?? KEY_TO_PATH.home ?? '/user';
	const homePath = pathOf('home');

	// ── Đường dẫn trên thanh trên: Trang chủ › Nhóm › Mục › Trang con ──
	// Lấy từ cấu hình điều hướng chứ không ghép thẳng breadcrumbs của trang: các
	// trang truyền breadcrumbs không thống nhất (trùng tên mục, tên nhóm kiểu cũ).
	// Trang con chỉ lấy nhãn cuối cùng của breadcrumbs (vd. tên đề tài) hoặc tiêu đề.
	const activeItem = ALL_NAV.find((i) => i.key === activePage);
	const activeGroup = NAV_GROUPS.find((g) => g.items.some((i) => i.key === activePage));
	const subLabel = isSubPage ? (breadcrumbs?.at(-1)?.label ?? pageTitle) : undefined;
	const trail: { label: string; path?: string }[] = [];
	if (activePage !== 'home' && activeItem) {
		if (activeGroup?.title) trail.push({ label: activeGroup.title });
		trail.push({ label: activeItem.label, path: subLabel ? KEY_TO_PATH[activePage] : undefined });
	}
	if (subLabel) trail.push({ label: subLabel });

	const showPageHeader = Boolean(pageTitle || pageSubtitle || headerActions);

	const renderNavItem = (item: NavItem) => {
		const badge = item.key === 'myTasks' ? taskCount : item.key === 'myMentoring' ? mentor.awaiting : 0;
		return (
			<Link
				key={item.key}
				to={pathOf(item.key)}
				className={`${styles.navItem} ${activePage === item.key ? styles.active : ''}`}
				onClick={handleNavClick}
				title={collapsed ? item.label : undefined}
				aria-current={activePage === item.key ? 'page' : undefined}
			>
				{item.icon}
				<span className={styles.navLabel}>{item.label}</span>
				{badge > 0 && <span className={styles.navBadge}>{badge > 99 ? '99+' : badge}</span>}
			</Link>
		);
	};

	return (
		<div
			className={`${styles.userWrapper} ${showNav ? styles.withSidebar : ''} ${collapsed ? styles.collapsed : ''}`}
		>
			<SkipLink />

			{/* ══ SIDEBAR ════════════════════════════ */}
			{showNav && (
				<aside
					id='user-sidebar'
					className={`${styles.sidebar} ${mobileNavOpen ? styles.sidebarOpen : ''}`}
					aria-label='Điều hướng cổng nhân viên'
					// Ngăn kéo đang đóng chỉ bị đẩy ra ngoài bằng transform: không cho Tab / trình đọc màn hình đi vào
					inert={isMobile && !mobileNavOpen ? true : undefined}
				>
					<div className={styles.sidebarHead}>
						<Link
							to={homePath}
							className={styles.brand}
							onClick={handleNavClick}
							aria-label='Về trang chủ'
						>
							<img
								src={Logo}
								alt=''
								className={styles.brandLogo}
							/>
							<span className={styles.brandText}>
								<span className={styles.brandName}>BV Hữu nghị ĐK Nghệ An</span>
								<span className={styles.brandSub}>Cổng nhân viên</span>
							</span>
						</Link>
						<button
							ref={drawerCloseRef}
							type='button'
							className={styles.sidebarClose}
							onClick={closeMobileNav}
							aria-label='Đóng menu'
						>
							<XSvg />
						</button>
					</div>

					<nav className={styles.sidebarNav}>
						{navGroups.map((g, gi) => (
							<div
								key={g.title ?? gi}
								className={styles.navGroup}
							>
								{g.title && <div className={styles.navGroupTitle}>{g.title}</div>}
								{g.items.map(renderNavItem)}
							</div>
						))}
					</nav>

					<div className={styles.sidebarFoot}>
						<button
							type='button'
							className={styles.collapseBtn}
							onClick={toggleCollapsed}
							title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
							aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
						>
							<ChevLSvg />
							<span className={styles.navLabel}>Thu gọn</span>
						</button>
					</div>
				</aside>
			)}

			{showNav && mobileNavOpen && (
				<div
					className={styles.mobileBackdrop}
					onClick={closeMobileNav}
				/>
			)}

			{/* Ngăn kéo mobile đang mở: focus không được lọt ra sau lớp phủ */}
			<div
				className={styles.mainCol}
				inert={drawerActive ? true : undefined}
			>
				{/* ══ TOP BAR ════════════════════════════ */}
				<header className={styles.topbar}>
					<div className={styles.topbarInner}>
						{showNav && (
							<button
								ref={mobileTriggerRef}
								type='button'
								className={styles.mobileNavTrigger}
								onClick={() => setMobileNavOpen(true)}
								aria-label='Mở menu'
								aria-expanded={mobileNavOpen}
								aria-controls='user-sidebar'
							>
								<MenuSvg />
							</button>
						)}

						{/* Logo trên thanh trên: chỉ khi không có sidebar (hoặc sidebar đang ẩn ở màn hẹp) */}
						<Link
							to={homePath}
							className={`${styles.topbarBrand} ${showNav ? styles.topbarBrandMobile : ''}`}
							aria-label='Về trang chủ'
						>
							<img
								src={Logo}
								alt=''
								className={styles.brandLogo}
							/>
							{!showNav && (
								<span className={styles.brandText}>
									<span className={styles.brandName}>BV Hữu nghị ĐK Nghệ An</span>
									<span className={styles.brandSub}>Cổng nhân viên</span>
								</span>
							)}
						</Link>

						{showNav && (
							<nav
								className={styles.trail}
								aria-label='Vị trí trang'
							>
								<Link
									to={homePath}
									className={styles.trailItem}
								>
									Trang chủ
								</Link>
								{trail.map((t, i) => (
									<React.Fragment key={i}>
										<ChevRSvg className={styles.trailSep} />
										{t.path ? (
											<Link
												to={t.path}
												className={styles.trailItem}
											>
												{t.label}
											</Link>
										) : (
											<span
												className={i === trail.length - 1 ? styles.trailCurrent : styles.trailItem}
											>
												{t.label}
											</span>
										)}
									</React.Fragment>
								))}
							</nav>
						)}

						<div className={styles.topbarRight}>
							{showNav && (
								<NotificationPanel
									open={notifOpen}
									onToggle={() => setNotifOpen((o) => !o)}
									onClose={() => setNotifOpen(false)}
									notifications={notifs}
									unreadCount={unreadCount}
									onMarkAll={markAll}
									onMarkOne={markOne}
									buttonClassName={styles.topbarIconBtn}
									activeClassName={styles.active}
								/>
							)}

							{/* User chip + dropdown */}
							<div
								className={styles.userMenuWrap}
								ref={userMenuWrapRef}
							>
								<button
									ref={userMenuTriggerRef}
									type='button'
									className={styles.userChip}
									onClick={toggleUserMenu}
									onKeyDown={onUserTriggerKeyDown}
									aria-haspopup='menu'
									aria-expanded={userMenuOpen}
								>
									<span className={styles.userAvatar}>{initials}</span>
									<span className={styles.userMeta}>
										<span className={styles.userName}>{userName}</span>
										<span className={styles.userRole}>{userRole}</span>
									</span>
									<span className={styles.userChevron}>
										<MoreVSvg style={{ width: 14, height: 14 }} />
									</span>
								</button>

								{userMenuOpen && (
									<div
										ref={userMenuListRef}
										className={styles.userDropdown}
										role='menu'
										aria-label='Tài khoản'
										onKeyDown={onUserMenuKeyDown}
									>
										<div className={styles.userDropdownHead}>
											<span className={`${styles.userAvatar} ${styles.userAvatarLg}`}>{initials}</span>
											<span className={styles.userDropdownMeta}>
												<strong>{userName}</strong>
												<span>{stored?.email ?? userRole}</span>
											</span>
										</div>
										{accountNav.map((item) => (
											<Link
												key={item.key}
												to={pathOf(item.key)}
												className={styles.userDropdownItem}
												onClick={handleNavClick}
												role='menuitem'
											>
												{item.icon}
												<span>{item.label}</span>
											</Link>
										))}
										<div className={styles.userDropdownSep} />
										<button
											type='button'
											className={`${styles.userDropdownItem} ${styles.userDropdownDanger}`}
											onClick={handleLogout}
											role='menuitem'
										>
											<LogoutSvg />
											<span>Đăng xuất</span>
										</button>
									</div>
								)}
							</div>
						</div>
					</div>
				</header>

				{/* ══ PAGE ═══════════════════════════════ */}
				<main
					id={MAIN_ID}
					tabIndex={-1}
					className={styles.pageArea}
				>
					<div className={styles.pageInner}>
						{showPageHeader && (
							<div className={styles.pageHeader}>
								<div className={styles.pageHeaderLeft}>
									{pageTitle && <h1 className={styles.pageTitle}>{pageTitle}</h1>}
									{pageSubtitle && (
										<p className={styles.pageSubtitle}>{pageSubtitle}</p>
									)}
								</div>
								{headerActions && (
									<div className={styles.pageHeaderRight} data-page-actions=''>{headerActions}</div>
								)}
							</div>
						)}

						<TwoFactorReminder />
						{/* Vào thẳng URL của mục đã tắt ở "Menu hiển thị" (kể cả trang con) */}
						{hiddenMenus.has(activePage) ? (
							<DisabledFeature homePath={homePath} />
						) : (
							children
						)}
					</div>
				</main>

				<footer className={styles.portalFooter}>
					© {new Date().getFullYear()} Bệnh viện Hữu nghị Đa khoa Nghệ An — Cổng
					người dùng
				</footer>
			</div>
		</div>
	);
}
