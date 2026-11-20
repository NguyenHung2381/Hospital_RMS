import React, { useCallback, useState } from 'react';
import { NavLink, matchPath, useLocation, useNavigate } from 'react-router-dom';
import Logo from '../../assets/logo.png';
import { ChevLSvg, LogoutSvg } from '@/assets/icons';
import { NotificationPanel } from '../../features/notifications/components/NotificationPanel';
import { useNotifications } from '../../features/notifications/hooks/useNotifications';
import { toNotif } from '../../features/notifications/utils/notifUtils';
import { logout } from '../../features/auth/api/authApi';
import { TRAINEE_HOME } from '../../app/router/authHelpers';
import TwoFactorReminder from '../../shared/components/TwoFactorReminder';
import { useHiddenMenus } from '../../shared/hooks/useMenuConfig';
import { useModules } from '../../shared/hooks/useModules';
import { getInitials } from '../../shared/utils/helper';
import { getStoredUser, type StoredUser } from '../../shared/utils/storage';
import { DisabledFeature } from '../components/DisabledFeature';
import { MAIN_ID, SkipLink } from '../components/SkipLink';
import { useAccountMenu } from '../hooks/useAccountMenu';
import styles from './TraineeLayout.module.css';
import { ACCOUNT_NAV, BOTTOM_TABS, NAV, TRAINEE_MENU, type NavItem } from './nav';

const TRAINEE_BASE = TRAINEE_HOME;

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

/**
 * Cổng học viên — dành cho tài khoản học viên (chủ yếu ngoại viện).
 * Khác hẳn trang quản trị: không có sidebar, điều hướng ngang trên đầu,
 * nội dung căn giữa như một trang web học tập.
 * >1280px: một hàng (logo · menu · tài khoản) · 641–1280px: menu xuống hàng thứ hai
 * · ≤640px: thanh trên gọn + tab đáy.
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
	const bottomTabs = BOTTOM_TABS.map((k) => nav.find((i) => i.key === k)).filter((i): i is NavItem => !!i);
	// Vào thẳng URL của mục đã tắt ở "Menu hiển thị" (kể cả trang con) thì chặn.
	const { pathname } = useLocation();
	const pageOff = NAV.some(
		(i) => hiddenMenus.has(i.key) && matchPath({ path: i.to, end: !!i.end }, pathname),
	);

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

	const navLink = (
		item: NavItem,
		cls: string,
		activeCls: string,
		opts: { short?: boolean; menuitem?: boolean; pill?: boolean } = {},
	) => (
		<NavLink
			key={item.to}
			to={item.to}
			end={item.end}
			className={({ isActive }) => `${cls} ${isActive ? activeCls : ''}`}
			title={item.label}
			role={opts.menuitem ? 'menuitem' : undefined}
			onClick={() => closeUserMenu()}
		>
			{/* Tab đáy: nền viên thuốc sau icon đang chọn (không chỉ đổi màu) */}
			{opts.pill ? <span className={styles.tabIcon}>{item.icon}</span> : item.icon}
			<span>{opts.short ? item.short : item.label}</span>
		</NavLink>
	);

	const hasHeader = Boolean(pageTitle || pageSubtitle || headerActions || breadcrumbs?.length);
	const back = breadcrumbs?.[breadcrumbs.length - 1]?.path;

	return (
		<div className={styles.shell}>
			<SkipLink />
			{/* ══ HEADER: logo · menu ngang · tài khoản ══ */}
			<header className={styles.header}>
				<div className={styles.headerInner}>
					<button
						type='button'
						className={styles.brand}
						onClick={() => navigate(TRAINEE_BASE)}
						aria-label='Về tổng quan'
					>
						<img
							src={Logo}
							alt=''
							className={styles.brandLogo}
						/>
						<span className={styles.brandText}>
							<span className={styles.brandName}>Cổng học viên</span>
							<span className={styles.brandSub}>Bệnh viện</span>
							<span className={styles.brandSub}>Hữu nghị Đa khoa Nghệ An</span>
						</span>
					</button>

					<nav
						className={styles.topNav}
						aria-label='Điều hướng học viên'
					>
						{nav.map((i) => navLink(i, styles.navItem, styles.navItemActive, { short: true }))}
					</nav>

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
									{/* Điện thoại: các mục không có trên thanh tab đáy */}
									<div
										className={styles.menuMobileOnly}
										role='none'
									>
										{nav
											.filter((item) => !BOTTOM_TABS.includes(item.key))
											.map((i) => navLink(i, styles.menuItem, styles.menuItemActive, { menuitem: true }))}
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
						{headerActions && <div className={styles.pageActions}>{headerActions}</div>}
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
				{pageOff ? (
					<DisabledFeature homePath={TRAINEE_BASE} />
				) : (
					children
				)}
			</main>

			<footer className={styles.footer}>
				<div className={styles.footerInner}>
					<span>© {new Date().getFullYear()} Bệnh viện Hữu nghị Đa khoa Nghệ An</span>
					<span>Cổng thông tin học viên</span>
				</div>
			</footer>

			{/* ══ TAB ĐÁY (điện thoại) ══ */}
			<nav
				className={styles.bottomNav}
				aria-label='Điều hướng nhanh'
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
