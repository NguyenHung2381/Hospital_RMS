import {
	ActivitySvg,
	ApproveSvg,
	BadgeSvg,
	BellSvg,
	BookOpenSvg,
	BuildingSvg,
	CalendarSvg,
	CheckCircleSvg,
	ClipboardCheckSvg,
	ClipboardSvg,
	ClockSvg,
	CopySvg,
	DashboardSvg,
	DeptSvg,
	DocSvg,
	DownloadSvg,
	EditSvg,
	HelpSvg,
	HistorySvg,
	KeySvg,
	LinkSvg,
	ListSvg,
	MessageSvg,
	MonitorSvg,
	QrSvg,
	RoleSvg,
	RoundSvg,
	ShieldSvg,
	TagSvg,
	TopicSvg,
	TrendUpSvg,
	UserCheckSvg,
	UserPlusSvg,
	UserSvg,
	UsersSvg,
	WarnSvg,
} from '@/assets/icons';
import type { PermissionKey } from '@/shared/types/permissions.generated';
import type React from 'react';
import { DASHBOARD_TABS } from '../../features/dashboard/constants/dashboardTabs';
import type { MenuCatalog } from '../../shared/hooks/useMenuConfig';
import type { ModuleKey } from '../../shared/hooks/useModules';
import styles from './AdminLayout.module.css';

// Cấu hình menu trang quản trị — tách khỏi index.tsx để trang Cấu hình hệ thống
// (tab Menu hiển thị) dùng chung danh sách mục.

// ─── ROUTE MAP ────────────────────────────
// Map từ nav key → đường dẫn URL thực tế
export const KEY_TO_PATH: Record<string, string> = {
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
	formConfigs: '/admin/form-configs',
	externalReviewers: '/admin/external-reviewers',
	categories: '/admin/categories',
	trainees: '/admin/trainees',
	dtlt: '/admin/dtlt',
	gphn: '/admin/practice-records',
	ctcv: '/admin/ctcv',
	trainingPrograms: '/admin/training-programs',
	myTasks: '/admin/viec-cua-toi',
	lecturers: '/admin/lecturers',
	trainingCatalog: '/admin/trainee-types',
	questionBank: '/admin/question-bank',
	cmeCompliance: '/admin/cme-compliance',
	cmeRecords: '/admin/cme-records',
	staffLicenses: '/admin/staff-licenses',
	staffAttendance: '/admin/staff-attendance',
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
export const PATH_TO_KEY: Record<string, string> = Object.fromEntries(
	Object.entries(KEY_TO_PATH).map(([k, v]) => [v, k]),
);
// Dashboard / Danh mục NCKH / Danh mục đào tạo gộp nhiều tab dưới 1 mục
// sidebar — các path tab còn lại (ngoài path mặc định) cần trỏ ngược thủ công
// để vẫn highlight đúng mục khi đang ở tab khác.
DASHBOARD_TABS.forEach((t) => {
	PATH_TO_KEY[t.to] = 'dashboard';
});
['/admin/levels', '/admin/round-types'].forEach((p) => {
	PATH_TO_KEY[p] = 'categories';
});
[
	'/admin/training-forms',
	'/admin/training-types',
	'/admin/professional-fields',
	'/admin/practice-forms',
	'/admin/sending-units',
	'/admin/hospital-training-topics',
	'/admin/trainee-document-types',
].forEach((p) => {
	PATH_TO_KEY[p] = 'trainingCatalog';
});

// ─── TAB CỦA MỤC MENU ─────────────────────
// Mục menu gộp nhiều trang: mỗi trang là 1 tab (AdminLayout vẽ thanh tab ở đầu
// trang). Tab chỉ hiện khi có quyền; bấm mục menu sẽ mở tab đầu tiên được phép.
export interface SectionTab {
	to: string;
	label: string;
	perm?: PermissionKey;
}
export const SECTION_TABS: Record<string, SectionTab[]> = {
	// Mỗi loại đào tạo 1 mục: khóa của loại đó, lịch học, học viên đã ghi danh.
	dtlt: [
		{ to: '/admin/dtlt', label: 'Khóa học', perm: 'courses:read' },
		{ to: '/admin/dtlt/lich-hoc', label: 'Lịch học', perm: 'courses:read' },
		{ to: '/admin/dtlt/hoc-vien', label: 'Học viên', perm: 'trainees:read' },
	],
	// Theo luồng việc: mở đợt → hồ sơ từng người → theo dõi hằng ngày → nhập kết quả vòng.
	// Đợt thực hành đứng đầu như "Khóa học" của DTLT/CTCV.
	gphn: [
		{ to: '/admin/practice-batches', label: 'Đợt thực hành', perm: 'courses:read' },
		{ to: '/admin/practice-records', label: 'Hồ sơ thực hành', perm: 'courses:read' },
		{ to: '/admin/practice-board', label: 'Theo ngày', perm: 'courses:read' },
		{ to: '/admin/practice-results', label: 'Nhập kết quả vòng', perm: 'courses:update' },
		{ to: '/admin/gphn/hoc-vien', label: 'Học viên', perm: 'trainees:read' },
	],
	ctcv: [
		{ to: '/admin/ctcv', label: 'Khóa học', perm: 'courses:read' },
		{ to: '/admin/ctcv/lich-hoc', label: 'Lịch học', perm: 'courses:read' },
		{ to: '/admin/ctcv/hoc-vien', label: 'Học viên', perm: 'trainees:read' },
	],
	staffAttendance: [
		{ to: '/admin/staff-attendance', label: 'Điểm danh', perm: 'staff_attendance:read' },
		{ to: '/admin/shift-roster', label: 'Phân ca', perm: 'staff_attendance:roster' },
		{ to: '/admin/leave-requests', label: 'Đơn xin phép', perm: 'staff_attendance:approve' },
		{ to: '/admin/shifts', label: 'Ca & mẫu ca tuần', perm: 'staff_attendance:manage' },
	],
	trainingPrograms: [
		{ to: '/admin/training-programs', label: 'Chương trình' },
		{ to: '/admin/lessons', label: 'Bài học' },
	],
};
Object.entries(SECTION_TABS).forEach(([key, tabs]) =>
	tabs.forEach((t) => {
		PATH_TO_KEY[t.to] = key;
	}),
);
// Chi tiết khóa (/admin/courses/:id) khi chưa tải xong khóa: tạm tô sáng Đào tạo liên tục.
PATH_TO_KEY['/admin/courses'] = 'dtlt';
/** Tab của mục menu đang chứa đúng đường dẫn này (null = trang không thuộc nhóm tab). */
export const sectionTabsOf = (pathname: string) => {
	const key = PATH_TO_KEY[pathname];
	return key ? (SECTION_TABS[key] ?? null) : null;
};

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
// - 4 dashboard (chung / NCKH / Đào tạo / Hội nghị & CME) là 1 trang có tab
//   (DashboardTabs) nên chỉ có 1 mục menu; tab của module bị tắt tự ẩn.
// - Hội nghị (tổ chức sự kiện) và Tín chỉ CME (tín chỉ từ hội nghị,
//   khóa học, ghi nhận ngoài) là 2 nhóm riêng, dùng chung module 'seminar'.
// - Mục dùng chung nhiều mảng (Báo cáo, Thông báo, Khảo sát) không nhét vào
//   "Quản trị hệ thống"; Nhân sự (CCHN) tách nhóm riêng.
// - Đào tạo chia theo loại: Đào tạo liên tục / Giấy phép hành nghề / Cầm tay chỉ
//   việc, mỗi loại 1 mục; ca & điểm danh và thiết lập là 2 nhóm riêng. Trang cùng
//   loại gộp thành tab của 1 mục (SECTION_TABS) thay vì mỗi trang 1 mục menu.
// - Trang có tab (Danh mục NCKH, Danh mục đào tạo) chỉ có 1 mục menu.
export const NAV_GROUPS: NavGroup[] = [
	{
		section: 'Tổng quan',
		items: [
			navItem('dashboard', 'Bảng điều khiển', DashboardSvg),
			navItem('myTasks', 'Việc của tôi', CheckCircleSvg),
			navItem('reports', 'Báo cáo & xuất dữ liệu', DownloadSvg, 'reports:read'),
		],
	},
	{
		// Luồng: mở đợt → lịch trình → đề tài nộp vào → phê duyệt → hội đồng chấm.
		section: 'Nghiên cứu khoa học',
		items: [
			navItem('rounds', 'Đợt nghiên cứu', RoundSvg, 'rounds:read'),
			navItem('schedule', 'Lịch trình đợt', CalendarSvg, 'rounds:read'),
			navItem('topics', 'Đề tài nghiên cứu', TopicSvg, 'topics:read'),
			navItem('approvals', 'Phê duyệt đề tài', ApproveSvg, 'topics:approve'),
			navItem('councils', 'Hội đồng chấm đề cương', ClipboardCheckSvg, 'councils:read'),
			navItem(
				'externalReviewers',
				'Chuyên gia ngoài viện',
				UserPlusSvg,
				'councils:read',
			),
			// 1 trang 3 tab: Phân loại / Cấp độ / Loại đợt (trước đây là 3 mục menu).
			navItem('categories', 'Danh mục NCKH', TagSvg, 'catalog:read'),
		],
	},
	{
		// Chia theo loại đào tạo — mỗi loại 1 mục, việc của loại đó là các tab bên trong.
		// "Tất cả học viên" là danh bạ chung (1 người có thể học nhiều loại).
		section: 'Đào tạo',
		items: [
			navItem('dtlt', 'Đào tạo liên tục', TrendUpSvg),
			navItem('gphn', 'Giấy phép hành nghề', DocSvg),
			navItem('ctcv', 'Cầm tay chỉ việc', ActivitySvg),
			navItem('trainees', 'Tất cả học viên', UsersSvg, 'trainees:read'),
		],
	},
	{
		// Ca, phân ca, điểm danh và đơn xin phép của học viên — 1 mục, mỗi việc 1 tab (theo quyền).
		section: 'Ca & điểm danh học viên',
		items: [navItem('staffAttendance', 'Ca & điểm danh', ClockSvg)],
	},
	{
		// Khai báo 1 lần trước khi mở khóa: chương trình & bài học → câu hỏi → giảng viên → danh mục.
		section: 'Thiết lập đào tạo',
		items: [
			navItem(
				'trainingPrograms',
				'Chương trình & bài học',
				BookOpenSvg,
				'training_programs:read',
			),
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
		// Tổ chức sự kiện: lập hội nghị / buổi tập huấn → quét vé điểm danh tại cửa hội trường.
		section: 'Hội nghị & tập huấn',
		items: [
			navItem('seminars', 'Hội thảo & hội nghị', MonitorSvg, 'seminars:read'),
			navItem('hospitalTrainings', 'Tập huấn bệnh viện', UsersSvg, 'seminars:read'),
			navItem('ticketScan', 'Quét vé điểm danh', QrSvg, 'seminars:update'),
		],
	},
	{
		// Tín chỉ CME: cấp từ hội nghị → ghi nhận ngoài → theo dõi ngưỡng → danh mục.
		section: 'Tín chỉ CME',
		items: [
			navItem('cmeRegister', 'Sổ cấp chứng nhận', BadgeSvg, 'seminars:read'),
			navItem('cmeRecords', 'Ghi nhận độc lập', EditSvg, 'cme_records:manage'),
			navItem(
				'cmeCompliance',
				'Theo dõi ngưỡng tín chỉ',
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
		// CCHN là hồ sơ nhân sự.
		section: 'Nhân sự',
		items: [
			navItem(
				'staffLicenses',
				'Chứng chỉ hành nghề',
				ShieldSvg,
				'staff_licenses:read',
			),
		],
	},
	{
		section: 'Thông báo & khảo sát',
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
			navItem('roles', 'Vai trò & quyền', RoleSvg, 'roles:read'),
			navItem('departments', 'Khoa / Phòng ban', DeptSvg, 'departments:read'),
			navItem('venues', 'Địa điểm / Phòng họp', BuildingSvg, 'venues:read'),
			navItem('personMerge', 'Duyệt trùng danh tính', CopySvg, 'persons:read'),
			navItem('workflows', 'Quy trình duyệt', LinkSvg, 'workflows:manage'),
			navItem(
				'settings',
				'Cấu hình hệ thống',
				KeySvg,
				'system_settings:manage',
			),
			navItem('formConfigs', 'Cấu hình form', EditSvg, 'form_configs:manage'),
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
	'Ca & điểm danh học viên': 'attendance',
	'Thiết lập đào tạo': 'training',
	'Hội nghị & tập huấn': 'seminar',
	'Tín chỉ CME': 'seminar',
};
const MODULE_BY_KEY: Record<string, ModuleKey> = {
	surveys: 'survey',
	staffAttendance: 'attendance',
};
export const moduleOf = (section: string, key: string) =>
	MODULE_BY_KEY[key] ?? MODULE_BY_SECTION[section];

// Không cho tắt: Bảng điều khiển là trang mặc định của /admin, Cấu hình hệ thống
// là nơi bật lại menu — tắt là tự khóa mình.
const LOCKED = new Set(['dashboard', 'settings']);

/** Danh sách mục menu quản trị cho tab "Menu hiển thị" ở Cấu hình hệ thống. */
export const ADMIN_MENU: MenuCatalog = NAV_GROUPS.map((g) => ({
	section: g.section,
	items: g.items.map((it) => ({
		key: it.key,
		label: it.label,
		module: moduleOf(g.section, it.key),
		locked: LOCKED.has(it.key),
	})),
}));
