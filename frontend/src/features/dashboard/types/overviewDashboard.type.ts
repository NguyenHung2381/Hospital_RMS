export interface OverviewKpi {
	users_total: number;
	users_active: number;
	users_locked: number;
	departments_total: number;
	topics_total: number;
	topics_this_year: number;
	topics_pending: number;
	topics_approved: number;
	rounds_active: number;
	councils_total: number;
	courses_total: number;
	courses_open: number;
	trainees_active: number;
	lecturers_active: number;
	enrollments_pending: number;
	certificates_active: number;
	seminars_this_year: number;
	participants_this_year: number;
	cme_issued_this_year: number;
	current_year: number;
}

export interface MonthlyActivity {
	month: string;
	topics: number;
	enrollments: number;
	seminars: number;
}

export interface OverviewStats {
	kpi: OverviewKpi;
	monthly_activity: MonthlyActivity[];
	users_by_role: { name: string; cnt: number }[];
	top_departments: { name: string; users_cnt: number; topics_cnt: number }[];
}
