import { apiClient } from '../../../shared/api/axios';
import type { DashboardStats } from '../types/report.type';

export const getDashboardStats = () =>
	apiClient.get<DashboardStats>('/dashboard/stats');

export type StatsExportSection =
	| 'overview'
	| 'by_specialty_group'
	| 'by_department_table'
	| 'by_department_detail';

export const exportDashboardStats = (year: string, sections: StatsExportSection[]) =>
	apiClient.postBlob('/dashboard/export-stats', { year, sections });

export interface TrainingReportByCourseProgram {
	course_id: string;
	course_name: string;
	program_name: string | null;
	total_enrollments: number;
	approved_count: number;
	avg_score: number | null;
	certificate_count: number;
}

export interface TrainingReportTraineeResult {
	trainee_name: string;
	course_name: string;
	score: number | null;
	classification: string | null;
	result: string | null;
	attended: number | null;
	total_sessions: number | null;
}

export interface TrainingReportSummary {
	course_count: number;
	enrollment_count: number;
	approved_count: number;
	certificate_count: number;
}

export interface TrainingReport {
	by_course_program: TrainingReportByCourseProgram[];
	trainee_results: TrainingReportTraineeResult[];
	summary: TrainingReportSummary;
}

export const getTrainingReport = (params: { from?: string; to?: string; course_id?: string } = {}) => {
	const qs = new URLSearchParams();
	if (params.from) qs.set('from', params.from);
	if (params.to) qs.set('to', params.to);
	if (params.course_id) qs.set('course_id', params.course_id);
	const suffix = qs.toString() ? `?${qs.toString()}` : '';
	return apiClient.get<TrainingReport>(`/dashboard/training-report${suffix}`);
};

export const exportTrainingReport = (params: { from?: string; to?: string; course_id?: string } = {}) =>
	apiClient.postBlob('/dashboard/training-report-export', params);
