import type { BadgeTone } from '@/shared/components/Badge/badgeTone';

export { formatDateVN as formatDate } from '../../../shared/utils/formatDate';

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

export const STATUS_CONFIG: Record<string, { label: string; tone: BadgeTone }> = {
	draft: { label: 'Nháp', tone: 'gray' },
	submitted: { label: 'Chờ duyệt', tone: 'amber' },
	approved: { label: 'Đã phê duyệt', tone: 'green' },
	rejected: { label: 'Từ chối', tone: 'red' },
	supplement: { label: 'Bổ sung', tone: 'blue' },
	completed: { label: 'Hoàn thành', tone: 'pink' },
	cancelled: { label: 'Đã hủy', tone: 'gray' },
};

export const STATUS_COLORS: Record<string, string> = {
	draft: '#9CA3AF',
	submitted: '#EF9F27',
	approved: '#2EB87A',
	rejected: '#E24B4A',
	supplement: '#378ADD',
	completed: '#E8457A',
	cancelled: '#9CA3AF',
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

export const APPROVAL_CONFIG: Record<string, { label: string; tone: BadgeTone }> = {
	pending: { label: 'Chờ duyệt', tone: 'amber' },
	approved: { label: 'Đã duyệt', tone: 'green' },
	rejected: { label: 'Từ chối', tone: 'red' },
};

export const TABS: { key: TabKey; label: string }[] = [
	{ key: 'all', label: 'Tất cả' },
	{ key: 'submitted', label: 'Chờ duyệt' },
	{ key: 'approved', label: 'Đã phê duyệt' },
	{ key: 'rejected', label: 'Từ chối' },
	{ key: 'supplement', label: 'Bổ sung' },
];

export const ROWS_PER_PAGE = 8;
