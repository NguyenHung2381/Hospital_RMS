import {
	ApproveSvg,
	BadgeSvg,
	BarChartSvg,
	BellSvg,
	BookOpenSvg,
	BuildingSvg,
	CalendarSvg,
	ChevLSvg,
	ClipboardCheckSvg,
	ClipboardSvg,
	DashboardSvg,
	DeptSvg,
	DownloadSvg,
	FileTextSvg,
	HelpSvg,
	HistorySvg,
	LayersSvg,
	LinkSvg,
	ListSvg,
	LogoutSvg,
	MenuSvg,
	MoreVSvg,
	QrSvg,
	RoleSvg,
	ShieldSvg,
	TagSvg,
	TopicSvg,
	UserCheckSvg,
	UserPlusSvg,
	UserSvg,
	UsersSvg,
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
	researchDashboard: '/admin/dashboard/research',
	trainingDashboard: '/admin/dashboard/training',
	seminarDashboard: '/admin/dashboard/seminar',
	topics: '/admin/topics',
	rounds: '/admin/rounds',
	councils: '/admin/councils',
	seminars: '/admin/seminars',
	ticketScan: '/admin/quet-ve',
	cmeRegister: '/admin/cme-register',
	approvals: '/admin/approvals',
	progress: '/admin/progress',
	files: '/admin/files',
	departments: '/admin/departments',
	venues: '/admin/venues',
	settings: '/admin/settings',
	externalReviewers: '/admin/external-reviewers',
	categories: '/admin/categories',
	levels: '/admin/levels',
	roundTypes: '/admin/round-types',
	trainees: '/admin/trainees',
	trainingPrograms: '/admin/training-programs',
	lessons: '/admin/lessons',
	classSchedule: '/admin/class-schedule',
	trainingPlans: '/admin/training-plans',
	myTasks: '/admin/viec-cua-toi',
	lecturers: '/admin/lecturers',
	trainingCatalog: '/admin/trainee-types',
	courses: '/admin/courses',
	questionBank: '/admin/question-bank',
	cmeCompliance: '/admin/cme-compliance',
	cmeRecords: '/admin/cme-records',
	staffLicenses: '/admin/staff-licenses',
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
// Danh mục Đào tạo gộp 4 tab dưới 1 mục sidebar — các path còn lại (ngoài
// path mặc định /admin/trainee-types) cần trỏ ngược thủ công để vẫn highlight
// đúng mục khi đang ở tab khác.
['/admin/training-forms', '/admin/training-types', '/admin/subjects'].forEach(
	(p) => {
		PATH_TO_KEY[p] = 'trainingCatalog';
	},
);

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

const NAV_GROUPS: NavGroup[] = [
	{
		section: 'Tổng quan',
		items: [
			{
				key: 'dashboard',
				label: 'Tổng quan chung',
				icon: <DashboardSvg className={styles.navIcon} />,
			},
			{
				key: 'researchDashboard',
				label: 'Tổng quan NCKH',
				icon: <DashboardSvg className={styles.navIcon} />,
			},
			{
				key: 'trainingDashboard',
				label: 'Tổng quan Đào tạo',
				icon: <DashboardSvg className={styles.navIcon} />,
			},
			{
				key: 'seminarDashboard',
				label: 'Tổng quan Hội thảo - CME',
				icon: <DashboardSvg className={styles.navIcon} />,
			},
			{
				key: 'myTasks',
				label: 'Việc của tôi',
				icon: <ApproveSvg className={styles.navIcon} />,
			},
		],
	},
	{
		// Gộp "Quản lý đề tài" + "Danh mục" (Phân loại/Cấp độ/Loại đợt) cũ làm 1 —
		// 3 danh mục này CHỈ dùng để phân loại đề tài NCKH, để chung với luồng
		// nghiệp vụ NCKH dễ tìm hơn là tách thành 1 mục "Danh mục" mơ hồ riêng.
		section: 'Nghiên cứu khoa học',
		items: [
			{
				key: 'topics',
				label: 'Đề tài nghiên cứu',
				icon: <TopicSvg className={styles.navIcon} />,
				perm: 'topics:read',
			},
			{
				key: 'rounds',
				label: 'Đợt nghiên cứu',
				icon: <HistorySvg className={styles.navIcon} />,
				perm: 'rounds:read',
			},
			{
				key: 'councils',
				label: 'Hội đồng chấm',
				icon: <ClipboardCheckSvg className={styles.navIcon} />,
				perm: 'councils:read',
			},
			{
				key: 'schedule',
				label: 'Lịch trình',
				icon: <CalendarSvg className={styles.navIcon} />,
				perm: 'rounds:read',
			},
			{
				key: 'approvals',
				label: 'Phê duyệt',
				icon: <ApproveSvg className={styles.navIcon} />,
				perm: 'topics:approve',
			},
			{
				key: 'externalReviewers',
				label: 'Người ngoài viện',
				icon: <UserPlusSvg className={styles.navIcon} />,
				perm: 'councils:read',
			},
			{
				key: 'categories',
				label: 'Phân loại đề tài',
				icon: <TagSvg className={styles.navIcon} />,
				perm: 'catalog:read',
			},
			{
				key: 'levels',
				label: 'Cấp độ đề tài',
				icon: <LayersSvg className={styles.navIcon} />,
				perm: 'catalog:read',
			},
			{
				key: 'roundTypes',
				label: 'Loại đợt',
				icon: <HistorySvg className={styles.navIcon} />,
				perm: 'catalog:read',
			},
		],
	},
	{
		// Đổi tên từ "Đào tạo & Hội nghị" — trước đây trùng chữ "Đào tạo" với mục
		// bên dưới gây nhầm lẫn 2 khu vực khác nhau (hội nghị/CME vs khóa học).
		section: 'Hội nghị & CME',
		items: [
			{
				key: 'seminars',
				label: 'Hội thảo & Hội nghị',
				icon: <CalendarSvg className={styles.navIcon} />,
				perm: 'seminars:read',
			},
			{
				key: 'ticketScan',
				label: 'Quét vé điểm danh',
				icon: <QrSvg className={styles.navIcon} />,
				perm: 'seminars:update',
			},
			{
				key: 'cmeRegister',
				label: 'Sổ cấp CME',
				icon: <BadgeSvg className={styles.navIcon} />,
				perm: 'seminars:read',
			},
			{
				key: 'cmeCompliance',
				label: 'Cảnh báo tín chỉ CME',
				icon: <BadgeSvg className={styles.navIcon} />,
				perm: 'seminars:cme_manage',
			},
			{
				key: 'cmeRecords',
				label: 'Ghi nhận CME độc lập',
				icon: <BadgeSvg className={styles.navIcon} />,
				perm: 'cme_records:manage',
			},
			{
				key: 'staffLicenses',
				label: 'Chứng chỉ hành nghề',
				icon: <ClipboardCheckSvg className={styles.navIcon} />,
				perm: 'staff_licenses:read',
			},
			{
				key: 'cmeCreditCatalog',
				label: 'Danh mục quy đổi CME',
				icon: <ListSvg className={styles.navIcon} />,
				perm: 'training_catalog:read',
			},
		],
	},
	{
		// Bỏ "(Khoá học)" trong tên — không còn trùng với mục "Hội nghị & CME" ở
		// trên nên không cần phân biệt nữa.
		section: 'Đào tạo',
		items: [
			// Theo luồng: lập kế hoạch → nội dung → vận hành lớp → con người → danh mục.
			{
				key: 'trainingPlans',
				label: 'Kế hoạch đào tạo',
				icon: <BarChartSvg className={styles.navIcon} />,
				perm: 'training_plans:manage',
			},
			{
				key: 'trainingPrograms',
				label: 'Chương trình đào tạo',
				icon: <BookOpenSvg className={styles.navIcon} />,
				perm: 'training_programs:read',
			},
			{
				key: 'lessons',
				label: 'Bài học',
				icon: <FileTextSvg className={styles.navIcon} />,
				perm: 'training_programs:read',
			},
			{
				key: 'courses',
				label: 'Khóa học',
				icon: <ClipboardCheckSvg className={styles.navIcon} />,
				perm: 'courses:read',
			},
			{
				key: 'classSchedule',
				label: 'Lịch học',
				icon: <CalendarSvg className={styles.navIcon} />,
				perm: 'courses:read',
			},
			{
				key: 'questionBank',
				label: 'Ngân hàng câu hỏi',
				icon: <HelpSvg className={styles.navIcon} />,
				perm: 'exams:manage',
			},
			{
				key: 'trainees',
				label: 'Học viên',
				icon: <UsersSvg className={styles.navIcon} />,
				perm: 'trainees:read',
			},
			{
				key: 'lecturers',
				label: 'Giảng viên',
				icon: <UserCheckSvg className={styles.navIcon} />,
				perm: 'lecturers:read',
			},
			{
				key: 'trainingCatalog',
				label: 'Danh mục đào tạo',
				icon: <ClipboardSvg className={styles.navIcon} />,
				perm: 'training_catalog:read',
			},
		],
	},
	{
		// Gộp thêm "Phòng ban" (dùng chung toàn hệ thống, không chỉ để phân loại
		// đề tài, nên hợp lý hơn khi đứng cạnh Người dùng/Vai trò) và "Báo cáo &
		// Xuất" (trước đây là mục "Xuất dữ liệu" — 1 mục cũng đủ thành 1 nhóm
		// riêng, không cần tách).
		section: 'Hệ thống',
		items: [
			{
				key: 'users',
				label: 'Người dùng',
				icon: <UserSvg className={styles.navIcon} />,
				perm: 'users:read',
			},
			{
				key: 'roles',
				label: 'Vai trò & Quyền',
				icon: <RoleSvg className={styles.navIcon} />,
				perm: 'roles:read',
			},
			{
				key: 'departments',
				label: 'Khoa / Phòng ban',
				icon: <DeptSvg className={styles.navIcon} />,
				perm: 'departments:read',
			},
			{
				key: 'venues',
				label: 'Địa điểm / Phòng họp',
				icon: <BuildingSvg className={styles.navIcon} />,
				perm: 'venues:read',
			},
			{
				key: 'notifications',
				label: 'Thông báo',
				icon: <BellSvg className={styles.navIcon} />,
				perm: 'notifications:read',
			},
			{
				key: 'personMerge',
				label: 'Duyệt trùng danh tính',
				icon: <UsersSvg className={styles.navIcon} />,
				perm: 'persons:read',
			},
			{
				key: 'activityLogs',
				label: 'Nhật ký hoạt động',
				icon: <ListSvg className={styles.navIcon} />,
				perm: 'activity_logs:read',
			},
			{
				key: 'surveys',
				label: 'Khảo sát',
				icon: <ClipboardSvg className={styles.navIcon} />,
				perm: 'surveys:manage',
			},
			{
				key: 'workflows',
				label: 'Workflow duyệt',
				icon: <LinkSvg className={styles.navIcon} />,
				perm: 'workflows:manage',
			},
			{
				key: 'settings',
				label: 'Cấu hình hệ thống',
				icon: <ShieldSvg className={styles.navIcon} />,
				perm: 'system_settings:manage',
			},
			{
				key: 'reports',
				label: 'Báo cáo & Xuất',
				icon: <DownloadSvg className={styles.navIcon} />,
				perm: 'reports:read',
			},
		],
	},
];

// Module nghiệp vụ có thể tắt ở Cấu hình hệ thống (theo nhóm menu / từng mục tổng quan).
const MODULE_BY_SECTION: Record<string, ModuleKey> = {
	'Nghiên cứu khoa học': 'research',
	'Hội nghị & CME': 'seminar',
	'Đào tạo': 'training',
};
const MODULE_BY_KEY: Record<string, ModuleKey> = {
	researchDashboard: 'research',
	trainingDashboard: 'training',
	seminarDashboard: 'seminar',
	surveys: 'survey',
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
	const moduleOff = NAV_GROUPS.flatMap((g) =>
		g.items
			.filter((it) => modules[moduleOf(g.section, it.key)] === false)
			.map((it) => KEY_TO_PATH[it.key]),
	).some(
		(p) =>
			p && (location.pathname === p || location.pathname.startsWith(`${p}/`)),
	);

	// Tự detect activePage từ URL hiện tại
	const activePage = PATH_TO_KEY[location.pathname] ?? 'dashboard';

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
		approvals?: number;
		myTasks?: number;
		notifications?: number;
	}>({});

	const fetchBadges = useCallback(() => {
		// approvals: số đề tài THỰC SỰ chờ actor này duyệt (allowed_actions chứa
		// 'approve', tính theo quyền + phạm vi thật) — thay vì đếm toàn bộ đề tài
		// 'submitted' trên toàn hệ thống như trước (sai với admin phạm vi khoa).
		// myTasks gộp thêm cả việc chấm tiến độ hội đồng (khác 'approvals').
		Promise.all([getTopics({ limit: 1 }), getMyTasks()])
			.then(([topicsRes, tasks]) => {
				setNavBadges({
					topics: topicsRes.pagination.total,
					approvals: tasks.approvals.length,
					myTasks: tasks.total,
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
