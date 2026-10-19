import { apiClient } from '../../../shared/api/axios';
import type {
	Lecturer,
	LecturerFormData,
	LecturerFromStaffResult,
	LecturerListResponse,
} from '../types/lecturer.type';

export interface LecturerListParams {
	page?: number;
	limit?: number;
	search?: string;
	active_only?: boolean | string;
}

// Không truyền params → giữ hành vi cũ: lấy toàn bộ giảng viên (kể cả đã vô hiệu hoá).
export const getLecturers = (params?: LecturerListParams) => {
	const merged = { limit: 0, active_only: 'false', ...params };
	const entries = Object.entries(merged)
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => [k, String(v)] as [string, string]);
	return apiClient.get<LecturerListResponse>(`/lecturers?${new URLSearchParams(entries).toString()}`);
};

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

// Thêm giảng viên từ nhân sự — thông tin lấy từ tài khoản và hồ sơ CCHN
export const createLecturersFromStaff = (userIds: string[]) =>
	apiClient.post<LecturerFromStaffResult>('/lecturers/from-staff', { user_ids: userIds });

export const deleteLecturer = (id: string) => apiClient.delete<null>(`/lecturers/${id}`);
