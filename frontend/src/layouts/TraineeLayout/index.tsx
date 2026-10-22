import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import Logo from '../../assets/logo.png';
import {
	BadgeSvg,
	BellSvg,
	BookOpenSvg,
	CalendarSvg,
	ChevLSvg,
	ClipboardSvg,
	DashboardSvg,
	FileTextSvg,
	LogoutSvg,
	QrSvg,
	UserSvg,
} from '@/assets/icons';
import { NotificationPanel } from '../../features/notifications/components/NotificationPanel';
import { useNotifications } from '../../features/notifications/hooks/useNotifications';
import { toNotif } from '../../features/notifications/utils/notifUtils';
import { logout } from '../../features/auth/api/authApi';
import { TRAINEE_HOME } from '../../app/router/authHelpers';
import TwoFactorReminder from '../../shared/components/TwoFactorReminder';
import { useModules } from '../../shared/hooks/useModules';
import { getInitials } from '../../shared/utils/helper';
import { getStoredUser, type StoredUser } from '../../shared/utils/storage';
import userStyles from '../UserLayout/UserLayout.module.css';
import styles from './TraineeLayout.module.css';

const TRAINEE_BASE = TRAINEE_HOME;

interface NavItem {
	to: string;
	label: string;
	/** Nhãn ngắn cho thanh tab đáy (điện thoại) / cột biểu tượng (máy tính bảng) */
	short: string;
	icon: React.ReactNode;
	end?: boolean;
	module?: 'survey';
}

// Thứ tự = luồng học: xem tổng quan → vào khóa học → theo lịch → xem kết quả.
const NAV: NavItem[] = [
	{ to: TRAINEE_BASE, label: 'Tổng quan', short: 'Tổng quan', icon: <DashboardSvg />, end: true },
	{ to: `${TRAINEE_BASE}/khoa-hoc`, label: 'Khóa học của tôi', short: 'Khóa học', icon: <BookOpenSvg /> },
	{ to: `${TRAINEE_BASE}/lich-hoc`, label: 'Lịch học & điểm danh', short: 'Lịch học', icon: <CalendarSvg /> },
	{ to: `${TRAINEE_BASE}/ket-qua`, label: 'Kết quả & chứng chỉ', short: 'Kết quả', icon: <BadgeSvg /> },
	{ to: `${TRAINEE_BASE}/diem-danh`, label: 'Điểm danh QR', short: 'Điểm danh', icon: <QrSvg /> },
	{ to: `${TRAINEE_BASE}/giay-to`, label: 'Giấy tờ hồ sơ', short: 'Giấy tờ', icon: <FileTextSvg /> },
	{ to: `${TRAINEE_BASE}/khao-sat`, label: 'Khảo sát', short: 'Khảo sát', icon: <ClipboardSvg />, module: 'survey' },
];

const ACCOUNT_NAV: NavItem[] = [
	{ to: `${TRAINEE_BASE}/thong-bao`, label: 'Thông báo', short: 'Thông báo', icon: <BellSvg /> },
	{ to: `${TRAINEE_BASE}/ho-so`, label: 'Hồ sơ cá nhân', short: 'Hồ sơ', icon: <UserSvg /> },
];

// Thanh tab đáy trên điện thoại: 5 mục hay dùng nhất, Điểm danh QR ở giữa nổi bật.
const BOTTOM_TABS = [0, 1, 4, 2, 3];

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
 * ≥1024px: sidebar đầy đủ · 640–1023px: cột biểu tượng · <640px: thanh trên gọn + tab đáy.
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
	const nav = NAV.filter((i) => !i.module || modules[i.module]);

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
			{short ? (
				<span>{item.short}</span>
			) : (
				<>
					<span className={styles.labelFull}>{item.label}</span>
					<span className={styles.labelShort}>{item.short}</span>
				</>
			)}
		</NavLink>
	);

	const hasHeader = Boolean(pageTitle || pageSubtitle || headerActions || breadcrumbs?.length);
	const back = breadcrumbs?.[breadcrumbs.length - 1]?.path;

	return (
		<div className={styles.shell}>
			{/* ══ SIDEBAR (máy tính / máy tính bảng) ══ */}
			<aside className={styles.sidebar}>
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
						<span className={styles.brandSub}>BV Hữu nghị ĐK Nghệ An</span>
					</span>
				</button>

				<nav
					className={styles.sideNav}
					aria-label='Điều hướng học viên'
				>
					{nav.map((i) => navLink(i, styles.sideItem, styles.sideItemActive))}
					<div className={styles.sideSep} />
					{ACCOUNT_NAV.map((i) => navLink(i, styles.sideItem, styles.sideItemActive))}
				</nav>

				<div className={styles.sideUser}>
					<span className={styles.avatar}>{getInitials(name)}</span>
					<span className={styles.sideUserMeta}>
						<span className={styles.sideUserName}>{name}</span>
						<span className={styles.sideUserRole}>Học viên</span>
					</span>
					<button
						type='button'
						className={styles.sideLogout}
						onClick={handleLogout}
						title='Đăng xuất'
						aria-label='Đăng xuất'
					>
						<LogoutSvg />
					</button>
				</div>
			</aside>

			<div className={styles.main}>
				{/* ══ TOP BAR ══ */}
				<header className={styles.topbar}>
					<button
						type='button'
						className={styles.topBrand}
						onClick={() => navigate(TRAINEE_BASE)}
						aria-label='Về tổng quan'
					>
						<img
							src={Logo}
							alt=''
						/>
						<span>Cổng học viên</span>
					</button>
					<div className={styles.topSpacer} />
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
							<span className={styles.userChipName}>{name}</span>
						</button>
						{menuOpen && (
							<div
								className={styles.menu}
								role='menu'
							>
								<div className={styles.menuHead}>
									<strong>{name}</strong>
									<span>{stored?.email ?? stored?.username}</span>
								</div>
								{/* Điện thoại: các mục không có trên thanh tab đáy */}
								{[...nav.filter((item) => !BOTTOM_TABS.includes(NAV.indexOf(item))), ...ACCOUNT_NAV].map((i) =>
									navLink(i, styles.menuItem, styles.menuItemActive),
								)}
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
				</header>

				{/* ══ NỘI DUNG ══ */}
				<main className={styles.content}>
					{hasHeader && (
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
					)}
					<TwoFactorReminder />
					{children}
				</main>
			</div>

			{/* ══ TAB ĐÁY (điện thoại) ══ */}
			<nav
				className={styles.bottomNav}
				aria-label='Điều hướng nhanh'
			>
				{BOTTOM_TABS.map((idx) => {
					const item = NAV[idx];
					return navLink(
						item,
						`${styles.tab} ${item.to.endsWith('/diem-danh') ? styles.tabQr : ''}`,
						styles.tabActive,
						true,
					);
				})}
			</nav>
		</div>
	);
}
