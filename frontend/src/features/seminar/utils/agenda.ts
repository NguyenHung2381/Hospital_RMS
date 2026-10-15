import type { SeminarAgendaItem } from '../types/seminar.type';

/** seminars.agenda (JSON) → danh sách bài học; hỏng / trống → [] */
export const parseAgenda = (json: string | null): SeminarAgendaItem[] => {
	try {
		const list = JSON.parse(json || '[]');
		return Array.isArray(list) ? list : [];
	} catch {
		return [];
	}
};
