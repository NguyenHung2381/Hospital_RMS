import { apiClient } from '../../../shared/api/axios';
import type { Trainee, TraineeFormData, TraineeListResponse } from '../types/trainee.type';

export const getTrainees = () => apiClient.get<TraineeListResponse>('/trainees?limit=0');

const toPayload = (form: TraineeFormData) => ({
	full_name: form.full_name,
	dob: form.dob || null,
	gender: form.gender || null,
	national_id: form.national_id || null,
	phone: form.phone || null,
	email: form.email || null,
	address: form.address || null,
	trainee_type_id: form.trainee_type_id || null,
	department_id: form.department_id || null,
});

export const createTrainee = (form: TraineeFormData) =>
	apiClient.post<Trainee>('/trainees', toPayload(form));

export const updateTrainee = (id: string, form: TraineeFormData) =>
	apiClient.put<Trainee>(`/trainees/${id}`, toPayload(form));

export const deleteTrainee = (id: string) => apiClient.delete<null>(`/trainees/${id}`);
