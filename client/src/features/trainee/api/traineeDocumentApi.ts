import { apiClient } from '../../../shared/api/axios';

export interface TraineeDocument {
	id: string;
	doc_type: string;
	created_at: string;
	file_name: string;
	file_url: string;
	mime_type: string | null;
	file_size: number | null;
}

export const getTraineeDocuments = (traineeId: string) =>
	apiClient.get<TraineeDocument[]>(`/trainees/${traineeId}/documents`);

export const addTraineeDocument = (traineeId: string, file: File, docType: string) => {
	const form = new FormData();
	form.append('file', file);
	form.append('doc_type', docType);
	return apiClient.postForm<{ id: string }>(`/trainees/${traineeId}/documents`, form);
};

export const removeTraineeDocument = (docId: string) =>
	apiClient.delete<null>(`/trainees/documents/${docId}`);
