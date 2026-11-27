import type { BadgeTone } from '@/shared/components/Badge/badgeTone';

export { formatDateVN as formatDate } from '../../../shared/utils/formatDate';

export const STATUS_CONFIG: Record<string, { label: string; tone: BadgeTone }> = {
	draft: { label: 'Bản nháp', tone: 'gray' },
	submitted: { label: 'Chờ thẩm định', tone: 'amber' },
	approved: { label: 'Đã phê duyệt', tone: 'green' },
	rejected: { label: 'Không thông qua', tone: 'red' },
	supplement: { label: 'Yêu cầu bổ sung', tone: 'blue' },
	completed: { label: 'Đã nghiệm thu', tone: 'teal' },
	cancelled: { label: 'Đã hủy', tone: 'gray' },
};

export const STATUS_COLORS: Record<string, string> = {
	draft: '#9CA3AF',
	submitted: '#EF9F27',
	approved: '#0A9B4A',
	rejected: '#E24B4A',
	supplement: '#378ADD',
	completed: '#0B7285', // teal — giao diện không dùng tím; hồng dành cho "đang chờ bạn"
	cancelled: '#9CA3AF',
};

export const CHART_COLORS = [
	'#0A9B4A',
	'#378ADD',
	'#EF9F27',
	'#0B7285',
	'#64748B',
	'#06B6D4',
	'#F97316',
	'#84CC16',
	'#A16207',
	'#1E3A8A',
];

export const APPROVAL_CONFIG: Record<string, { label: string; tone: BadgeTone }> = {
	pending: { label: 'Chờ thẩm định', tone: 'amber' },
	approved: { label: 'Đã thông qua', tone: 'green' },
	rejected: { label: 'Không thông qua', tone: 'red' },
	supplement: { label: 'Yêu cầu bổ sung', tone: 'blue' },
};
