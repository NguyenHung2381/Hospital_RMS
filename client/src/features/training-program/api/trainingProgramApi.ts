import { apiClient } from '../../../shared/api/axios';
import type {
	TrainingProgram,
	TrainingProgramFormData,
	TrainingProgramListResponse,
} from '../types/trainingProgram.type';

export const getTrainingPrograms = () =>
	apiClient.get<TrainingProgramListResponse>('/training-programs?limit=0');

// Danh sách id môn học đang gán cho 1 chương trình — /training-programs (list)
// KHÔNG trả subject_ids (tránh join thừa cho mọi dòng), chỉ /training-programs/:id có.
export const getProgramSubjectIds = (programId: string) =>
	apiClient.get<string[]>(`/training-programs/${programId}/subjects`);

const toPayload = (form: TrainingProgramFormData) => ({
	name: form.name,
	department_id: form.department_id || null,
	trainee_type_id: form.trainee_type_id || null,
	training_type_id: form.training_type_id || null,
	description: form.description || null,
	subject_ids: form.subject_ids,
});

export const createTrainingProgram = (form: TrainingProgramFormData) =>
	apiClient.post<TrainingProgram>('/training-programs', toPayload(form));

export const updateTrainingProgram = (id: string, form: TrainingProgramFormData) =>
	apiClient.put<TrainingProgram>(`/training-programs/${id}`, toPayload(form));

export const deleteTrainingProgram = (id: string) =>
	apiClient.delete<null>(`/training-programs/${id}`);
