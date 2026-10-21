import {
	ApproveSvg,
	BadgeSvg,
	BellSvg,
	BookOpenSvg,
	BuildingSvg,
	CalendarSvg,
	CheckCircleSvg,
	ChevLSvg,
	ClipboardCheckSvg,
	ClipboardSvg,
	ClockSvg,
	CopySvg,
	DashboardSvg,
	DeptSvg,
	DownloadSvg,
	EditSvg,
	FileTextSvg,
	HelpSvg,
	HistorySvg,
	KeySvg,
	LayersSvg,
	LinkSvg,
	ListSvg,
	LogoutSvg,
	MenuSvg,
	MessageSvg,
	MonitorSvg,
	MoreVSvg,
	QrSvg,
	RoleSvg,
	RoundSvg,
	ShieldSvg,
	TagSvg,
	TopicSvg,
	UserCheckSvg,
	UserPlusSvg,
	UserSvg,
	UsersSvg,
	WarnSvg,
	XSvg,
} from '@/assets/icons';
import type { PermissionKey } from '@/shared/types/permissions.generated';
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
import { useModules, type ModuleKey } from '../../shared/hooks/useModules';
import { usePermission } from '../../shared/hooks/usePermission';
import { getInitials } from '../../shared/utils/helper';
import { getStoredUser } from '../../shared/utils/storage';
import { useRealtimeUpdate } from '../hooks/useRealtime';
import styles from './AdminLayout.module.css';

// ─── STORAGE KEY ──────────────────────────
const SIDEBAR_KEY = 'rms_sidebar_collapsed';
const NAV_SCROLL_KEY = 'rms_sidebar_scroll';

// ─── ROUTE MAP ────────────────────────────
// Map từ nav key → đường dẫn URL thực tế
const KEY_TO_PATH: Record<string, string> = {
	dashboard: '/admin',
	topics: '/admin/topics',
	rounds: '/admin/rounds',
	councils: '/admin/councils',
	seminars: '/admin/seminars',
	hospitalTrainings: '/admin/hospital-trainings',
	ticketScan: '/admin/quet-ve',
	cmeRegister: '/admin/cme-register',
	approvals: '/admin/approvals',
	departments: '/admin/departments',
	venues: '/admin/venues',
	settings: '/admin/settings',
	externalReviewers: '/admin/external-reviewers',
	categories: '/admin/categories',
	trainees: '/admin/trainees',
	trainingPrograms: '/admin/training-programs',
	lessons: '/admin/lessons',
	classSchedule: '/admin/class-schedule',
	myTasks: '/admin/viec-cua-toi',
	lecturers: '/admin/lecturers',
	trainingCatalog: '/admin/trainee-types',
	courses: '/admin/courses',
	practiceBoard: '/admin/practice-board',
	questionBank: '/admin/question-bank',
	cmeCompliance: '/admin/cme-compliance',
	cmeRecords: '/admin/cme-records',
	staffLicenses: '/admin/staff-licenses',
	staffAttendance: '/admin/staff-attendance',
	shifts: '/admin/shifts',
	shiftRoster: '/admin/shift-roster',
	cmeCreditCatalog: '/admin/cme-credit-categories',
	users: '/admin/users',
	roles: '/admin/roles',
	reports: '/admin/reports',
	schedule: '/admin/schedule',
	notifications: '/admin/notifications',
	activityLogs: '/admin/activity-logs',
	personMerge: '/admin/person-merge',
	surveys: '/admin/surveys',
	workflows: '/admin/workflows',
};

// Map ngược từ URL pathname → nav key (để highlight sidebar)
const PATH_TO_KEY: Record<string, string> = Object.fromEntries(
	Object.entries(KEY_TO_PATH).map(([k, v]) => [v, k]),
);
// Dashboard / Danh mục NCKH / Danh mục Đào tạo gộp nhiều tab dưới 1 mục
// sidebar — các path tab còn lại (ngoài path mặc định) cần trỏ ngược thủ công
// để vẫn highlight đúng mục khi đang ở tab khác.
DASHBOARD_TABS.forEach((t) => {
	PATH_TO_KEY[t.to] = 'dashboard';
});
['/admin/levels', '/admin/round-types'].forEach((p) => {
	PATH_TO_KEY[p] = 'categories';
});
['/admin/training-forms', '/admin/training-types', '/admin/hospital-training-topics'].forEach((p) => {
	PATH_TO_KEY[p] = 'trainingCatalog';
});

// ─── NAV CONFIG ───────────────────────────
interface NavItem {
	key: string;
	label: string;
	icon: React.ReactNode;
	badge?: number | string;
	// Quyền cần có để thấy mục này (bỏ trống = luôn hiện cho người vào được /admin)
	perm?: PermissionKey;
}
interface NavGroup {
	section: string;
	items: NavItem[];
}

const navItem = (
	key: string,
	label: string,
	Icon: React.ComponentType<{ className?: string }>,
	perm?: PermissionKey,
): NavItem => ({ key, label, icon: <Icon className={styles.navIcon} />, perm });

// Nguyên tắc sắp xếp:
// - Mỗi mảng nghiệp vụ là 1 nhóm, các mục đi theo luồng công việc, danh
//   mục/cấu hình của mảng xếp cuối nhóm.
// - 4 dashboard (chung / NCKH / Đào tạo / Hội nghị & ĐTLT) là 1 trang có tab
//   (DashboardTabs) nên chỉ có 1 mục menu; tab của module bị tắt tự ẩn.
// - Hội nghị (tổ chức sự kiện) và Đào tạo liên tục (tín chỉ CME từ hội nghị,
//   khoá học, ghi nhận ngoài) là 2 nhóm riêng, dùng chung module 'seminar'.
// - Mục dùng chung nhiều mảng (Báo cáo, Thông báo, Khảo sát) không nhét vào
//   "Quản trị hệ thống"; Nhân sự (chấm công, CCHN) tách nhóm riêng.
// - Trang có tab (Danh mục NCKH, Danh mục đào tạo) chỉ có 1 mục menu.
const NAV_GROUPS: NavGroup[] = [
	{
		section: 'Tổng quan',
		items: [
			navItem('dashboard', 'Bảng điều khiển', DashboardSvg),
			navItem('myTasks', 'Việc của tôi', CheckCircleSvg),
			navItem('reports', 'Báo cáo & Xuất', DownloadSvg, 'reports:read'),
		],
	},
	{
		// Luồng: mở đợt → lịch trình → đề tài nộp vào → phê duyệt → hội đồng chấm.
		section: 'Nghiên cứu khoa học',
		items: [
			navItem('rounds', 'Đợt nghiên cứu', RoundSvg, 'rounds:read'),
			navItem('schedule', 'Lịch trình đợt', CalendarSvg, 'rounds:read'),
			navItem('topics', 'Đề tài nghiên cứu', TopicSvg, 'topics:read'),
			navItem('approvals', 'Phê duyệt', ApproveSvg, 'topics:approve'),
			navItem('councils', 'Hội đồng chấm', ClipboardCheckSvg, 'councils:read'),
			navItem(
				'externalReviewers',
				'Người ngoài viện',
				UserPlusSvg,
				'councils:read',
			),
			// 1 trang 3 tab: Phân loại / Cấp độ / Loại đợt (trước đây là 3 mục menu).
			navItem('categories', 'Danh mục NCKH', TagSvg, 'catalog:read'),
		],
	},
	{
		// Việc hằng ngày: khóa học (ghi danh → lịch → thi → kết quả) và thực hành GPHN.
		section: 'Đào tạo',
		items: [
			navItem('courses', 'Khóa học', ClipboardCheckSvg, 'courses:read'),
			navItem('practiceBoard', 'Thực hành GPHN', DeptSvg, 'courses:read'),
			navItem('classSchedule', 'Lịch học', CalendarSvg, 'courses:read'),
			navItem('trainees', 'Học viên', UsersSvg, 'trainees:read'),
		],
	},
	{
		// Khai báo 1 lần trước khi mở khóa: chương trình → bài học → câu hỏi → giảng viên → danh mục.
		section: 'Thiết lập đào tạo',
		items: [
			navItem(
				'trainingPrograms',
				'Chương trình đào tạo',
				BookOpenSvg,
				'training_programs:read',
			),
			navItem('lessons', 'Bài học', FileTextSvg, 'training_programs:read'),
			navItem('questionBank', 'Ngân hàng câu hỏi', HelpSvg, 'exams:manage'),
			navItem('lecturers', 'Giảng viên', UserCheckSvg, 'lecturers:read'),
			navItem(
				'trainingCatalog',
				'Danh mục đào tạo',
				ClipboardSvg,
				'training_catalog:read',
			),
		],
	},
	{
		// Tổ chức sự kiện: lập hội nghị → quét vé điểm danh tại cửa hội trường.
		section: 'Hội nghị',
		items: [
			navItem('seminars', 'Hội thảo & Hội nghị', MonitorSvg, 'seminars:read'),
			navItem('hospitalTrainings', 'Tập huấn bệnh viện', UsersSvg, 'seminars:read'),
			navItem('ticketScan', 'Quét vé điểm danh', QrSvg, 'seminars:update'),
		],
	},
	{
		// Tín chỉ CME: cấp từ hội nghị → ghi nhận ngoài → theo dõi ngưỡng → danh mục.
		section: 'Đào tạo liên tục',
		items: [
			navItem('cmeRegister', 'Sổ cấp chứng nhận', BadgeSvg, 'seminars:read'),
			navItem('cmeRecords', 'Ghi nhận độc lập', EditSvg, 'cme_records:manage'),
			navItem(
				'cmeCompliance',
				'Cảnh báo tín chỉ',
				WarnSvg,
				'seminars:cme_manage',
			),
			navItem(
				'cmeCreditCatalog',
				'Danh mục quy đổi tín chỉ',
				ListSvg,
				'training_catalog:read',
			),
		],
	},
	{
		// Luồng: khai báo ca → phân ca → chấm công; CCHN là hồ sơ nhân sự.
		section: 'Nhân sự',
		items: [
			navItem('shifts', 'Ca làm việc', LayersSvg, 'staff_attendance:manage'),
			navItem('shiftRoster', 'Phân ca', CalendarSvg, 'staff_attendance:roster'),
			navItem(
				'staffAttendance',
				'Bảng chấm công',
				ClockSvg,
				'staff_attendance:read',
			),
			navItem(
				'staffLicenses',
				'Chứng chỉ hành nghề',
				ShieldSvg,
				'staff_licenses:read',
			),
		],
	},
	{
		section: 'Thông báo & Khảo sát',
		items: [
			navItem('notifications', 'Thông báo', BellSvg, 'notifications:read'),
			navItem('surveys', 'Khảo sát', MessageSvg, 'surveys:manage'),
		],
	},
	{
		// Tài khoản → tổ chức → dữ liệu dùng chung → quy trình → cấu hình → giám sát.
		section: 'Quản trị hệ thống',
		items: [
			navItem('users', 'Người dùng', UserSvg, 'users:read'),
			navItem('roles', 'Vai trò & Quyền', RoleSvg, 'roles:read'),
			navItem('departments', 'Khoa / Phòng ban', DeptSvg, 'departments:read'),
			navItem('venues', 'Địa điểm / Phòng họp', BuildingSvg, 'venues:read'),
			navItem('personMerge', 'Duyệt trùng danh tính', CopySvg, 'persons:read'),
			navItem('workflows', 'Workflow duyệt', LinkSvg, 'workflows:manage'),
			navItem(
				'settings',
				'Cấu hình hệ thống',
				KeySvg,
				'system_settings:manage',
			),
			navItem(
				'activityLogs',
				'Nhật ký hoạt động',
				HistorySvg,
				'activity_logs:read',
			),
		],
	},
];

// Module nghiệp vụ có thể tắt ở Cấu hình hệ thống (theo nhóm menu / từng mục lẻ).
const MODULE_BY_SECTION: Record<string, ModuleKey> = {
	'Nghiên cứu khoa học': 'research',
	'Đào tạo': 'training',
	'Thiết lập đào tạo': 'training',
	'Hội nghị': 'seminar',
	'Đào tạo liên tục': 'seminar',
};
const MODULE_BY_KEY: Record<string, ModuleKey> = {
	surveys: 'survey',
	staffAttendance: 'attendance',
	shifts: 'attendance',
	shiftRoster: 'attendance',
};
const moduleOf = (section: string, key: string) =>
	MODULE_BY_KEY[key] ?? MODULE_BY_SECTION[section];

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

	// Lọc menu theo quyền của vai trò (giữ nhóm nếu còn ít nhất 1 mục).
	const { has } = usePermission();
	const modules = useModules();
	const navGroups = NAV_GROUPS.map((g) => ({
		...g,
		items: g.items.filter(
			(it) => has(it.perm) && modules[moduleOf(g.section, it.key)] !== false,
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
					{moduleOff ? (
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
