import { apiClient } from '../../../shared/api/axios';
import type { SeminarStats } from '../types/seminarDashboard.type';

export const getSeminarStats = () => apiClient.get<SeminarStats>('/dashboard/seminar-stats');
