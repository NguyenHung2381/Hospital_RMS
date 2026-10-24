import {
	BadgeSvg,
	BellSvg,
	BookOpenSvg,
	ClipboardCheckSvg,
	ClipboardSvg,
	DashboardSvg,
	DocPlusSvg,
	ProgressSvg,
	QrSvg,
	TopicSvg,
	UserSvg,
	UserCheckSvg,
	UsersSvg,
} from '@/assets/icons';
import type React from 'react';
import type { MenuCatalog } from '../../shared/hooks/useMenuConfig';
import type { ModuleKey } from '../../shared/hooks/useModules';
import styles from './UserLayout.module.css';

// Cấu hình menu cổng nhân viên — tách khỏi index.tsx để trang Cấu hình hệ thống
// (tab Menu hiển thị) dùng chung danh sách mục.
// ─── ROUTE MAP ────────────────────────────
export const KEY_TO_PATH: Record<string, string> = {
	home: '/user',
	myTopics: '/user/my-topics',
	registerTopic: '/user/register-topic',
	councilProgress: '/user/council-progress',
	surveys: '/user/khao-sat',
	myTasks: '/user/viec-cua-toi',
	attendanceCheckIn: '/user/diem-danh',
	myTraining: '/user/khoa-hoc',
	myCme: '/user/cme',
	myMentoring: '/user/huong-dan',
	profile: '/user/profile',
	deptAccounts: '/user/department-accounts',
	notifications: '/user/notifications',
};

export const PATH_TO_KEY: Record<string, string> = Object.fromEntries(
	Object.entries(KEY_TO_PATH).map(([k, v]) => [v, k]),
);

// ─── NAV CONFIG ───────────────────────────
export interface NavItem {
	key: string;
	label: string;
	icon: React.ReactNode;
	restrictMember?: boolean;
	managerOnly?: boolean;
	/** Chỉ hiện khi user đang giữ ghế trong ít nhất một hội đồng. */
	councilOnly?: boolean;
	/** Chỉ hiện khi user là người hướng dẫn của ít nhất một vòng thực hành GPHN. */
	mentorOnly?: boolean;
	/** Chỉ hiện khi đang trong thời gian "Đăng ký đề tài" của một đợt đang mở. */
	needsRegistrationWindow?: boolean;
	/** Ẩn khi module bị tắt ở Cấu hình hệ thống. */
	module?: ModuleKey;
}

interface NavGroup {
	/** Không có tiêu đề = nhóm việc hằng ngày ở đầu sidebar. */
	title?: string;
	items: NavItem[];
}

// Sidebar dọc NỀN XANH (khác AdminLayout nền tối), chia nhóm theo mảng nghiệp vụ:
// việc hằng ngày (trang chủ, việc cần làm, điểm danh QR dùng cho cả
// lớp học lẫn hội nghị, khảo sát) → NCKH → Đào tạo → Quản lý khoa. Mục "tài
// khoản" gom vào menu avatar. Mục thuộc module nào thì ẩn khi module đó bị tắt;
// nhóm không còn mục nào thì ẩn luôn tiêu đề.
export const NAV_GROUPS: NavGroup[] = [
	{
		items: [
			{ key: 'home', label: 'Trang chủ', icon: <DashboardSvg className={styles.navIcon} /> },
			{ key: 'myTasks', label: 'Việc của tôi', icon: <ClipboardCheckSvg className={styles.navIcon} /> },
			// Điểm danh chỉ dành cho học viên (cổng học viên /hoc-vien/diem-danh-ca), không áp dụng cho nhân viên
			{ key: 'attendanceCheckIn', label: 'Điểm danh QR', icon: <QrSvg className={styles.navIcon} /> },
			{ key: 'surveys', label: 'Khảo sát', icon: <ClipboardSvg className={styles.navIcon} />, module: 'survey' },
		],
	},
	{
		title: 'Nghiên cứu khoa học',
		items: [
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
		],
	},
	{
		title: 'Đào tạo',
		items: [
			{ key: 'myTraining', label: 'Khóa học của tôi', icon: <BookOpenSvg className={styles.navIcon} />, module: 'training' },
			{ key: 'myCme', label: 'Tín chỉ CME của tôi', icon: <BadgeSvg className={styles.navIcon} />, module: 'seminar' },
			{
				key: 'myMentoring',
				label: 'Hướng dẫn thực hành',
				icon: <UserCheckSvg className={styles.navIcon} />,
				mentorOnly: true,
				module: 'training',
			},
		],
	},
	{
		title: 'Quản lý khoa',
		items: [
			{
				key: 'deptAccounts',
				label: 'Tài khoản trong khoa',
				icon: <UsersSvg className={styles.navIcon} />,
				managerOnly: true,
			},
		],
	},
];

export const ACCOUNT_NAV: NavItem[] = [
	{ key: 'profile', label: 'Hồ sơ cá nhân', icon: <UserSvg className={styles.navIcon} /> },
	{ key: 'notifications', label: 'Thông báo', icon: <BellSvg className={styles.navIcon} /> },
];

export const ALL_NAV: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), ...ACCOUNT_NAV];

/**
 * Danh sách mục sidebar cổng nhân viên cho tab "Menu hiển thị" ở Cấu hình hệ thống.
 * Menu tài khoản (hồ sơ, thông báo) luôn hiện nên không có ở đây; Trang chủ là
 * trang mặc định của /user nên không cho tắt.
 */
export const USER_MENU: MenuCatalog = NAV_GROUPS.map((g) => ({
	section: g.title ?? 'Việc hằng ngày',
	items: g.items.map((it) => ({
		key: it.key,
		label: it.label,
		module: it.module,
		locked: it.key === 'home',
	})),
}));
