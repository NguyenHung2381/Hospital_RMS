import { STATUS_CFG as BASE_STATUS_CFG } from '../../topics/utils/topicHelpers';
import type { TopicFile, TopicStatus } from '../../topics/types/topic.type';

export type FilterTab = TopicStatus;
export type CategoryTab = 'department' | 'mine';

export const STATUS_CFG = {
	submitted: {
		...BASE_STATUS_CFG.submitted,
		dot: '#f59e0b',
		bg: '#fef3c7',
		color: '#92400e',
		badgeCls: 'badgeAmber',
	},
	approved: {
		...BASE_STATUS_CFG.approved,
		dot: '#22c55e',
		bg: '#dcfce7',
		color: '#166534',
		badgeCls: 'badgeGreen',
	},
	rejected: {
		...BASE_STATUS_CFG.rejected,
		dot: '#ef4444',
		bg: '#fee2e2',
		color: '#991b1b',
		badgeCls: 'badgeRed',
	},
	supplement: {
		...BASE_STATUS_CFG.supplement,
		dot: '#8b5cf6',
		bg: '#ede9fe',
		color: '#5b21b6',
		badgeCls: 'badgeBlue',
		label: 'Cần bổ sung',
	},
} satisfies Record<
	TopicStatus,
	{
		label: string;
		cls: string;
		dot: string;
		bg: string;
		color: string;
		badgeCls: string;
	}
>;

export const APV_STATUS_CFG: Record<
	string,
	{ label: string; badgeCls: string }
> = {
	pending: { label: 'Nộp hồ sơ', badgeCls: 'badgeAmber' },
	approved: { label: 'Phê duyệt', badgeCls: 'badgeGreen' },
	rejected: { label: 'Từ chối', badgeCls: 'badgeRed' },
	info_requested: { label: 'Yêu cầu bổ sung', badgeCls: 'badgeBlue' },
};

export const TABS: { key: FilterTab; label: string }[] = [
	{ key: 'submitted', label: 'Chờ duyệt' },
	{ key: 'supplement', label: 'Cần bổ sung' },
	{ key: 'approved', label: 'Đã duyệt' },
	{ key: 'rejected', label: 'Từ chối' },
];

export function isDeptAccount(accountType: string): boolean {
	return (
		accountType === 'manager' ||
		accountType === 'admin' ||
		accountType === 'dept'
	);
}


export function getFileViewerUrl(file: TopicFile): string | null {
	const name = file.file_name.toLowerCase();
	const mime = file.mime_type ?? '';
	if (mime === 'application/pdf' || name.endsWith('.pdf')) return file.file_url;
	if (
		mime.includes('wordprocessingml') ||
		name.endsWith('.docx') ||
		name.endsWith('.doc')
	)
		return file.file_url;
	return null;
}

export function getFileTypeMeta(file: TopicFile): {
	label: string;
	cls: string;
} {
	const name = file.file_name.toLowerCase();
	const mime = file.mime_type ?? '';
	if (mime === 'application/pdf' || name.endsWith('.pdf'))
		return { label: 'PDF', cls: 'fileIconPdf' };
	if (
		mime.includes('wordprocessingml') ||
		name.endsWith('.docx') ||
		name.endsWith('.doc')
	)
		return { label: 'DOCX', cls: 'fileIconWord' };
	if (
		mime.includes('spreadsheetml') ||
		name.endsWith('.xlsx') ||
		name.endsWith('.xls')
	)
		return { label: 'XLSX', cls: 'fileIconExcel' };
	if (mime.startsWith('image/')) return { label: 'IMG', cls: 'fileIconImage' };
	return { label: 'FILE', cls: 'fileIconOther' };
}
