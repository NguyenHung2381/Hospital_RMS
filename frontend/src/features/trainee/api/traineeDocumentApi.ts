import { apiClient } from '../../../shared/api/axios';
import { seg } from '../../../shared/api/path';

/** Tải lên hồ sơ PDF của học viên (cán bộ tải = duyệt sẵn) */
export const addTraineeDocument = (traineeId: string, file: File) => {
	const form = new FormData();
	form.append('file', file);
	return apiClient.postForm<{ id: string }>(`/trainees/${seg(traineeId)}/documents`, form);
};

export const removeTraineeDocument = (docId: string) =>
	apiClient.delete<null>(`/trainees/documents/${seg(docId)}`);
