import styles from './AdminLayout.module.css';

import ApproveSvg from '../../assets/svg/approve.svg?react';
import BellSvg from '../../assets/svg/bell.svg?react';
import ChevLSvg from '../../assets/svg/chev-l.svg?react';
import DashboardSvg from '../../assets/svg/dashboard.svg?react';
import DeptSvg from '../../assets/svg/dept.svg?react';
import DocSvg from '../../assets/svg/doc.svg?react';
import DownloadSvg from '../../assets/svg/download.svg?react';
import FileSvg from '../../assets/svg/file.svg?react';
import InfoSvg from '../../assets/svg/info.svg?react';
import ListSvg from '../../assets/svg/list.svg?react';
import LogoutSvg from '../../assets/svg/logout.svg?react';
import MoreVSvg from '../../assets/svg/more-v.svg?react';
import PlusSvg from '../../assets/svg/plus.svg?react';
import ProgressSvg from '../../assets/svg/progress.svg?react';
import RefreshSvg from '../../assets/svg/refresh.svg?react';
import RoleSvg from '../../assets/svg/role.svg?react';
import RoundSvg from '../../assets/svg/round.svg?react';
import SearchSvg from '../../assets/svg/search.svg?react';
import TopicSvg from '../../assets/svg/topic.svg?react';
import UserSvg from '../../assets/svg/user.svg?react';
import UsersSvg from '../../assets/svg/users.svg?react';
import WarnSvg from '../../assets/svg/warn.svg?react';
import XSvg from '../../assets/svg/x.svg?react';

const nav = { className: styles.navIcon };
const sm14: React.SVGProps<SVGSVGElement> = {
	style: { width: 14, height: 14 },
};
const sm15: React.SVGProps<SVGSVGElement> = {
	style: { width: 15, height: 15 },
};

export const Icon = {
	// ─── Nav icons ────────────────────────────
	Dashboard: () => <DashboardSvg {...nav} />,
	Topic: () => <TopicSvg {...nav} />,
	Round: () => <RoundSvg {...nav} />,
	Approval: () => <ApproveSvg {...nav} />,
	Members: () => <UsersSvg {...nav} />,
	File: () => <FileSvg {...nav} />,
	Progress: () => <ProgressSvg {...nav} />,
	Dept: () => <DeptSvg {...nav} />,
	User: () => <UserSvg {...nav} />,
	Role: () => <RoleSvg {...nav} />,
	List: () => <ListSvg {...nav} />,
	Report: () => <DownloadSvg {...nav} />,
	// ─── UI icons ─────────────────────────────
	Bell: () => <BellSvg />,
	Search: () => <SearchSvg />,
	X: () => <XSvg />,
	ChevronL: () => <ChevLSvg />,
	MoreV: () => <MoreVSvg {...sm14} />,
	Plus: () => <PlusSvg {...sm15} />,
	Download: () => <DownloadSvg {...sm15} />,
	Refresh: () => <RefreshSvg {...sm15} />,
	// ─── Notification icons ───────────────────
	IcCheck: () => <ApproveSvg />,
	IcInfo: () => <InfoSvg />,
	IcWarn: () => <WarnSvg />,
	IcDoc: () => <DocSvg />,
	LogOut: () => <LogoutSvg />,
};
