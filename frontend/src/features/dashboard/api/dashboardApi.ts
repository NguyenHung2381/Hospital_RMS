import { apiClient } from '../../../shared/api/axios';
import type { DashboardStats } from '../types/dashboard.type';

export const getDashboardStats = () =>
	apiClient.get<DashboardStats>('/dashboard/stats');
