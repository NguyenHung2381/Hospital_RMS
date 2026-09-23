import { apiClient } from '../../../shared/api/axios';
import type { WorkflowDefinition } from '../types/workflow.type';

export interface SimpleRole {
	id: string;
	name: string;
}

export interface StepPayload {
	name: string;
	approver_role_id?: string | null;
	sla_days?: number | null;
}

export interface DefinitionPayload {
	resource: string;
	name: string;
	is_active?: boolean;
	steps?: StepPayload[];
}

export const workflowApi = {
	getRoles: () => apiClient.get<{ data: SimpleRole[] }>('/roles?limit=0'),

	list: (resource?: string) =>
		apiClient.get<WorkflowDefinition[]>(`/workflows/definitions${resource ? `?resource=${resource}` : ''}`),

	getById: (id: string) => apiClient.get<WorkflowDefinition>(`/workflows/definitions/${id}`),

	create: (payload: DefinitionPayload) => apiClient.post<WorkflowDefinition>('/workflows/definitions', payload),

	update: (id: string, payload: Partial<DefinitionPayload>) =>
		apiClient.put<WorkflowDefinition>(`/workflows/definitions/${id}`, payload),

	remove: (id: string) => apiClient.delete<null>(`/workflows/definitions/${id}`),
};
