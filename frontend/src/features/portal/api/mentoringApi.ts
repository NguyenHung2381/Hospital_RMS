import { apiClient } from '../../../shared/api/axios';
import type { PracticeResultRow, RotationResult } from '../../course/types/course.type';

// Cổng người hướng dẫn thực hành GPHN — backend modules/portal/mentoring.routes.js.
// Quyền theo enrollment_rotations.mentor_user_id = chính mình.

/** current: đang diễn ra · awaiting: đã kết thúc chưa đánh giá · upcoming: sắp bắt đầu · done: đã đánh giá */
export type MentorPhase = 'current' | 'awaiting' | 'upcoming' | 'done';

export interface MentorRotation extends PracticeResultRow {
	phase: MentorPhase;
}

export const mentoringApi = {
	list: () => apiClient.get<MentorRotation[]>('/me/mentoring'),
	count: () => apiClient.get<{ total: number; awaiting: number }>('/me/mentoring/count'),
	evaluate: (rotationId: string, result: RotationResult, comment: string | null) =>
		apiClient.put(`/me/mentoring/rotations/${rotationId}/result`, { result, comment }),
};
