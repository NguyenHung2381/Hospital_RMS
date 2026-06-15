import { apiClient } from '../../../lib/apiClient';
import type {
	Department,
	DeptFormData,
	DeptListResponse,
} from '../types/department.type';

export const getDepartments = () =>
	apiClient.get<DeptListResponse>('/departments');

export const createDepartment = (form: DeptFormData) =>
	apiClient.post<Department>('/departments', {
		name: form.name,
		code: form.code,
		viet_tat: form.viet_tat,
		description: form.description || null,
	});

export const updateDepartment = (id: string, form: DeptFormData) =>
	apiClient.put<Department>(`/departments/${id}`, {
		name: form.name,
		code: form.code,
		viet_tat: form.viet_tat,
		description: form.description || null,
	});

export const deleteDepartment = (id: string) =>
	apiClient.delete<null>(`/departments/${id}`);
