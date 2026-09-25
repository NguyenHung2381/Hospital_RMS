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
	draft: { label: 'Bản thảo', tone: 'gray' },
	submitted: { label: 'Chờ thẩm định', tone: 'amber' },
	approved: { label: 'Đã phê duyệt', tone: 'green' },
	rejected: { label: 'Không thông qua', tone: 'red' },
	supplement: { label: 'Yêu cầu bổ sung', tone: 'blue' },
	completed: { label: 'Đã nghiệm thu', tone: 'pink' },
	cancelled: { label: 'Đã hủy', tone: 'gray' },
};

export const STATUS_COLORS: Record<string, string> = {
	draft: '#9CA3AF',
	submitted: '#EF9F27',
	approved: '#0A9B4A',
	rejected: '#E24B4A',
	supplement: '#378ADD',
	completed: '#DF0984',
	cancelled: '#9CA3AF',
};

export const CHART_COLORS = [
	'#0A9B4A',
	'#378ADD',
	'#EF9F27',
	'#DF0984',
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
	pending: { label: 'Chờ thẩm định', tone: 'amber' },
	approved: { label: 'Đã thông qua', tone: 'green' },
	rejected: { label: 'Không thông qua', tone: 'red' },
	supplement: { label: 'Yêu cầu bổ sung', tone: 'blue' },
};

export const TABS: { key: TabKey; label: string }[] = [
	{ key: 'all', label: 'Tất cả đề tài' },
	{ key: 'submitted', label: 'Chờ thẩm định' },
	{ key: 'approved', label: 'Đã phê duyệt' },
	{ key: 'supplement', label: 'Yêu cầu bổ sung' },
	{ key: 'rejected', label: 'Không thông qua' },
];

export const ROWS_PER_PAGE = 20;
// Số dòng hiển thị trong khung cuộn của bảng/danh sách trên dashboard trước khi cần scroll.
export const VISIBLE_ROWS = 10;
