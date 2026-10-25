import type React from 'react';
import type { PermissionKey } from '@/shared/types/permissions.generated';
import { hasPermission } from '@/shared/utils/permissions';
import { useNavigate } from 'react-router-dom';
import {
	BadgeSvg,
	BarChartSvg,
	BookOpenSvg,
	CalendarSvg,
	ClipboardCheckSvg,
	DeptSvg,
	ShieldSvg,
	TopicSvg,
	UserCheckSvg,
	UsersSvg,
} from '@/assets/icons';
import type { LoginUser } from '@/features/auth/api/authApi';
import { getStoredUser } from '@/shared/utils/storage';
import styles from '../pages/Dashboard.module.css';

interface QuickLink {
	label: string;
	path: string;
	icon: React.ReactNode;
	perm?: PermissionKey;
}

const QUICK_LINKS: QuickLink[] = [
	{
		label: 'Đề tài nghiên cứu',
		path: '/admin/topics',
		icon: <TopicSvg />,
		perm: 'topics:read',
	},
	{
		label: 'Phê duyệt đề tài',
		path: '/admin/approvals',
		icon: <ClipboardCheckSvg />,
		perm: 'topics:approve',
	},
	{
		label: 'Hội đồng chấm đề cương',
		path: '/admin/councils',
		icon: <ShieldSvg />,
		perm: 'councils:read',
	},
	{
		label: 'Lịch trình đợt nghiên cứu',
		path: '/admin/schedule',
		icon: <CalendarSvg />,
		perm: 'rounds:read',
	},
	{
		label: 'Hội thảo & hội nghị',
		path: '/admin/seminars',
		icon: <BookOpenSvg />,
		perm: 'seminars:read',
	},
	{
		label: 'Theo dõi ngưỡng tín chỉ CME',
		path: '/admin/cme-compliance',
		icon: <BadgeSvg />,
		perm: 'seminars:cme_manage',
	},
	{
		label: 'Học viên',
		path: '/admin/trainees',
		icon: <UsersSvg />,
		perm: 'trainees:read',
	},
	{
		label: 'Giảng viên',
		path: '/admin/lecturers',
		icon: <UserCheckSvg />,
		perm: 'lecturers:read',
	},
	{
		label: 'Khoa / Phòng ban',
		path: '/admin/departments',
		icon: <DeptSvg />,
		perm: 'departments:read',
	},
	{
		label: 'Báo cáo & thống kê',
		path: '/admin/reports',
		icon: <BarChartSvg />,
		perm: 'reports:read',
	},
];

export function QuickAccess() {
	const navigate = useNavigate();
	const user = getStoredUser<LoginUser>();
	const links = QUICK_LINKS.filter((l) => hasPermission(user, l.perm));

	if (links.length === 0) return null;

	return (
		<div className={styles.quickAccessCard}>
			<div className={styles.cardHeader}>
				<span className={styles.cardTitle}>Truy cập nhanh các phân hệ</span>
			</div>
			<div className={styles.quickAccessGrid}>
				{links.map((l) => (
					<button
						key={l.path}
						type='button'
						className={styles.quickAccessTile}
						onClick={() => navigate(l.path)}
					>
						<span className={styles.quickAccessIcon}>{l.icon}</span>
						<span className={styles.quickAccessLabel}>{l.label}</span>
					</button>
				))}
			</div>
		</div>
	);
}
