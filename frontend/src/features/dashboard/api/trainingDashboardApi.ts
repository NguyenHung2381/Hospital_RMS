import { apiClient } from '../../../shared/api/axios';
import type { TrainingStats } from '../types/trainingDashboard.type';

export const getTrainingStats = () => apiClient.get<TrainingStats>('/dashboard/training-stats');
