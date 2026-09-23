import { apiClient } from '../../../shared/api/axios';
import type {
	Permission,
	Role,
	RoleFormData,
	RoleListResponse,
} from '../types/role.type';

export interface RoleListParams {
	page?: number;
	limit?: number;
	search?: string;
}

export const getRoles = (params?: RoleListParams) => {
	const entries = Object.entries(params ?? {})
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => [k, String(v)] as [string, string]);
	const qs = entries.length
		? '?' + new URLSearchParams(entries).toString()
		: '';
	return apiClient.get<RoleListResponse>(`/roles${qs}`);
};

export const createRole = (payload: RoleFormData) =>
	apiClient.post<Role>('/roles', payload);

export const updateRole = (id: string, payload: RoleFormData) =>
	apiClient.put<Role>(`/roles/${id}`, payload);

export const deleteRole = (id: string) =>
	apiClient.delete<null>(`/roles/${id}`);

// Permission endpoints
export const getAllPermissions = () =>
	apiClient.get<Permission[]>('/permissions');

export const getRolePermissions = (roleId: string) =>
	apiClient.get<string[]>(`/roles/${roleId}/permissions`);

export const setRolePermissions = (roleId: string, permissionIds: string[]) =>
	apiClient.put<string[]>(`/roles/${roleId}/permissions`, {
		permission_ids: permissionIds,
	});
