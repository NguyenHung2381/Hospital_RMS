import type { ComponentType, SVGProps } from 'react';
import { NavLink } from 'react-router-dom';
import { BadgeSvg, BookOpenSvg, DashboardSvg, TopicSvg } from '@/assets/icons';
import { useModules } from '../../../shared/hooks/useModules';
import { DASHBOARD_TABS } from '../constants/dashboardTabs';
import s from './DashKit.module.css';

const TAB_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
	'/admin': DashboardSvg,
	'/admin/dashboard/research': TopicSvg,
	'/admin/dashboard/training': BookOpenSvg,
	'/admin/dashboard/seminar': BadgeSvg,
};

// Thanh chuyển nhanh giữa 4 dashboard, đặt đầu mỗi trang dashboard.
export function DashboardTabs() {
	const modules = useModules();
	const tabs = DASHBOARD_TABS.filter((t) => !t.module || modules[t.module] !== false);
	if (tabs.length < 2) return null;
	return (
		<nav
			className={s.tabs}
			aria-label='Chọn bảng điều khiển'
		>
			{tabs.map((t) => {
				const Icon = TAB_ICONS[t.to];
				return (
					<NavLink
						key={t.to}
						to={t.to}
						end
						className={({ isActive }) => `${s.tab} ${isActive ? s.tabActive : ''}`}
					>
						{Icon && <Icon aria-hidden />}
						{t.label}
					</NavLink>
				);
			})}
		</nav>
	);
}
