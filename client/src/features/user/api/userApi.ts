import { apiClient } from '../../../shared/api/axios';
import type { AccountType, User } from '../types/user.type';

export interface SimpleItem {
	id: string;
	name: string;
}

export interface UserListParams {
	page?: number;
	limit?: number;
	search?: string;
	department_id?: string;
	role_id?: string;
	account_type?: string;
	is_active?: boolean;
}

interface UserListResponse {
	data: User[];
	pagination: { page: number; limit: number; total: number };
	global_stats: {
		total: number;
		active: number;
		inactive: number;
		pwd_warn: number;
	};
	type_counts: Record<string, number>;
	dept_counts: Record<string, number>;
}

interface SimpleListResponse {
	data: SimpleItem[];
	pagination: { page: number; limit: number; total: number };
}

export interface CreateUserPayload {
	username: string;
	password: string;
	staff_number?: string;
	full_name: string;
	email?: string;
	department_id?: string;
	role_id?: string;
	account_type?: AccountType;
}

export interface UpdateUserPayload {
	staff_number?: string;
	full_name?: string;
	email?: string;
	department_id?: string;
	role_id?: string;
	account_type?: AccountType;
	is_active?: boolean;
}

export const getUsers = (params?: UserListParams) => {
	const entries = Object.entries(params ?? {})
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => [k, String(v)] as [string, string]);
	const qs = entries.length
		? '?' + new URLSearchParams(entries).toString()
		: '';
	return apiClient.get<UserListResponse>(`/users${qs}`);
};

export const getDepts = () =>
	apiClient.get<SimpleListResponse>('/departments?limit=200');

export const getRolesList = () =>
	apiClient.get<SimpleListResponse>('/roles?limit=100');

export const createUser = (payload: CreateUserPayload) =>
	apiClient.post<User>('/users', payload);

export const updateUser = (id: string, data: UpdateUserPayload) =>
	apiClient.put<User>(`/users/${id}`, data);

export const deleteUser = (id: string) =>
	apiClient.delete<null>(`/users/${id}`);

export const resetUserPassword = (id: string, newPassword: string) =>
	apiClient.post<null>(`/users/${id}/reset-password`, {
		new_password: newPassword,
	});
