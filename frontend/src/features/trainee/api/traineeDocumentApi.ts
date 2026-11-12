import { apiClient } from '../../../shared/api/axios';

/** Tải lên hồ sơ PDF của học viên (cán bộ tải = duyệt sẵn) */
export const addTraineeDocument = (traineeId: string, file: File) => {
	const form = new FormData();
	form.append('file', file);
	return apiClient.postForm<{ id: string }>(`/trainees/${traineeId}/documents`, form);
};

export const removeTraineeDocument = (docId: string) =>
	apiClient.delete<null>(`/trainees/documents/${docId}`);
