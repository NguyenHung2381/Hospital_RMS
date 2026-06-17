import styles from './AdminLayout.module.css';

import {
	ApproveSvg,
	BellSvg,
	ChevLSvg,
	DashboardSvg,
	DeptSvg,
	DocSvg,
	DownloadSvg,
	FileSvg,
	InfoSvg,
	ListSvg,
	LogoutSvg,
	MenuSvg,
	MoreVSvg,
	PlusSvg,
	ProgressSvg,
	RefreshSvg,
	RoleSvg,
	RoundSvg,
	SearchSvg,
	TopicSvg,
	UserSvg,
	UsersSvg,
	WarnSvg,
	XSvg,
} from '@/assets/icons';

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
	Menu: () => <MenuSvg />,
};
