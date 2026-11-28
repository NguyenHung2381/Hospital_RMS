import {
	ActivitySvg,
	BadgeSvg,
	BellSvg,
	BookOpenSvg,
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
	FingerprintSvg,
	HelpSvg,
	HistorySvg,
	KeySvg,
	LinkSvg,
	MessageSvg,
	MonitorSvg,
	QrSvg,
	RoleSvg,
	RoundSvg,
	SendSvg,
	ShieldSvg,
	TagSvg,
	TopicSvg,
	TrendUpSvg,
	UserCheckSvg,
	UsersSvg,
	WalletSvg,
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
	signing: '/admin/ky-so',
	signDocument: '/admin/ky-tai-lieu',
	signRequests: '/admin/trinh-ky',
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
	attendanceDevices: '/admin/attendance-devices',
	attendanceTimesheet: '/admin/attendance-timesheet',
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
	tuitionBank: '/admin/doi-soat-ngan-hang',
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
	/** Key menu riêng của tab (trang trước đây là 1 mục menu): tắt được ở tab
	 *  "Menu hiển thị" và theo cấu hình Ký số. Quy ước: tab của 1 mục hoặc đều có
	 *  key, hoặc đều không — có key thì công tắc là từng tab, không phải cả mục. */
	key?: string;
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
	// ── Mục gộp từ nhiều mục menu cũ: mỗi tab giữ key cũ để cấu hình ẩn/hiện đã lưu vẫn đúng.
	sign: [
		{ to: '/admin/trinh-ky', label: 'Trình ký văn bản', key: 'signRequests' },
		{ to: '/admin/ky-tai-lieu', label: 'Ký tài liệu', key: 'signDocument' },
	],
	rounds: [
		{ to: '/admin/rounds', label: 'Đợt nghiên cứu', perm: 'rounds:read', key: 'rounds' },
		{ to: '/admin/schedule', label: 'Lịch trình đợt', perm: 'rounds:read', key: 'schedule' },
	],
	topics: [
		{ to: '/admin/topics', label: 'Đề tài', perm: 'topics:read', key: 'topics' },
		{ to: '/admin/approvals', label: 'Phê duyệt', perm: 'topics:approve', key: 'approvals' },
	],
	councils: [
		{ to: '/admin/councils', label: 'Hội đồng chấm đề cương', perm: 'councils:read', key: 'councils' },
		{
			to: '/admin/external-reviewers',
			label: 'Chuyên gia ngoài viện',
			perm: 'councils:read',
			key: 'externalReviewers',
		},
	],
	attendanceTimesheet: [
		{
			to: '/admin/attendance-timesheet',
			label: 'Bảng công',
			perm: 'attendance_devices:read',
			key: 'attendanceTimesheet',
		},
		{
			to: '/admin/attendance-devices',
			label: 'Máy chấm công',
			perm: 'attendance_devices:read',
			key: 'attendanceDevices',
		},
	],
	cme: [
		{ to: '/admin/cme-register', label: 'Sổ cấp chứng nhận', perm: 'seminars:read', key: 'cmeRegister' },
		{ to: '/admin/cme-records', label: 'Ghi nhận độc lập', perm: 'cme_records:manage', key: 'cmeRecords' },
		{
			to: '/admin/cme-compliance',
			label: 'Theo dõi ngưỡng',
			perm: 'seminars:cme_manage',
			key: 'cmeCompliance',
		},
		{
			to: '/admin/cme-credit-categories',
			label: 'Quy đổi tín chỉ',
			perm: 'training_catalog:read',
			key: 'cmeCreditCatalog',
		},
	],
	accounts: [
		{ to: '/admin/users', label: 'Người dùng', perm: 'users:read', key: 'users' },
		{ to: '/admin/roles', label: 'Vai trò & quyền', perm: 'roles:read', key: 'roles' },
	],
	organization: [
		{ to: '/admin/departments', label: 'Khoa / Phòng ban', perm: 'departments:read', key: 'departments' },
		{ to: '/admin/venues', label: 'Địa điểm / Phòng họp', perm: 'venues:read', key: 'venues' },
	],
	workflows: [
		{ to: '/admin/workflows', label: 'Quy trình duyệt', perm: 'workflows:manage', key: 'workflows' },
		{ to: '/admin/form-configs', label: 'Cấu hình form', perm: 'form_configs:manage', key: 'formConfigs' },
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
/** Tab của mục có key riêng → công tắc ẩn/hiện là từng tab, key của mục chỉ là định danh. */
export const tabsAreSwitches = (key: string) => !!SECTION_TABS[key]?.[0]?.key;
/** Tab (có key) đang chứa trang này, kể cả trang con /:id. */
export const switchTabOf = (key: string, pathname: string) =>
	SECTION_TABS[key]?.find(
		(t) => t.key && (pathname === t.to || pathname.startsWith(`${t.to}/`)),
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

const navItem = (
	key: string,
	label: string,
	Icon: React.ComponentType<{ className?: string }>,
	perm?: PermissionKey,
): NavItem => ({ key, label, icon: <Icon className={styles.navIcon} />, perm });

// Nguyên tắc sắp xếp:
// - Mỗi mảng nghiệp vụ là 1 nhóm, các mục đi theo luồng công việc, danh
//   mục/cấu hình của mảng xếp cuối nhóm. Giữ ít nhóm, mỗi nhóm không quá 7 mục.
// - Trang cùng 1 việc gộp thành tab của 1 mục (SECTION_TABS) thay vì mỗi trang
//   1 mục menu: Đợt + Lịch trình, Đề tài + Phê duyệt, Hội đồng + Chuyên gia,
//   Bảng công + Máy chấm công, 4 trang tín chỉ CME, Người dùng + Vai trò…
// - 4 dashboard (chung / NCKH / Đào tạo / Hội nghị & CME) là 1 trang có tab
//   (DashboardTabs) nên chỉ có 1 mục menu; tab của module bị tắt tự ẩn.
// - Đào tạo chia theo loại: Đào tạo liên tục / Giấy phép hành nghề / Cầm tay chỉ
//   việc, mỗi loại 1 mục; ca, điểm danh và chấm công nằm chung nhóm Đào tạo.
// - Trang có tab riêng (Danh mục NCKH, Danh mục đào tạo) chỉ có 1 mục menu.
export const NAV_GROUPS: NavGroup[] = [
	{
		section: 'Tổng quan',
		items: [
			navItem('dashboard', 'Bảng điều khiển', DashboardSvg),
			navItem('myTasks', 'Việc của tôi', CheckCircleSvg),
			// Tab: Trình ký văn bản / Ký tài liệu (mỗi tab tắt riêng theo cấu hình Ký số).
			navItem('sign', 'Trình ký & ký tài liệu', SendSvg),
			navItem('reports', 'Báo cáo & xuất dữ liệu', DownloadSvg, 'reports:read'),
		],
	},
	{
		// Luồng: mở đợt (+ lịch trình) → đề tài nộp vào (+ phê duyệt) → hội đồng chấm.
		section: 'Nghiên cứu khoa học',
		items: [
			navItem('rounds', 'Đợt nghiên cứu', RoundSvg),
			navItem('topics', 'Đề tài & phê duyệt', TopicSvg),
			navItem('councils', 'Hội đồng & chuyên gia', ClipboardCheckSvg),
			// 1 trang 3 tab: Phân loại / Cấp độ / Loại đợt.
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
			// Ca, phân ca, điểm danh, đơn xin phép — mỗi việc 1 tab (theo quyền).
			navItem('staffAttendance', 'Ca & điểm danh', ClockSvg),
			navItem('attendanceTimesheet', 'Chấm công', FingerprintSvg),
			// Tiền học phí ngân hàng báo về — khoản chưa tự khớp chờ phòng Đào tạo xử lý
			navItem('tuitionBank', 'Đối soát ngân hàng', WalletSvg, 'courses:approve'),
		],
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
		// Tổ chức sự kiện → quét vé tại cửa hội trường → tín chỉ CME cấp từ đó
		// (tab: sổ cấp, ghi nhận ngoài, theo dõi ngưỡng, danh mục quy đổi).
		section: 'Hội nghị & tín chỉ CME',
		items: [
			navItem('seminars', 'Hội thảo & hội nghị', MonitorSvg, 'seminars:read'),
			navItem('hospitalTrainings', 'Tập huấn bệnh viện', UsersSvg, 'seminars:read'),
			// Trang riêng cho điện thoại (không có AdminLayout) nên không gộp tab được.
			navItem('ticketScan', 'Quét vé điểm danh', QrSvg, 'seminars:update'),
			navItem('cme', 'Tín chỉ CME', BadgeSvg),
		],
	},
	{
		// Việc dùng chung nhiều mảng: hồ sơ hành nghề của cán bộ, thông báo, khảo sát.
		section: 'Hành chính',
		items: [
			navItem(
				'staffLicenses',
				'Chứng chỉ hành nghề',
				ShieldSvg,
				'staff_licenses:read',
			),
			navItem('notifications', 'Thông báo', BellSvg, 'notifications:read'),
			navItem('surveys', 'Khảo sát', MessageSvg, 'surveys:manage'),
		],
	},
	{
		// Tài khoản → tổ chức → dữ liệu dùng chung → quy trình → cấu hình → giám sát.
		section: 'Quản trị hệ thống',
		items: [
			navItem('accounts', 'Tài khoản & phân quyền', RoleSvg),
			navItem('organization', 'Khoa phòng & địa điểm', DeptSvg),
			navItem('personMerge', 'Duyệt trùng danh tính', CopySvg, 'persons:read'),
			navItem('workflows', 'Quy trình & biểu mẫu', LinkSvg),
			navItem('signing', 'Ký số', EditSvg, 'signing:manage'),
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
	'Hội nghị & tín chỉ CME': 'seminar',
};
const MODULE_BY_KEY: Record<string, ModuleKey> = {
	surveys: 'survey',
	// Ca & điểm danh là phân hệ riêng; Chấm công (máy chấm công, bảng công) theo
	// phân hệ Đào tạo (điểm danh buổi học) của nhóm nên không cần ghi đè.
	staffAttendance: 'attendance',
	tuitionBank: 'tuition',
};
export const moduleOf = (section: string, key: string) =>
	MODULE_BY_KEY[key] ?? MODULE_BY_SECTION[section];

// Không cho tắt: Bảng điều khiển là trang mặc định của /admin, Cấu hình hệ thống
// là nơi bật lại menu — tắt là tự khóa mình.
const LOCKED = new Set(['dashboard', 'settings']);

/** Danh sách mục menu quản trị cho tab "Menu hiển thị" ở Cấu hình hệ thống.
 *  Mục gộp có tab mang key → mỗi tab 1 công tắc (giữ key của mục menu cũ). */
export const ADMIN_MENU: MenuCatalog = NAV_GROUPS.map((g) => ({
	section: g.section,
	items: g.items.flatMap((it) =>
		tabsAreSwitches(it.key)
			? SECTION_TABS[it.key].map((t) => ({
					key: t.key as string,
					label: `${it.label} › ${t.label}`,
					module: moduleOf(g.section, it.key),
				}))
			: [
					{
						key: it.key,
						label: it.label,
						module: moduleOf(g.section, it.key),
						locked: LOCKED.has(it.key),
					},
				],
	),
}));
