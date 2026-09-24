import { STATUS_CFG as BASE_STATUS_CFG } from '../../topics/utils/topicHelpers';
import { scopeOf, type PermissionUser } from '@/shared/utils/permissions';
import type { TopicFile, TopicStatus } from '../../topics/types/topic.type';
import type { BadgeTone } from '@/shared/components/Badge/badgeTone';

export type FilterTab = TopicStatus;
export type CategoryTab = 'department' | 'mine';

// `label` + `tone` kế thừa từ BASE_STATUS_CFG (topics); bổ sung màu hex cho
// chấm/nền dùng riêng ở màn "Đề tài của tôi".
export const STATUS_CFG = {
	submitted: {
		...BASE_STATUS_CFG.submitted,
		dot: '#f59e0b',
		bg: '#fef3c7',
		color: '#92400e',
	},
	approved: {
		...BASE_STATUS_CFG.approved,
		dot: '#22c55e',
		bg: '#dcfce7',
		color: '#166534',
	},
	rejected: {
		...BASE_STATUS_CFG.rejected,
		dot: '#ef4444',
		bg: '#fee2e2',
		color: '#991b1b',
	},
	supplement: {
		...BASE_STATUS_CFG.supplement,
		dot: '#8b5cf6',
		bg: '#ede9fe',
		color: '#5b21b6',
		label: 'Cần bổ sung',
	},
	cancelled: {
		...BASE_STATUS_CFG.cancelled,
		dot: '#9ca3af',
		bg: '#f3f4f6',
		color: '#374151',
	},
} satisfies Record<
	TopicStatus,
	{
		label: string;
		dot: string;
		bg: string;
		color: string;
		tone: BadgeTone;
	}
>;

export const APV_STATUS_CFG: Record<
	string,
	{ label: string; tone: BadgeTone }
> = {
	pending: { label: 'Nộp hồ sơ', tone: 'amber' },
	approved: { label: 'Phê duyệt', tone: 'green' },
	rejected: { label: 'Từ chối', tone: 'red' },
	info_requested: { label: 'Yêu cầu bổ sung', tone: 'blue' },
};

export const TABS: { key: FilterTab; label: string }[] = [
	{ key: 'submitted', label: 'Chờ duyệt' },
	{ key: 'supplement', label: 'Cần bổ sung' },
	{ key: 'approved', label: 'Đã duyệt' },
	{ key: 'rejected', label: 'Từ chối' },
];

// Được xem đề tài trong phạm vi khoa / toàn hệ thống (không chỉ đề tài mình tham gia).
export function canSeeDeptTopics(user: PermissionUser | null | undefined): boolean {
	const scope = scopeOf(user, 'topics');
	return scope === 'department' || scope === 'all';
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
