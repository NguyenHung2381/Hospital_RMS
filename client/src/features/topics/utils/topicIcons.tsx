import DocSvg from '../../../assets/svg/doc.svg?react';
import PlusSvg from '../../../assets/svg/plus.svg?react';
import CheckSvg from '../../../assets/svg/check.svg?react';
import EditSvg from '../../../assets/svg/edit.svg?react';
import TrashSvg from '../../../assets/svg/trash.svg?react';
import EyeSvg from '../../../assets/svg/eye.svg?react';
import SearchSvg from '../../../assets/svg/search.svg?react';
import XSvg from '../../../assets/svg/x.svg?react';
import ChevLSvg from '../../../assets/svg/chev-l.svg?react';
import ChevRSvg from '../../../assets/svg/chev-r.svg?react';
import UsersSvg from '../../../assets/svg/users.svg?react';
import ProgressSvg from '../../../assets/svg/progress.svg?react';
import ApproveSvg from '../../../assets/svg/approve.svg?react';
import InfoSvg from '../../../assets/svg/info.svg?react';
import WarnSvg from '../../../assets/svg/warn.svg?react';
import AlertSvg from '../../../assets/svg/alert.svg?react';
import DotSvg from '../../../assets/svg/dot.svg?react';
import DownloadSvg from '../../../assets/svg/download.svg?react';

export const Ic = {
	Doc: () => <DocSvg />,
	Plus: () => <PlusSvg style={{ width: 14, height: 14 }} />,
	Check: () => <CheckSvg />,
	Edit: () => <EditSvg />,
	Trash: () => <TrashSvg />,
	Eye: () => <EyeSvg />,
	Search: () => <SearchSvg />,
	X: () => <XSvg />,
	ChevL: () => <ChevLSvg style={{ width: 13, height: 13 }} />,
	ChevR: () => <ChevRSvg style={{ width: 13, height: 13 }} />,
	Users: () => <UsersSvg />,
	Progress: () => <ProgressSvg />,
	Approve: () => <ApproveSvg />,
	Info: () => <InfoSvg style={{ width: 14, height: 14, flexShrink: 0 }} />,
	Warn: () => <WarnSvg />,
	Alert: () => <AlertSvg style={{ width: 12, height: 12 }} />,
	Dot: () => <DotSvg style={{ width: 12, height: 12 }} />,
	Download: () => <DownloadSvg style={{ width: 14, height: 14 }} />,
};
