import React, { useCallback, useRef, useState } from 'react';
import { Link, NavLink, matchPath, useLocation, useNavigate } from 'react-router-dom';
import Logo from '../../assets/logo.png';
import { ChevLSvg, LogoutSvg, MenuSvg, XSvg } from '@/assets/icons';
import { NotificationPanel } from '../../features/notifications/components/NotificationPanel';
import { useNotifications } from '../../features/notifications/hooks/useNotifications';
import { toNotif } from '../../features/notifications/utils/notifUtils';
import { logout } from '../../features/auth/api/authApi';
import { TRAINEE_HOME } from '../../app/router/authHelpers';
import TwoFactorReminder from '../../shared/components/TwoFactorReminder';
import { useHiddenMenus } from '../../shared/hooks/useMenuConfig';
import { useMediaQuery } from '../../shared/hooks/useMediaQuery';
import { useModules } from '../../shared/hooks/useModules';
import { maxWidth } from '../../shared/utils/breakpoints';
import { getInitials } from '../../shared/utils/helper';
import { getStoredUser, type StoredUser } from '../../shared/utils/storage';
import { DisabledFeature } from '../components/DisabledFeature';
import { MAIN_ID, SkipLink } from '../components/SkipLink';
import { useAccountMenu } from '../hooks/useAccountMenu';
import { useMobileDrawer } from '../hooks/useMobileDrawer';
import styles from './TraineeLayout.module.css';
import { ACCOUNT_NAV, BOTTOM_TABS, NAV, TRAINEE_MENU, type NavItem } from './nav';

const TRAINEE_BASE = TRAINEE_HOME;
// Riêng với cổng nhân viên / quản trị — mỗi cổng nhớ trạng thái thu gọn của mình.
const SIDEBAR_KEY = 'rms_trainee_sidebar_collapsed';

export interface TraineeLayoutProps {
	children?: React.ReactNode;
	pageTitle?: string;
	pageSubtitle?: string;
	breadcrumbs?: { label: string; path?: string }[];
	headerActions?: React.ReactNode;
	userName?: string;
	userRole?: string;
	/** Tương thích props của UserLayout — không dùng. */
	userInitials?: string;
	hideSidebar?: boolean;
}

/** Gom các mục liền nhau cùng `group` thành một khối trên menu bên trái. */
function groupNav(items: NavItem[]) {
	const groups: { title?: string; items: NavItem[] }[] = [];
	for (const item of items) {
		const last = groups.at(-1);
		if (last && last.title === item.group) last.items.push(item);
		else groups.push({ title: item.group, items: [item] });
	}
	return groups;
}

/**
 * Cổng học viên — dành cho tài khoản học viên (chủ yếu ngoại viện).
 * Menu bên trái nền trắng (khác sidebar xanh của cổng nhân viên, sidebar tối của quản trị).
 * >1024px: menu cố định, thu gọn còn cột icon · ≤1024px: menu thành ngăn kéo mở bằng nút ☰
 * · ≤640px: thêm thanh tab đáy với nút Điểm danh QR nổi giữa.
 */
export default function TraineeLayout({
	children,
	pageTitle,
	pageSubtitle,
	breadcrumbs,
	headerActions,
	userName,
}: TraineeLayoutProps) {
	const navigate = useNavigate();
	const stored = getStoredUser<StoredUser>();
	const name = userName ?? stored?.full_name ?? stored?.username ?? 'Học viên';
	const modules = useModules();
	const hiddenMenus = useHiddenMenus('trainee', TRAINEE_MENU);
	const nav = NAV.filter((i) => (!i.module || modules[i.module]) && !hiddenMenus.has(i.key));
	const navGroups = groupNav([...nav, ...ACCOUNT_NAV]);
	const bottomTabs = BOTTOM_TABS.map((k) => nav.find((i) => i.key === k)).filter((i): i is NavItem => !!i);
	// Vào thẳng URL của mục đã tắt ở "Menu hiển thị" hoặc thuộc chức năng đã tắt (kể cả trang con) thì chặn.
	const { pathname } = useLocation();
	const pageOff = NAV.some(
		(i) =>
			(hiddenMenus.has(i.key) || (i.module && !modules[i.module])) &&
			matchPath({ path: i.to, end: !!i.end }, pathname),
	);

	// ── Menu bên trái: thu gọn (máy tính) / ngăn kéo (màn hẹp) ──
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
	const [drawerOpen, setDrawerOpen] = useState(false);
	const closeDrawer = useCallback(() => setDrawerOpen(false), []);
	// Cùng mốc với @media (max-width: 1024px) trong CSS
	const isNarrow = useMediaQuery(maxWidth('lg'));
	const drawerActive = isNarrow && drawerOpen;
	const drawerTriggerRef = useRef<HTMLButtonElement>(null);
	const drawerCloseRef = useRef<HTMLButtonElement>(null);
	useMobileDrawer({
		active: drawerActive,
		onClose: closeDrawer,
		initialFocusRef: drawerCloseRef,
		triggerRef: drawerTriggerRef,
	});

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
	const [notifOpen, setNotifOpen] = useState(false);
	const { notifications, unreadCount, markOne, markAll } = useNotifications();

	const handleLogout = useCallback(async () => {
		await logout();
		navigate('/login');
	}, [navigate]);

	const onNavigate = () => {
		setDrawerOpen(false);
		closeUserMenu();
	};

	const navLink = (
		item: NavItem,
		cls: string,
		activeCls: string,
		opts: { short?: boolean; menuitem?: boolean; pill?: boolean; tooltip?: boolean } = {},
	) => (
		<NavLink
			key={item.to}
			to={item.to}
			end={item.end}
			className={({ isActive }) => `${cls} ${isActive ? activeCls : ''}`}
			// Menu thu gọn chỉ còn icon: tên mục hiện khi rê chuột
			title={opts.tooltip ? (collapsed ? item.label : undefined) : item.label}
			role={opts.menuitem ? 'menuitem' : undefined}
			onClick={onNavigate}
		>
			{/* Tab đáy: nền viên thuốc sau icon đang chọn (không chỉ đổi màu) */}
			{opts.pill ? <span className={styles.tabIcon}>{item.icon}</span> : item.icon}
			<span className={styles.navLabel}>{opts.short ? item.short : item.label}</span>
		</NavLink>
	);

	const brand = (withText: boolean, cls: string) => (
		<Link
			to={TRAINEE_BASE}
			className={cls}
			onClick={onNavigate}
			aria-label='Về tổng quan'
		>
			<img
				src={Logo}
				alt=''
				className={styles.brandLogo}
			/>
			{withText && (
				<span className={styles.brandText}>
					<span className={styles.brandName}>Cổng học viên</span>
					<span className={styles.brandSub}>BV Hữu nghị ĐK Nghệ An</span>
				</span>
			)}
		</Link>
	);

	const hasHeader = Boolean(pageTitle || pageSubtitle || headerActions || breadcrumbs?.length);
	const back = breadcrumbs?.[breadcrumbs.length - 1]?.path;

	return (
		<div className={`${styles.shell} ${collapsed ? styles.collapsed : ''}`}>
			<SkipLink />

			{/* ══ MENU BÊN TRÁI ══ */}
			<aside
				id='trainee-sidebar'
				className={`${styles.sidebar} ${drawerOpen ? styles.sidebarOpen : ''}`}
				aria-label='Điều hướng học viên'
				// Ngăn kéo đang đóng chỉ bị đẩy ra ngoài bằng transform: không cho Tab / trình đọc màn hình đi vào
				inert={isNarrow && !drawerOpen ? true : undefined}
			>
				<div className={styles.sidebarHead}>
					{brand(true, styles.brand)}
					<button
						ref={drawerCloseRef}
						type='button'
						className={styles.sidebarClose}
						onClick={closeDrawer}
						aria-label='Đóng menu'
					>
						<XSvg />
					</button>
				</div>

				<nav className={styles.sidebarNav}>
					{navGroups.map((g, gi) => (
						<div
							key={g.title ?? `g${gi}`}
							className={styles.navGroup}
						>
							{g.title && <div className={styles.navGroupTitle}>{g.title}</div>}
							{g.items.map((i) => navLink(i, styles.navItem, styles.navItemActive, { tooltip: true }))}
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

			{drawerOpen && (
				<div
					className={styles.backdrop}
					onClick={closeDrawer}
				/>
			)}

			{/* Ngăn kéo đang mở: focus không được lọt ra sau lớp phủ */}
			<div
				className={styles.mainCol}
				inert={drawerActive ? true : undefined}
			>
				{/* ══ THANH TRÊN: ☰ + logo (màn hẹp) · thông báo · tài khoản ══ */}
				<header className={styles.header}>
					<div className={styles.headerInner}>
						<button
							ref={drawerTriggerRef}
							type='button'
							className={styles.drawerTrigger}
							onClick={() => setDrawerOpen(true)}
							aria-label='Mở menu'
							aria-expanded={drawerOpen}
							aria-controls='trainee-sidebar'
						>
							<MenuSvg />
						</button>
						{brand(true, styles.headerBrand)}

						<div className={styles.headerActions}>
							<NotificationPanel
								open={notifOpen}
								onToggle={() => setNotifOpen((o) => !o)}
								onClose={() => setNotifOpen(false)}
								notifications={notifications.map(toNotif)}
								unreadCount={unreadCount}
								onMarkAll={markAll}
								onMarkOne={markOne}
								buttonClassName={styles.iconBtn}
								activeClassName={styles.iconBtnActive}
								viewAllPath={`${TRAINEE_BASE}/thong-bao`}
							/>
							<div
								className={styles.menuWrap}
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
									<span className={styles.avatar}>{getInitials(name)}</span>
									<span className={styles.userChipMeta}>
										<span className={styles.userChipName}>{name}</span>
										<span className={styles.userChipRole}>Học viên</span>
									</span>
								</button>
								{userMenuOpen && (
									<div
										ref={userMenuListRef}
										className={styles.menu}
										role='menu'
										aria-label='Tài khoản'
										onKeyDown={onUserMenuKeyDown}
									>
										<div className={styles.menuHead}>
											<span className={`${styles.avatar} ${styles.avatarLg}`}>{getInitials(name)}</span>
											<span className={styles.menuHeadMeta}>
												<strong>{name}</strong>
												<span>{stored?.email ?? stored?.username}</span>
											</span>
										</div>
										{ACCOUNT_NAV.map((i) => navLink(i, styles.menuItem, styles.menuItemActive, { menuitem: true }))}
										<div
											className={styles.menuSep}
											role='separator'
										/>
										<button
											type='button'
											className={`${styles.menuItem} ${styles.menuDanger}`}
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

				{/* ══ DẢI TIÊU ĐỀ TRANG ══ */}
				{hasHeader && (
					<div className={styles.pageBand}>
						<div className={styles.pageHeader}>
							<div className={styles.pageHeaderText}>
								{back && (
									<button
										type='button'
										className={styles.backLink}
										onClick={() => navigate(back)}
									>
										<ChevLSvg />
										{breadcrumbs![breadcrumbs!.length - 1].label}
									</button>
								)}
								{pageTitle && <h1 className={styles.pageTitle}>{pageTitle}</h1>}
								{pageSubtitle && <p className={styles.pageSubtitle}>{pageSubtitle}</p>}
							</div>
							{headerActions && <div className={styles.pageActions} data-page-actions=''>{headerActions}</div>}
						</div>
					</div>
				)}

				{/* ══ NỘI DUNG ══ */}
				<main
					id={MAIN_ID}
					tabIndex={-1}
					className={`${styles.content} ${hasHeader ? styles.contentWithBand : ''}`}
				>
					<TwoFactorReminder />
					{pageOff ? <DisabledFeature homePath={TRAINEE_BASE} /> : children}
				</main>

				<footer className={styles.footer}>
					<div className={styles.footerInner}>
						<span>© {new Date().getFullYear()} Bệnh viện Hữu nghị Đa khoa Nghệ An</span>
						<span>Cổng thông tin học viên</span>
					</div>
				</footer>
			</div>

			{/* ══ TAB ĐÁY (điện thoại) ══ */}
			<nav
				className={styles.bottomNav}
				aria-label='Điều hướng nhanh'
				inert={drawerActive ? true : undefined}
			>
				{bottomTabs.map((item) =>
					navLink(
						item,
						`${styles.tab} ${item.key === 'checkIn' ? styles.tabQr : ''}`,
						styles.tabActive,
						// Nút Điểm danh QR nổi giữa giữ nguyên, không bọc nền viên thuốc
						{ short: true, pill: item.key !== 'checkIn' },
					),
				)}
			</nav>
		</div>
	);
}
