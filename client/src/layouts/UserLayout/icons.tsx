import styles from './UserLayout.module.css';
import DashboardSvg from '../../assets/svg/dashboard.svg?react';
import TopicSvg from '../../assets/svg/topic.svg?react';
import DocPlusSvg from '../../assets/svg/doc-plus.svg?react';
import UserSvg from '../../assets/svg/user.svg?react';
import UsersSvg from '../../assets/svg/users.svg?react';
import BellSvg from '../../assets/svg/bell.svg?react';
import SearchSvg from '../../assets/svg/search.svg?react';
import XSvg from '../../assets/svg/x.svg?react';
import ChevLSvg from '../../assets/svg/chev-l.svg?react';
import MoreVSvg from '../../assets/svg/more-v.svg?react';
import LogoutSvg from '../../assets/svg/logout.svg?react';
import ClipboardCheckSvg from '../../assets/svg/clipboard-check.svg?react';
import InfoSvg from '../../assets/svg/info.svg?react';
import WarnSvg from '../../assets/svg/warn.svg?react';
import DocSvg from '../../assets/svg/doc.svg?react';

export const Icon = {
	Dashboard: () => <DashboardSvg className={styles.navIcon} />,
	Topic: () => <TopicSvg className={styles.navIcon} />,
	Register: () => <DocPlusSvg className={styles.navIcon} />,
	Profile: () => <UserSvg className={styles.navIcon} />,
	Users: () => <UsersSvg className={styles.navIcon} />,
	Bell: BellSvg,
	Search: SearchSvg,
	X: XSvg,
	ChevronL: ChevLSvg,
	MoreV: () => <MoreVSvg style={{ width: 14, height: 14 }} />,
	LogOut: LogoutSvg,
	IcCheck: ClipboardCheckSvg,
	IcInfo: InfoSvg,
	IcWarn: WarnSvg,
	IcDoc: DocSvg,
};
