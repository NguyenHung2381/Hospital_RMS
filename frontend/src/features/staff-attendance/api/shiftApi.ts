import { apiClient } from '@/shared/api/axios';

/** 1 = Thứ 2 … 7 = Chủ nhật. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Ca làm. end_time <= start_time = qua đêm; bằng nhau = 24 giờ. */
export interface WorkShift {
	id: number;
	name: string;
	code: string;
	color: string | null;
	start_time: string;
	end_time: string;
	/** Được chấm vào sớm nhất trước giờ vào (phút). */
	checkin_before_min: number;
	/** Được chấm ra muộn nhất sau giờ ra (phút). */
	checkout_after_min: number;
	/** Du di đi muộn/về sớm (phút). */
	grace_min: number;
	is_active: boolean;
}
export type ShiftInput = Omit<WorkShift, 'id'>;

export type PatternDays = Record<Weekday, number[]>;
export interface ShiftPattern {
	id: number;
	name: string;
	days: PatternDays;
	is_default: boolean;
	/** Số khóa học (chưa huỷ) gán mẫu này. */
	course_count: number;
}
export type PatternInput = Pick<ShiftPattern, 'name' | 'days' | 'is_default'>;

/** Khóa học để gán mẫu ca tuần. */
export interface PatternCourse {
	id: string;
	name: string;
	start_date: string | null;
	end_date: string | null;
	is_rolling: boolean;
	shift_pattern_id: number | null;
	/** Đã qua ngày kết thúc. */
	ended: boolean;
	trainee_count: number;
}

/** 1 lượt học của học viên: ngày null = không giới hạn phía đó (khóa mở liên tục). */
export interface StudyPeriod {
	course_id: string;
	course_name: string;
	shift_pattern_id: number | null;
	start_date: string | null;
	end_date: string | null;
}

/** Học viên trong bảng phân ca — id là tài khoản học viên (users.id). */
export interface ShiftUser {
	id: string;
	trainee_id: string;
	full_name: string;
	department_id: string | null;
	department_name: string | null;
	periods: StudyPeriod[];
}

/** Dòng phân ca: shift_id null = nghỉ. */
export interface Assignment {
	user_id: string;
	work_date: string;
	shift_id: number | null;
}
export type RosterMode = 'shifts' | 'off' | 'pattern';

export const WEEKDAYS: { value: Weekday; label: string; long: string }[] = [
	{ value: 1, label: 'T2', long: 'Thứ 2' },
	{ value: 2, label: 'T3', long: 'Thứ 3' },
	{ value: 3, label: 'T4', long: 'Thứ 4' },
	{ value: 4, label: 'T5', long: 'Thứ 5' },
	{ value: 5, label: 'T6', long: 'Thứ 6' },
	{ value: 6, label: 'T7', long: 'Thứ 7' },
	{ value: 7, label: 'CN', long: 'Chủ nhật' },
];

/** Màu gợi ý cho ca (nền nhạt + chữ đậm cùng tông). */
export const SHIFT_COLORS = ['blue', 'green', 'amber', 'purple', 'pink', 'teal', 'red', 'gray'] as const;

const BASE = '/staff-attendance';

export const shiftApi = {
	list: () => apiClient.get<WorkShift[]>(`${BASE}/shifts`),
	create: (data: ShiftInput) => apiClient.post<WorkShift>(`${BASE}/shifts`, data),
	update: (id: number, data: ShiftInput) => apiClient.put<WorkShift>(`${BASE}/shifts/${id}`, data),
	remove: (id: number) => apiClient.delete<null>(`${BASE}/shifts/${id}`),
};

export const patternApi = {
	list: () => apiClient.get<ShiftPattern[]>(`${BASE}/patterns`),
	create: (data: PatternInput) => apiClient.post<ShiftPattern>(`${BASE}/patterns`, data),
	update: (id: number, data: PatternInput) => apiClient.put<ShiftPattern>(`${BASE}/patterns/${id}`, data),
	remove: (id: number) => apiClient.delete<null>(`${BASE}/patterns/${id}`),
	courses: () => apiClient.get<PatternCourse[]>(`${BASE}/patterns/courses`),
	setCourses: (id: number, courseIds: string[]) => apiClient.put<null>(`${BASE}/patterns/${id}/courses`, { course_ids: courseIds }),
};

export const rosterApi = {
	get: (from: string, to: string) =>
		apiClient.get<{ users: ShiftUser[]; assignments: Assignment[] }>(`${BASE}/roster?from=${from}&to=${to}`),
	set: (data: { user_ids: string[]; dates: string[]; mode: RosterMode; shift_ids?: number[] }) =>
		apiClient.put<{ cells: number }>(`${BASE}/roster`, data),
};

// ─── Tiện ích hiển thị ───────────────────────────────────────

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Độ dài ca (phút), khớp backend utils/attendanceShift.durationMin. */
export const durationMin = (s: Pick<WorkShift, 'start_time' | 'end_time'>) => {
	const d = toMinutes(s.end_time) - toMinutes(s.start_time);
	return d > 0 ? d : d + 1440;
};

export const describeDuration = (s: Pick<WorkShift, 'start_time' | 'end_time'>) => {
	const m = durationMin(s);
	const text = `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`;
	if (m === 1440) return '24 giờ';
	return toMinutes(s.end_time) <= toMinutes(s.start_time) ? `${text} · qua đêm` : text;
};

/** 'YYYY-MM-DD' → 1..7 (Thứ 2 = 1). */
export const weekdayOf = (dateKey: string): Weekday =>
	(((new Date(`${dateKey}T00:00:00Z`).getUTCDay() + 6) % 7) + 1) as Weekday;

export const addDays = (dateKey: string, n: number) =>
	new Date(Date.parse(`${dateKey}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Lượt học phủ ngày dateKey (khóa bắt đầu muộn nhất), khớp backend periodOn; null = không học khóa nào. */
export const periodOn = (periods: StudyPeriod[], dateKey: string): StudyPeriod | null => {
	let best: StudyPeriod | null = null;
	for (const p of periods) {
		if ((p.start_date && p.start_date > dateKey) || (p.end_date && p.end_date < dateKey)) continue;
		if (!best || (p.start_date ?? '') > (best.start_date ?? '')) best = p;
	}
	return best;
};

/**
 * Ca của 1 học viên trong 1 ngày, khớp backend shiftIdsForDay: có phân ca ngày đó thì theo
 * phân ca (rỗng = nghỉ), không thì theo mẫu tuần của khóa; null = không có lịch ca (chấm tự do).
 */
export const shiftsForDay = (
	pattern: ShiftPattern | null,
	assignments: Assignment[],
	dateKey: string,
): { source: 'roster' | 'pattern'; shiftIds: number[] } | null => {
	if (assignments.length) return { source: 'roster', shiftIds: assignments.map((a) => a.shift_id).filter((id): id is number => id != null) };
	if (pattern) return { source: 'pattern', shiftIds: pattern.days[weekdayOf(dateKey)] ?? [] };
	return null;
};
