import { apiClient } from '../../../shared/api/axios';
import type {
	Department,
	DeptFormData,
	DeptListResponse,
} from '../types/department.type';
import { seg } from '../../../shared/api/path';

export interface DeptListParams {
	page?: number;
	limit?: number;
	search?: string;
}

// Không truyền params → giữ hành vi cũ: lấy toàn bộ khoa/phòng.
export const getDepartments = (params?: DeptListParams) => {
	const merged = { limit: 0, ...params };
	const entries = Object.entries(merged)
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => [k, String(v)] as [string, string]);
	return apiClient.get<DeptListResponse>(`/departments?${new URLSearchParams(entries).toString()}`);
};

/** Toàn bộ khoa/phòng cho ô chọn. Mọi nơi gọi cùng một URL nên dùng chung cache danh mục
 *  của apiClient (gộp request trùng, giữ 60s, xoá khi có thao tác ghi / realtime). */
export const getDepartmentOptions = <T = Department>() =>
	apiClient.get<{ data: T[] }>('/departments?limit=0').then((r) => r.data);

export const createDepartment = (form: DeptFormData) =>
	apiClient.post<Department>('/departments', {
		name: form.name,
		code: form.code,
		abbreviation: form.abbreviation,
		description: form.description || null,
		specialty_group: form.specialty_group || null,
	});

export const updateDepartment = (id: string, form: DeptFormData) =>
	apiClient.put<Department>(`/departments/${seg(id)}`, {
		name: form.name,
		code: form.code,
		abbreviation: form.abbreviation,
		description: form.description || null,
		specialty_group: form.specialty_group || null,
	});

export const deleteDepartment = (id: string) =>
	apiClient.delete<null>(`/departments/${seg(id)}`);
