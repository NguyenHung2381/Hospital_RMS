import { apiClient } from '../../../shared/api/axios';
import type {
	PermissionCatalog,
	RoleGrant,
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
export const getPermissionCatalog = () =>
	apiClient.get<PermissionCatalog>('/permissions/catalog');

export const getRolePermissions = (roleId: string) =>
	apiClient.get<RoleGrant[]>(`/roles/${roleId}/permissions`);

export const cloneRole = (roleId: string, data: RoleFormData) =>
	apiClient.post<Role>(`/roles/${roleId}/clone`, data);

export const setRolePermissions = (roleId: string, grants: RoleGrant[]) =>
	apiClient.put<RoleGrant[]>(`/roles/${roleId}/permissions`, { grants });
