import { apiClient } from '../../../shared/api/axios';
import type { ClassCalendarResponse } from '../types/classSchedule.type';

/** Mọi buổi học trong khoảng [from, to] (YYYY-MM-DD) + các khoá có thời gian học giao khoảng đó. */
export const getClassCalendar = (from: string, to: string) =>
	apiClient.get<ClassCalendarResponse>(
		`/courses/sessions/calendar?${new URLSearchParams({ from, to }).toString()}`,
	);
