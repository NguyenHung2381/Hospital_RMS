import type { RoundDeadline } from '../../round/types/round.type';
import type { RoundRow } from './schedule.type';

/** Chế độ xem lịch: 1 tuần, 1 tháng hoặc cả năm (12 thẻ tháng) */
export type CalMode = 'week' | 'month' | 'year';

/** Số tháng hiển thị trên lưới: 1 (tuần/tháng) hoặc 12 (năm) */
export type CalView = 1 | 12;

export interface CalDay {
	date: Date;
	dayNum: number;
	month: number;
	year: number;
	isCurrentMonth: boolean;
	isToday: boolean;
	key: string;
}

export interface DayEventItem {
	round: RoundRow;
	deadline: RoundDeadline;
	color: string;
}

export interface MonthDeadlineSummary {
	round: RoundRow;
	deadline: RoundDeadline;
	day: number;
	color: string;
}

export interface MonthData {
	month: number;
	weeks: CalDay[][];
	deadlinesByDay: Map<string, DayEventItem[]>;
	monthDeadlines: MonthDeadlineSummary[];
}

export interface EventDetailData {
	title: string;
	round: RoundRow;
	deadline?: RoundDeadline;
	startDateStr: string;
	endDateStr?: string;
	color: string;
	typeLabel?: string;
	statusLabel?: string;
}
