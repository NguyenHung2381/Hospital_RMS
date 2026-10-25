import { apiClient } from '../../../shared/api/axios';
import type { ClassCalendarResponse } from '../types/classSchedule.type';

/** Mọi buổi học trong khoảng [from, to] (YYYY-MM-DD) + các khóa có thời gian học giao khoảng đó; trainingTypeId lọc theo loại khóa. */
export const getClassCalendar = (from: string, to: string, trainingTypeId?: string) =>
	apiClient.get<ClassCalendarResponse>(
		`/courses/sessions/calendar?${new URLSearchParams({
			from,
			to,
			...(trainingTypeId ? { training_type_id: trainingTypeId } : {}),
		}).toString()}`,
	);
