import { apiClient } from '../../../shared/api/axios';
import type {
	TrainingRound,
	TrainingRoundFormData,
	TrainingRoundListResponse,
} from '../types/trainingRound.type';

export const getTrainingRounds = () =>
	apiClient.get<TrainingRoundListResponse>('/training-rounds?limit=0');

const toPayload = (form: TrainingRoundFormData) => ({
	name: form.name,
	year: Number(form.year),
	start_date: form.start_date,
	end_date: form.end_date,
	enrollment_start_date: form.enrollment_start_date || null,
	enrollment_end_date: form.enrollment_end_date || null,
	status: form.status,
});

export const createTrainingRound = (form: TrainingRoundFormData) =>
	apiClient.post<TrainingRound>('/training-rounds', toPayload(form));

export const updateTrainingRound = (id: string, form: TrainingRoundFormData) =>
	apiClient.put<TrainingRound>(`/training-rounds/${id}`, toPayload(form));

export const deleteTrainingRound = (id: string) =>
	apiClient.delete<null>(`/training-rounds/${id}`);
