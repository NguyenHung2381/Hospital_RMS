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
