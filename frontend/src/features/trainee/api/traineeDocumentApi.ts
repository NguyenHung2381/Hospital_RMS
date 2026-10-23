import { apiClient } from '../../../shared/api/axios';

export const addTraineeDocument = (traineeId: string, file: File, docType: string) => {
	const form = new FormData();
	form.append('file', file);
	form.append('doc_type', docType);
	return apiClient.postForm<{ id: string }>(`/trainees/${traineeId}/documents`, form);
};

export const removeTraineeDocument = (docId: string) =>
	apiClient.delete<null>(`/trainees/documents/${docId}`);
