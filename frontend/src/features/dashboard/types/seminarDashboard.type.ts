import type { SeminarEventType, SeminarScope } from '@/features/seminar/types/seminar.type';

export interface SeminarKpi {
	seminars_this_year: number;
	hosted_this_year: number;
	external_this_year: number;
	cme_seminars_this_year: number;
	upcoming_total: number;
	participants_this_year: number;
	internal_participants_this_year: number;
	cme_issued_this_year: number;
	cme_pending: number;
	cme_credits_this_year: number;
	current_year: number;
}

export interface UpcomingSeminar {
	id: string;
	title: string;
	start_date: string;
	end_date: string | null;
	location: string | null;
	scope: SeminarScope;
	grants_cme: boolean;
	participant_count: number;
}

export interface SeminarStats {
	kpi: SeminarKpi;
	by_event_type: { event_type: SeminarEventType; cnt: number }[];
	monthly: { month: number; seminars: number; participants: number }[];
	upcoming: UpcomingSeminar[];
	top_departments: { name: string; cnt: number; cme_cnt: number }[];
}
