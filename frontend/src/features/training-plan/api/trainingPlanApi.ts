import { apiClient } from '../../../shared/api/axios';
import type {
	TrainingPlan,
	TrainingPlanItem,
	TrainingPlanListResponse,
} from '../types/trainingPlan.type';

export interface SimpleDept {
	id: string;
	name: string;
}

export interface TrainingPlanListParams {
	search?: string;
	department_id?: string;
	year?: number;
	status?: string;
}

export interface TrainingPlanItemPayload {
	title: string;
	quarter?: number | null;
	target_count?: number | null;
	note?: string | null;
}

export interface TrainingPlanPayload {
	department_id?: string | null;
	year: number;
	title: string;
	description?: string | null;
	status?: string;
	items?: TrainingPlanItemPayload[];
}

export const trainingPlanApi = {
	getDepartments: () =>
		apiClient.get<{ data: SimpleDept[] }>('/departments?limit=0'),

	list: (params: TrainingPlanListParams = {}) => {
		const qs = new URLSearchParams({ limit: '0' });
		if (params.search) qs.set('search', params.search);
		if (params.department_id) qs.set('department_id', params.department_id);
		if (params.year) qs.set('year', String(params.year));
		if (params.status) qs.set('status', params.status);
		return apiClient.get<TrainingPlanListResponse>(`/training-plans?${qs.toString()}`);
	},

	getById: (id: string) => apiClient.get<TrainingPlan>(`/training-plans/${id}`),

	create: (payload: TrainingPlanPayload) =>
		apiClient.post<TrainingPlan>('/training-plans', payload),

	update: (id: string, payload: Partial<TrainingPlanPayload>) =>
		apiClient.put<TrainingPlan>(`/training-plans/${id}`, payload),

	remove: (id: string) => apiClient.delete<null>(`/training-plans/${id}`),

	setItems: (id: string, items: TrainingPlanItemPayload[]) =>
		apiClient.put<TrainingPlanItem[]>(`/training-plans/${id}/items`, { items }),
};
