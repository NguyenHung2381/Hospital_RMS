import type React from 'react';
import {
	BadgeSvg,
	BellSvg,
	BookOpenSvg,
	CalendarSvg,
	ClipboardSvg,
	ClockSvg,
	DashboardSvg,
	FileTextSvg,
	QrSvg,
	UserSvg,
} from '@/assets/icons';
import { TRAINEE_HOME } from '../../app/router/authHelpers';
import type { MenuCatalog } from '../../shared/hooks/useMenuConfig';

// Cấu hình menu cổng học viên — tách khỏi index.tsx để trang Cấu hình hệ thống
// (tab Menu hiển thị) dùng chung danh sách mục.

const base = TRAINEE_HOME;

export interface NavItem {
	/** Key lưu ở MENU_HIDDEN_TRAINEE khi quản trị tắt mục này. */
	key: string;
	to: string;
	label: string;
	/** Nhãn ngắn cho thanh điều hướng ngang / tab đáy (điện thoại) */
	short: string;
	icon: React.ReactNode;
	end?: boolean;
	module?: 'survey' | 'attendance';
}

// Thứ tự = luồng học: xem tổng quan → vào khóa học → theo lịch → xem kết quả.
export const NAV: NavItem[] = [
	{ key: 'overview', to: base, label: 'Tổng quan', short: 'Tổng quan', icon: <DashboardSvg />, end: true },
	{ key: 'courses', to: `${base}/khoa-hoc`, label: 'Khóa học của tôi', short: 'Khóa học', icon: <BookOpenSvg /> },
	{ key: 'schedule', to: `${base}/lich-hoc`, label: 'Lịch học & điểm danh', short: 'Lịch học', icon: <CalendarSvg /> },
	{ key: 'results', to: `${base}/ket-qua`, label: 'Kết quả & chứng chỉ', short: 'Kết quả', icon: <BadgeSvg /> },
	{ key: 'checkIn', to: `${base}/diem-danh`, label: 'Điểm danh QR', short: 'Quét QR', icon: <QrSvg /> },
	// Điểm danh vào/ra theo ca + đơn xin nghỉ / đi muộn trong thời gian khóa học (module Điểm danh, mặc định tắt)
	{ key: 'attendance', to: `${base}/diem-danh-ca`, label: 'Điểm danh & xin phép', short: 'Điểm danh ca', icon: <ClockSvg />, module: 'attendance' },
	{ key: 'documents', to: `${base}/giay-to`, label: 'Giấy tờ hồ sơ', short: 'Giấy tờ', icon: <FileTextSvg /> },
	{ key: 'surveys', to: `${base}/khao-sat`, label: 'Khảo sát', short: 'Khảo sát', icon: <ClipboardSvg />, module: 'survey' },
];

export const ACCOUNT_NAV: NavItem[] = [
	{ key: 'notifications', to: `${base}/thong-bao`, label: 'Thông báo', short: 'Thông báo', icon: <BellSvg /> },
	{ key: 'profile', to: `${base}/ho-so`, label: 'Hồ sơ cá nhân', short: 'Hồ sơ', icon: <UserSvg /> },
];

// Thanh tab đáy trên điện thoại: 5 mục hay dùng nhất, Điểm danh QR ở giữa nổi bật.
// Mục bị tắt thì rơi khỏi thanh (còn 4 tab…).
export const BOTTOM_TABS = ['overview', 'courses', 'checkIn', 'schedule', 'results'];

/**
 * Danh sách mục menu cổng học viên cho tab "Menu hiển thị" ở Cấu hình hệ thống.
 * Menu tài khoản luôn hiện; Tổng quan là trang mặc định nên không cho tắt.
 */
export const TRAINEE_MENU: MenuCatalog = [
	{
		section: 'Menu học viên',
		items: NAV.map((it) => ({
			key: it.key,
			label: it.label,
			module: it.module,
			locked: it.key === 'overview',
		})),
	},
];
