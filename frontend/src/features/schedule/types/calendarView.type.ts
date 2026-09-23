import type { RoundDeadline } from '../../round/types/round.type';
import type { RoundRow } from './schedule.type';

export type CalView = 1 | 3 | 6 | 12;

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

export interface EventBar {
	id: string;
	label: string;
	color: string;
	startDate: Date;
	endDate: Date;
	thin: boolean;
	round: RoundRow;
	deadline?: RoundDeadline;
	isRoundPeriod?: boolean;
}

export interface WeekEvent {
	bar: EventBar;
	lane: number;
	colL: number;
	colR: number;
	contL: boolean;
	contR: boolean;
}

export interface MonthData {
	month: number;
	weeks: CalDay[][];
	deadlinesByDay: Map<string, DayEventItem[]>;
	monthDeadlines: MonthDeadlineSummary[];
	eventBars: EventBar[];
}

export interface PopoverData {
	title: string;
	events: DayEventItem[];
	roundForAdd?: RoundRow;
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
