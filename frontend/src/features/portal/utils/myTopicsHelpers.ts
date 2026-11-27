import { STATUS_CFG as BASE_STATUS_CFG } from '../../topics/utils/topicHelpers';
import { scopeOf, type PermissionUser } from '@/shared/utils/permissions';
import type { TopicStatus } from '../../topics/types/topic.type';
import type { BadgeTone } from '@/shared/components/Badge/badgeTone';

export type FilterTab = TopicStatus;
export type CategoryTab = 'department' | 'mine';

// `label` + `tone` kế thừa từ BASE_STATUS_CFG (topics); `dot` là màu chấm
// trạng thái trong danh sách "Đề tài của tôi" (token, không viết hex).
export const STATUS_CFG = {
	submitted: { ...BASE_STATUS_CFG.submitted, dot: 'var(--color-warning)' },
	approved: { ...BASE_STATUS_CFG.approved, dot: 'var(--color-primary)' },
	rejected: { ...BASE_STATUS_CFG.rejected, dot: 'var(--color-error)' },
	supplement: { ...BASE_STATUS_CFG.supplement, dot: 'var(--tone-blue-solid)', label: 'Cần bổ sung' },
	cancelled: { ...BASE_STATUS_CFG.cancelled, dot: 'var(--color-gray-400)' },
} satisfies Record<TopicStatus, { label: string; dot: string; tone: BadgeTone }>;

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

