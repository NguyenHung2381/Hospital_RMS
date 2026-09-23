export interface TrainingKpi {
	open_courses: number;
	total_courses: number;
	total_trainees: number;
	total_lecturers: number;
	pending_enrollments: number;
	certificates_issued: number;
}

export interface UpcomingSession {
	id: string;
	session_date: string;
	start_time: string | null;
	end_time: string | null;
	room: string | null;
	course_name: string;
	subject_name: string | null;
	lecturer_name: string | null;
}

export interface TopFullCourse {
	id: string;
	name: string;
	capacity: number;
	approved_count: number;
	fill_rate: number;
}

export interface TrainingStats {
	kpi: TrainingKpi;
	upcoming_sessions: UpcomingSession[];
	top_full_courses: TopFullCourse[];
	trainees_by_type: { name: string; cnt: number }[];
	enrollment_trend: { month: string; cnt: number }[];
}
