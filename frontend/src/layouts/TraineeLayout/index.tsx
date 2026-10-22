import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import userStyles from '../UserLayout/UserLayout.module.css';
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
 * ≥1200px: một hàng (logo · menu · tài khoản) · 640–1199px: menu xuống hàng thứ hai
 * · <640px: thanh trên gọn + tab đáy.
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

	const [menuOpen, setMenuOpen] = useState(false);
	const [notifOpen, setNotifOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const { notifications, unreadCount, markOne, markAll } = useNotifications();

	useEffect(() => {
		if (!menuOpen) return;
		const onDown = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
		};
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
		document.addEventListener('mousedown', onDown);
		window.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDown);
			window.removeEventListener('keydown', onKey);
		};
	}, [menuOpen]);

	const handleLogout = useCallback(async () => {
		await logout();
		navigate('/login');
	}, [navigate]);

	const navLink = (item: NavItem, cls: string, activeCls: string, short = false) => (
		<NavLink
			key={item.to}
			to={item.to}
			end={item.end}
			className={({ isActive }) => `${cls} ${isActive ? activeCls : ''}`}
			title={item.label}
			onClick={() => setMenuOpen(false)}
		>
			{item.icon}
			<span>{short ? item.short : item.label}</span>
		</NavLink>
	);

	const hasHeader = Boolean(pageTitle || pageSubtitle || headerActions || breadcrumbs?.length);
	const back = breadcrumbs?.[breadcrumbs.length - 1]?.path;

	return (
		<div className={styles.shell}>
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
						{nav.map((i) => navLink(i, styles.navItem, styles.navItemActive, true))}
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
							s={{ ...userStyles, topbarIconBtn: styles.iconBtn, active: styles.iconBtnActive }}
							viewAllPath={`${TRAINEE_BASE}/thong-bao`}
						/>
						<div
							className={styles.menuWrap}
							ref={menuRef}
						>
							<button
								type='button'
								className={styles.userChip}
								onClick={() => setMenuOpen((o) => !o)}
								aria-haspopup='menu'
								aria-expanded={menuOpen}
							>
								<span className={styles.avatar}>{getInitials(name)}</span>
								<span className={styles.userChipMeta}>
									<span className={styles.userChipName}>{name}</span>
									<span className={styles.userChipRole}>Học viên</span>
								</span>
							</button>
							{menuOpen && (
								<div
									className={styles.menu}
									role='menu'
								>
									<div className={styles.menuHead}>
										<span className={`${styles.avatar} ${styles.avatarLg}`}>{getInitials(name)}</span>
										<span className={styles.menuHeadMeta}>
											<strong>{name}</strong>
											<span>{stored?.email ?? stored?.username}</span>
										</span>
									</div>
									{/* Điện thoại: các mục không có trên thanh tab đáy */}
									<div className={styles.menuMobileOnly}>
										{nav
											.filter((item) => !BOTTOM_TABS.includes(item.key))
											.map((i) => navLink(i, styles.menuItem, styles.menuItemActive))}
									</div>
									{ACCOUNT_NAV.map((i) => navLink(i, styles.menuItem, styles.menuItemActive))}
									<div className={styles.menuSep} />
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
			<main className={`${styles.content} ${hasHeader ? styles.contentWithBand : ''}`}>
				<TwoFactorReminder />
				{pageOff ? (
					<div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
						Chức năng này đã được quản trị viên tắt.
					</div>
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
						true,
					),
				)}
			</nav>
		</div>
	);
}
