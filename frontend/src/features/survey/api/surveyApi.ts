import { apiClient } from '../../../shared/api/axios';
import type {
	ActiveSurvey,
	AnswerPayload,
	Survey,
	SurveyListResponse,
	SurveyResults,
	SurveyToRespond,
} from '../types/survey.type';

export interface SimpleRole {
	id: string;
	name: string;
}

export interface SurveyQuestionPayload {
	question_text: string;
	question_type: string;
	options?: string[];
}

export interface SurveyPayload {
	title: string;
	description?: string | null;
	status?: string;
	target_role?: string | null;
	questions?: SurveyQuestionPayload[];
}

export const surveyApi = {
	getRoles: () => apiClient.get<{ data: SimpleRole[] }>('/roles?limit=0'),

	list: () => apiClient.get<SurveyListResponse>('/surveys?limit=0'),

	getById: (id: string) => apiClient.get<Survey>(`/surveys/${id}`),

	getResults: (id: string) => apiClient.get<SurveyResults>(`/surveys/${id}/results`),

	create: (payload: SurveyPayload) => apiClient.post<Survey>('/surveys', payload),

	update: (id: string, payload: Partial<SurveyPayload>) =>
		apiClient.put<Survey>(`/surveys/${id}`, payload),

	remove: (id: string) => apiClient.delete<null>(`/surveys/${id}`),

	// ─── Người dùng ───────────────────────────────────────────────────────
	listActive: () => apiClient.get<ActiveSurvey[]>('/surveys/active'),

	getForRespond: (id: string) => apiClient.get<SurveyToRespond>(`/surveys/${id}/respond`),

	submit: (id: string, answers: AnswerPayload[]) =>
		apiClient.post<{ response_id: string }>(`/surveys/${id}/respond`, { answers }),
};
