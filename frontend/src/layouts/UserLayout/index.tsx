import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Logo from '../../assets/logo.png';
import { getMyProgressCount } from '../../features/council/api/councilApi';
import { useRegistrationOpen } from '../../features/round/hooks/useRegistrationOpen';
import { NotificationPanel } from '../../features/notifications/components/NotificationPanel';
import { useNotifications } from '../../features/notifications/hooks/useNotifications';
import { toNotif } from '../../features/notifications/utils/notifUtils';
import { useModules, type ModuleKey } from '../../shared/hooks/useModules';
import { usePermission } from '../../shared/hooks/usePermission';
import { scopeOf } from '../../shared/utils/permissions';
import { getInitials } from '../../shared/utils/helper';
import { getStoredUser, type StoredUser } from '../../shared/utils/storage';
import { logout } from '../../features/auth/api/authApi';
import TwoFactorReminder from '../../shared/components/TwoFactorReminder';
import { isTraineeAccount } from '../../app/router/authHelpers';
import TraineeLayout from '../TraineeLayout';
import styles from './UserLayout.module.css';
import {
	BadgeSvg,
	BellSvg,
	BookOpenSvg,
	ClipboardCheckSvg,
	ClipboardSvg,
	ClockSvg,
	DashboardSvg,
	DocPlusSvg,
	LogoutSvg,
	MenuSvg,
	MoreVSvg,
	ProgressSvg,
	QrSvg,
	TopicSvg,
	UserSvg,
	UsersSvg,
} from '@/assets/icons';

// ─── ROUTE MAP ────────────────────────────
const KEY_TO_PATH: Record<string, string> = {
	home: '/user',
	myTopics: '/user/my-topics',
	registerTopic: '/user/register-topic',
	councilProgress: '/user/council-progress',
	surveys: '/user/khao-sat',
	myTasks: '/user/viec-cua-toi',
	attendanceCheckIn: '/user/diem-danh',
	myTraining: '/user/khoa-hoc',
	myCme: '/user/cme',
	myAttendance: '/user/cham-cong',
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
	restrictMember?: boolean;
	managerOnly?: boolean;
	/** Chỉ hiện khi user đang giữ ghế trong ít nhất một hội đồng. */
	councilOnly?: boolean;
	/** Chỉ hiện khi đang trong thời gian "Đăng ký đề tài" của một đợt đang mở. */
	needsRegistrationWindow?: boolean;
	/** Ẩn khi module bị tắt ở Cấu hình hệ thống. */
	module?: ModuleKey;
}

// Cổng người dùng ít mục → thanh điều hướng NGANG thay cho sidebar dọc.
// Mục chính nằm trên thanh; mục "tài khoản" gom vào menu avatar.
// Thứ tự theo mảng nghiệp vụ: chung (trang chủ, việc cần làm, điểm danh QR
// dùng cho cả lớp học lẫn hội nghị) → NCKH → Đào tạo → CME → Khảo sát →
// Chấm công. Mục thuộc module nào thì ẩn khi module đó bị tắt.
const PRIMARY_NAV: NavItem[] = [
	{ key: 'home', label: 'Trang chủ', icon: <DashboardSvg className={styles.navIcon} /> },
	{ key: 'myTasks', label: 'Việc của tôi', icon: <ClipboardCheckSvg className={styles.navIcon} /> },
	{ key: 'attendanceCheckIn', label: 'Điểm danh QR', icon: <QrSvg className={styles.navIcon} /> },
	{ key: 'myTopics', label: 'Đề tài của tôi', icon: <TopicSvg className={styles.navIcon} />, module: 'research' },
	{
		key: 'registerTopic',
		label: 'Đăng ký đề tài',
		icon: <DocPlusSvg className={styles.navIcon} />,
		restrictMember: true,
		needsRegistrationWindow: true,
		module: 'research',
	},
	{
		key: 'councilProgress',
		label: 'Đánh giá tiến độ',
		icon: <ProgressSvg className={styles.navIcon} />,
		councilOnly: true,
		module: 'research',
	},
	{ key: 'myTraining', label: 'Khóa học của tôi', icon: <BookOpenSvg className={styles.navIcon} />, module: 'training' },
	{ key: 'myCme', label: 'Đào tạo liên tục', icon: <BadgeSvg className={styles.navIcon} />, module: 'seminar' },
	{ key: 'surveys', label: 'Khảo sát', icon: <ClipboardSvg className={styles.navIcon} />, module: 'survey' },
	{ key: 'myAttendance', label: 'Chấm công', icon: <ClockSvg className={styles.navIcon} />, module: 'attendance' },
];

const ACCOUNT_NAV: NavItem[] = [
	{ key: 'profile', label: 'Hồ sơ cá nhân', icon: <UserSvg className={styles.navIcon} /> },
	{
		key: 'deptAccounts',
		label: 'Tài khoản trong khoa',
		icon: <UsersSvg className={styles.navIcon} />,
		managerOnly: true,
	},
	{ key: 'notifications', label: 'Thông báo', icon: <BellSvg className={styles.navIcon} /> },
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
	/** Giữ tên cũ để tương thích: ẩn thanh điều hướng, chỉ còn nội dung căn giữa. */
	hideSidebar?: boolean;
}

// Tài khoản học viên (ngoại viện) dùng cổng học viên riêng — mọi trang dùng
// UserLayout (hồ sơ, thông báo, điểm danh QR, khảo sát…) tự hiện trong khung đó.
export default function UserLayout(props: UserLayoutProps) {
	return isTraineeAccount() ? <TraineeLayout {...props} /> : <PortalLayout {...props} />;
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

	const modules = useModules();
	const keep = (item: NavItem) => {
		if (item.module && !modules[item.module]) return false;
		if (item.restrictMember && !canRegisterTopic) return false;
		if (item.managerOnly && !isManagerAccount) return false;
		if (item.councilOnly && !isCouncilMember) return false;
		if (item.needsRegistrationWindow && !registrationOpen) return false;
		return true;
	};
	const primaryNav = PRIMARY_NAV.filter(keep);
	const accountNav = ACCOUNT_NAV.filter(keep);

	const showNav = !hideSidebar;

	// ── Mobile drawer ─────────────────────────
	const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
				setNotifOpen(false);
				setUserMenuOpen(false);
				setMobileNavOpen(false);
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, []);

	// ── Initials ──────────────────────────────
	const initials = userInitials ?? getInitials(userName);

	const currentLabel =
		[...PRIMARY_NAV, ...ACCOUNT_NAV].find((i) => i.key === activePage)?.label ??
		'Đề tài của tôi';

	const handleNavClick = (key: string) => {
		const path = KEY_TO_PATH[key];
		if (path) {
			setMobileNavOpen(false);
			setUserMenuOpen(false);
			navigate(path);
		}
	};

	const showPageHeader = Boolean(
		breadcrumbs?.length || pageTitle || pageSubtitle || headerActions,
	);

	return (
		<div className={styles.userWrapper}>
			{/* ══ TOP BAR ════════════════════════════ */}
			<header className={styles.topbar}>
				<div className={styles.topbarInner}>
					{showNav && (
						<button
							className={styles.mobileNavTrigger}
							onClick={() => setMobileNavOpen((o) => !o)}
							aria-label='Mở menu'
							aria-expanded={mobileNavOpen}
						>
							<MenuSvg />
						</button>
					)}

					<button
						className={styles.brand}
						onClick={() => navigate('/user')}
						aria-label='Về trang chủ'
					>
						<img
							src={Logo}
							alt='Logo BV Nghệ An'
							className={styles.brandLogo}
						/>
						<span className={styles.brandText}>
							<span className={styles.brandName}>BV Hữu nghị ĐK Nghệ An</span>
							<span className={styles.brandSub}>Cổng người dùng</span>
						</span>
					</button>

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
								s={styles}
							/>
						)}

						{/* User chip + dropdown */}
						<div
							className={styles.userMenuWrap}
							ref={userMenuRef}
						>
							<button
								className={styles.userChip}
								onClick={() => setUserMenuOpen((o) => !o)}
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
									className={styles.userDropdown}
									role='menu'
								>
									{accountNav.map((item) => (
										<button
											key={item.key}
											className={styles.userDropdownItem}
											onClick={() => handleNavClick(item.key)}
											role='menuitem'
										>
											{item.icon}
											<span>{item.label}</span>
										</button>
									))}
									<div className={styles.userDropdownSep} />
									<button
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

				{/* Hàng điều hướng riêng: đủ chỗ cho mọi mục, không đè lên cụm tài khoản. */}
				{showNav && (
					<div className={styles.topNavBar}>
						<nav className={styles.topNav}>
							{primaryNav.map((item) => (
								<button
									key={item.key}
									type='button'
									className={`${styles.navItem} ${activePage === item.key ? styles.active : ''}`}
									onClick={() => handleNavClick(item.key)}
								>
									{item.icon}
									<span>{item.label}</span>
								</button>
							))}
						</nav>
					</div>
				)}

				{/* Mobile drawer nav (dưới thanh bar) */}
				{showNav && (
					<div
						className={`${styles.mobileNav} ${mobileNavOpen ? styles.mobileNavOpen : ''}`}
					>
						{[...primaryNav, ...accountNav].map((item) => (
							<button
								key={item.key}
								type='button'
								className={`${styles.mobileNavItem} ${activePage === item.key ? styles.active : ''}`}
								onClick={() => handleNavClick(item.key)}
							>
								{item.icon}
								<span>{item.label}</span>
							</button>
						))}
						<button
							className={`${styles.mobileNavItem} ${styles.userDropdownDanger}`}
							onClick={handleLogout}
						>
							<LogoutSvg />
							<span>Đăng xuất</span>
						</button>
					</div>
				)}
			</header>

			{showNav && mobileNavOpen && (
				<div
					className={styles.mobileBackdrop}
					onClick={() => setMobileNavOpen(false)}
				/>
			)}

			{/* ══ PAGE ═══════════════════════════════ */}
			<main className={styles.pageArea}>
				<div className={styles.pageInner}>
					{showPageHeader && (
						<div className={styles.pageHeader}>
							<div className={styles.pageHeaderLeft}>
								<div className={styles.breadcrumb}>
									<button
										className={styles.breadcrumbItem}
										onClick={() => navigate('/user')}
									>
										Cổng người dùng
									</button>
									<span className={styles.breadcrumbSep}>/</span>
									{breadcrumbs?.map((bc, i) => (
										<React.Fragment key={i}>
											{bc.path ? (
												<button
													className={styles.breadcrumbItem}
													onClick={() => navigate(bc.path!)}
												>
													{bc.label}
												</button>
											) : (
												<span className={styles.breadcrumbItem}>
													{bc.label}
												</span>
											)}
											<span className={styles.breadcrumbSep}>/</span>
										</React.Fragment>
									))}
									<span className={styles.breadcrumbCurrent}>
										{currentLabel}
									</span>
								</div>
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
					{children}
				</div>
			</main>

			<footer className={styles.portalFooter}>
				© {new Date().getFullYear()} Bệnh viện Hữu Nghị Đa Khoa Nghệ An — Cổng
				người dùng
			</footer>
		</div>
	);
}
