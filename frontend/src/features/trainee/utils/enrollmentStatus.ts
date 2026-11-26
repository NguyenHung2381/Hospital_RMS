import type { BadgeTone } from '@/shared/components/Badge/badgeTone';
import { ENROLLMENT_STATUS_TONE } from '../../course/api/registrationApi';
import { ENROLLMENT_STATUS_CFG, PROGRESS_LABEL, type ProgressStatus } from '../../course/types/course.type';
import type { Trainee } from '../types/trainee.type';

const PROGRESS_TONE: Record<ProgressStatus, BadgeTone> = {
	in_progress: 'blue',
	completed: 'green',
	dropped: 'gray',
};

/**
 * Trạng thái của lượt ghi danh khớp bộ lọc: chưa duyệt thì hiện trạng thái ghi danh
 * (Chờ duyệt / Danh sách chờ), đã duyệt thì hiện tiến độ (Đang học / Đã hoàn thành / Nghỉ học).
 */
export function enrollmentStatusOf(t: Trainee): { label: string; tone: BadgeTone } | null {
	const s = t.enrollment_status;
	if (!s) return null;
	if (s !== 'approved') return { label: ENROLLMENT_STATUS_CFG[s].label, tone: ENROLLMENT_STATUS_TONE[s] };
	const p = t.enrollment_progress_status ?? 'in_progress';
	return { label: PROGRESS_LABEL[p], tone: PROGRESS_TONE[p] };
}

export const ENROLLMENT_FILTER_OPTIONS = [
	{ value: 'pending', label: ENROLLMENT_STATUS_CFG.pending.label },
	{ value: 'approved', label: ENROLLMENT_STATUS_CFG.approved.label },
	{ value: 'waitlisted', label: ENROLLMENT_STATUS_CFG.waitlisted.label },
];

export const PROGRESS_FILTER_OPTIONS = (Object.keys(PROGRESS_LABEL) as ProgressStatus[]).map((p) => ({
	value: p,
	label: PROGRESS_LABEL[p],
}));
