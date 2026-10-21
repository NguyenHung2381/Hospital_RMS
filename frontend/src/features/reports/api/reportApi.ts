import { apiClient } from '../../../shared/api/axios';
import type { DashboardStats } from '../../dashboard/types/dashboard.type';

// ── NCKH ──────────────────────────────────────────────
// year = năm đợt nghiên cứu (giống bộ lọc Năm của danh sách đề tài)
export const getResearchStats = (year: number) =>
	apiClient.get<DashboardStats>(`/dashboard/stats?year=${year}`);

export type StatsExportSection =
	| 'overview'
	| 'by_specialty_group'
	| 'by_department_table'
	| 'by_department_detail';

export const exportResearchStats = (year: number, sections: StatsExportSection[]) =>
	apiClient.postBlob('/dashboard/export-stats', { year, sections });

// ── Đào tạo ───────────────────────────────────────────
export type CourseDisplayStatus = 'upcoming' | 'enrolling' | 'awaiting_schedule' | 'in_progress' | 'completed' | 'cancelled';

export interface CourseReportRow {
	id: string;
	name: string;
	start_date: string | null;
	end_date: string | null;
	status: CourseDisplayStatus;
	program_names: string | null;
	enrollments: number;
	approved: number;
	passed: number;
	avg_score: number | null;
	certificates: number;
}

export interface TraineeReportRow {
	trainee_name: string;
	department_name: string | null;
	course_id: string;
	course_name: string;
	score: number | null;
	classification: string | null;
	result: 'pass' | 'fail' | null;
	attended: number | null;
	total_sessions: number | null;
}

export interface TrainingReport {
	courses: CourseReportRow[];
	trainees: TraineeReportRow[];
}

export const getTrainingReport = (year: number) =>
	apiClient.get<TrainingReport>(`/dashboard/training-report?year=${year}`);

export const exportTrainingReport = (year: number, report: 'courses' | 'trainees') =>
	apiClient.postBlob('/dashboard/training-report-export', { year, report });

// ── Hội thảo – CME ────────────────────────────────────
export interface SeminarReportRow {
	id: string;
	title: string;
	event_type: string | null;
	scope: 'hosted' | 'external' | null;
	start_date: string | null;
	end_date: string | null;
	date_text: string | null;
	location: string | null;
	grants_cme: boolean;
	participant_count: number;
	cme_issued_count: number;
	manual_participant_count: number | null;
	manual_cme_count: number | null;
}

export interface CmePersonRow {
	staff_number: string | null;
	full_name: string;
	department_name: string | null;
	is_active: boolean;
	total: number;
	/** Ngưỡng tiết cần đạt trong năm; null = không đánh giá */
	required: number | null;
}

export interface SeminarReport {
	seminars: SeminarReportRow[];
	cme_people: CmePersonRow[];
}

export const getSeminarReport = (year: number) =>
	apiClient.get<SeminarReport>(`/dashboard/seminar-report?year=${year}`);

export const exportSeminarList = (year: number) =>
	apiClient.postBlob('/dashboard/seminar-report-export', { year });

export const exportCmeReport = (year: number) =>
	apiClient.postBlob('/dashboard/cme-report-export', { year });
