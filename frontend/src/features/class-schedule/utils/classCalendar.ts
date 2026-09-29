import { COLOR_PRESETS } from '../../schedule/types/schedule.type';
import type { CalDay } from '../../schedule/types/calendarView.type';
import { addDays, buildMonthWeeks, buildWeekDays } from '../../schedule/utils/calendarViewHelpers';
import { parseDate } from '../../../shared/utils/formatDate';
import type {
	CalendarCourse,
	CalendarSession,
	CourseBar,
	CourseMonthSummary,
	SessionEvent,
} from '../types/classSchedule.type';

export interface ClassMonthData {
	month: number;
	weeks: CalDay[][];
	sessionsByDay: Map<string, SessionEvent[]>;
	courseSummary: CourseMonthSummary[];
	courseBars: CourseBar[];
}

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Màu cố định theo mã khoá học — cùng 1 khoá luôn cùng màu ở mọi chế độ xem. */
export function courseColor(courseId: string): string {
	let h = 0;
	for (let i = 0; i < courseId.length; i++) h = (h * 31 + courseId.charCodeAt(i)) >>> 0;
	return COLOR_PRESETS[h % COLOR_PRESETS.length];
}

export const sessionTitle = (s: CalendarSession) => s.subject_name || s.course_name;

export const sessionTime = (s: CalendarSession) =>
	s.start_time ? `${s.start_time}${s.end_time ? `–${s.end_time}` : ''}` : '';

function buildSessionsByDay(sessions: CalendarSession[]): Map<string, SessionEvent[]> {
	const byDay = new Map<string, SessionEvent[]>();
	sessions.forEach((session) => {
		const d = parseDate(session.session_date);
		if (!d) return;
		const k = dayKey(d);
		if (!byDay.has(k)) byDay.set(k, []);
		byDay.get(k)!.push({ session, color: courseColor(session.course_id) });
	});
	// API đã sắp theo ngày + giờ bắt đầu; buổi chưa có giờ xếp cuối ngày
	byDay.forEach((list) =>
		list.sort((a, b) => (a.session.start_time ?? '99').localeCompare(b.session.start_time ?? '99')),
	);
	return byDay;
}

function buildCourseBars(courses: CalendarCourse[], rangeStart: Date, rangeEnd: Date): CourseBar[] {
	const bars: CourseBar[] = [];
	courses.forEach((c) => {
		const s = parseDate(c.start_date);
		const e = parseDate(c.end_date);
		if (!s || !e || s > rangeEnd || e < rangeStart) return;
		bars.push({
			id:        `course-${c.id}`,
			label:     c.name,
			color:     courseColor(c.id),
			startDate: s,
			endDate:   e,
			course:    c,
		});
	});
	return bars;
}

function summarizeMonth(sessions: CalendarSession[], year: number, m: number): CourseMonthSummary[] {
	const byCourse = new Map<string, CourseMonthSummary>();
	sessions.forEach((s) => {
		const d = parseDate(s.session_date);
		if (!d || d.getFullYear() !== year || d.getMonth() !== m) return;
		const cur = byCourse.get(s.course_id);
		if (cur) cur.count++;
		else byCourse.set(s.course_id, {
			course: { id: s.course_id, name: s.course_name },
			count:  1,
			color:  courseColor(s.course_id),
		});
	});
	return [...byCourse.values()].sort((a, b) => b.count - a.count);
}

export function computeClassMonths(
	sessions: CalendarSession[],
	courses: CalendarCourse[],
	year: number,
	singleMonth: boolean,
): ClassMonthData[] {
	const sessionsByDay = buildSessionsByDay(sessions);
	return Array.from({ length: 12 }, (_, m) => ({
		month:         m,
		weeks:         buildMonthWeeks(year, m),
		sessionsByDay,
		courseSummary: singleMonth ? [] : summarizeMonth(sessions, year, m),
		// Thanh thời gian khoá học CHỈ hiển thị khi xem 1 tháng
		courseBars:    singleMonth
			? buildCourseBars(courses, new Date(year, m, 1), new Date(year, m + 1, 0, 23, 59, 59))
			: [],
	}));
}

export function computeClassWeek(
	sessions: CalendarSession[],
	courses: CalendarCourse[],
	weekStart: Date,
): ClassMonthData {
	const weekEnd = addDays(weekStart, 6);
	weekEnd.setHours(23, 59, 59);
	return {
		month:         addDays(weekStart, 3).getMonth(),
		weeks:         [buildWeekDays(weekStart)],
		sessionsByDay: buildSessionsByDay(sessions),
		courseSummary: [],
		courseBars:    buildCourseBars(courses, weekStart, weekEnd),
	};
}
