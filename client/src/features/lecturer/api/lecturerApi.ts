import { apiClient } from '../../../shared/api/axios';
import type { Lecturer, LecturerFormData, LecturerListResponse } from '../types/lecturer.type';

export const getLecturers = () =>
	apiClient.get<LecturerListResponse>('/lecturers?limit=0&active_only=false');

export const createLecturer = (form: LecturerFormData) =>
	apiClient.post<Lecturer>('/lecturers', {
		full_name: form.full_name,
		specialty: form.specialty || null,
		is_external: form.is_external,
		phone: form.phone || null,
		email: form.email || null,
	});

export const updateLecturer = (id: string, form: LecturerFormData) =>
	apiClient.put<Lecturer>(`/lecturers/${id}`, {
		full_name: form.full_name,
		specialty: form.specialty || null,
		is_external: form.is_external,
		phone: form.phone || null,
		email: form.email || null,
	});

export const deleteLecturer = (id: string) => apiClient.delete<null>(`/lecturers/${id}`);
