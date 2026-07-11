export type RealStatus =
	| 'draft'
	| 'submitted'
	| 'approved'
	| 'rejected'
	| 'supplement'
	| 'completed';
export type TabKey = 'all' | RealStatus;

export interface TopicRow {
	id: string;
	title: string;
	status: string;
	created_at: string;
	created_by: string;
	created_by_name: string | null;
	category_name: string | null;
	level_name: string | null;
	department_name: string | null;
	member_count: number;
	progress: number;
}

export const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
	draft: { label: 'Nháp', cls: 'badgeGray' },
	submitted: { label: 'Chờ duyệt', cls: 'badgeAmber' },
	approved: { label: 'Đã phê duyệt', cls: 'badgeGreen' },
	rejected: { label: 'Từ chối', cls: 'badgeRed' },
	supplement: { label: 'Bổ sung', cls: 'badgeBlue' },
	completed: { label: 'Hoàn thành', cls: 'badgePink' },
};

export const STATUS_COLORS: Record<string, string> = {
	draft: '#9CA3AF',
	submitted: '#EF9F27',
	approved: '#2EB87A',
	rejected: '#E24B4A',
	supplement: '#378ADD',
	completed: '#E8457A',
};

export const CHART_COLORS = [
	'#2EB87A',
	'#378ADD',
	'#EF9F27',
	'#E8457A',
	'#7C3AED',
	'#06B6D4',
	'#F97316',
	'#84CC16',
	'#EC4899',
	'#6366F1',
];
export const DEPT_COLORS = CHART_COLORS;
export const CATEGORY_COLORS = CHART_COLORS;

export const APPROVAL_CONFIG: Record<string, { label: string; cls: string }> = {
	pending: { label: 'Chờ duyệt', cls: 'badgeAmber' },
	approved: { label: 'Đã duyệt', cls: 'badgeGreen' },
	rejected: { label: 'Từ chối', cls: 'badgeRed' },
};

export const TABS: { key: TabKey; label: string }[] = [
	{ key: 'all', label: 'Tất cả' },
	{ key: 'submitted', label: 'Chờ duyệt' },
	{ key: 'approved', label: 'Đã phê duyệt' },
	{ key: 'rejected', label: 'Từ chối' },
	{ key: 'supplement', label: 'Bổ sung' },
];

export const ROWS_PER_PAGE = 8;

export function formatDate(iso: string): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (isNaN(d.getTime())) return '';
	return d.toLocaleDateString('vi-VN', {
		timeZone: 'Asia/Ho_Chi_Minh',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	});
}
