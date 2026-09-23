import { apiClient } from '../../../shared/api/axios';
import type { OverviewStats } from '../types/overviewDashboard.type';

export const getOverviewStats = () => apiClient.get<OverviewStats>('/dashboard/overview');
