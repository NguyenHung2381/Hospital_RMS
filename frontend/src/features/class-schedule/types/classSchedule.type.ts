import type { ClassSession } from '../../course/types/course.type';

/** Buổi học trên lịch toàn hệ thống — kèm tên khoá học để hiển thị. */
export interface CalendarSession extends ClassSession {
	course_name: string;
	/** Lịch riêng của 1 học viên: điểm danh buổi đó (null = chưa điểm danh). */
	attendance_status?: 'present' | 'absent' | 'late' | null;
}

/** Khoá học có thời gian học giao khoảng đang xem (vẽ thanh thời gian khoá). */
export interface CalendarCourse {
	id: string;
	name: string;
	start_date: string;
	end_date: string;
	status: string;
}

export interface ClassCalendarResponse {
	sessions: CalendarSession[];
	courses: CalendarCourse[];
}

export interface SessionEvent {
	session: CalendarSession;
	color: string;
}

export interface CourseMonthSummary {
	course: { id: string; name: string };
	count: number;
	color: string;
}
