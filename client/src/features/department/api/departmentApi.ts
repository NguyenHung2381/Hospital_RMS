import { apiClient } from '../../../shared/api/axios';
import type {
	Department,
	DeptFormData,
	DeptListResponse,
} from '../types/department.type';

export const getDepartments = () =>
	apiClient.get<DeptListResponse>('/departments?limit=0');

export const createDepartment = (form: DeptFormData) =>
	apiClient.post<Department>('/departments', {
		name: form.name,
		code: form.code,
		abbreviation: form.abbreviation,
		description: form.description || null,
		specialty_group: form.specialty_group || null,
	});

export const updateDepartment = (id: string, form: DeptFormData) =>
	apiClient.put<Department>(`/departments/${id}`, {
		name: form.name,
		code: form.code,
		abbreviation: form.abbreviation,
		description: form.description || null,
		specialty_group: form.specialty_group || null,
	});

export const deleteDepartment = (id: string) =>
	apiClient.delete<null>(`/departments/${id}`);
