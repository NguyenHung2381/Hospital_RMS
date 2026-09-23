import { NavLink } from 'react-router-dom';
import styles from '../pages/Dashboard.module.css';

const TABS = [
	{ to: '/admin', label: 'Tổng quan chung' },
	{ to: '/admin/dashboard/research', label: 'Nghiên cứu khoa học' },
	{ to: '/admin/dashboard/training', label: 'Đào tạo' },
];

// Thanh chuyển nhanh giữa 3 dashboard, đặt đầu mỗi trang dashboard.
export function DashboardTabs() {
	return (
		<nav
			className={styles.dashTabs}
			aria-label='Chọn bảng điều khiển'
		>
			{TABS.map((t) => (
				<NavLink
					key={t.to}
					to={t.to}
					end
					className={({ isActive }) =>
						`${styles.dashTab} ${isActive ? styles.dashTabActive : ''}`
					}
				>
					{t.label}
				</NavLink>
			))}
		</nav>
	);
}
