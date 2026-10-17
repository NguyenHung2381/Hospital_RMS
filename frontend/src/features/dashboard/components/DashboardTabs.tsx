import { NavLink } from 'react-router-dom';
import { useModules } from '../../../shared/hooks/useModules';
import { DASHBOARD_TABS } from '../constants/dashboardTabs';
import styles from '../pages/Dashboard.module.css';

// Thanh chuyển nhanh giữa 4 dashboard, đặt đầu mỗi trang dashboard.
export function DashboardTabs() {
	const modules = useModules();
	const tabs = DASHBOARD_TABS.filter((t) => !t.module || modules[t.module] !== false);
	if (tabs.length < 2) return null;
	return (
		<nav
			className={styles.dashTabs}
			aria-label='Chọn bảng điều khiển'
		>
			{tabs.map((t) => (
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
