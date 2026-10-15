import { apiClient } from '../../../shared/api/axios';
import type { User } from '../types/user.type';

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
	is_active?: boolean;
	// meta=0 -> chỉ lấy danh sách + tổng số (bỏ global_stats + facet counts).
	// Dùng khi chỉ đổi trang/kích thước trang.
	meta?: 0 | 1;
}

interface UserListResponse {
	data: User[];
	pagination: { page: number; limit: number; total: number };
	// Chỉ có khi gọi với meta=1 (mặc định).
	global_stats?: {
		total: number;
		active: number;
		inactive: number;
		pwd_warn: number;
	};
	role_counts?: Record<string, number>;
	dept_counts?: Record<string, number>;
}

interface SimpleListResponse {
	data: SimpleItem[];
	pagination: { page: number; limit: number; total: number };
}

export interface CreateUserPayload {
	username: string;
	/** Bỏ trống ⇒ server đặt mật khẩu mặc định = tên đăng nhập */
	password?: string;
	staff_number?: string;
	full_name: string;
	email?: string;
	department_id?: string;
	role_id?: string;
}

export interface UpdateUserPayload {
	staff_number?: string;
	full_name?: string;
	email?: string;
	department_id?: string;
	role_id?: string;
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

// Xuất Excel đúng tập đang lọc (mọi trang)
export const exportUsersExcel = (filters: Pick<UserListParams, 'search' | 'department_id' | 'role_id'>) =>
	apiClient.postBlob('/users/export-excel', filters);

export const getDepts = () =>
	apiClient.get<SimpleListResponse>('/departments?limit=0');

export const getRolesList = () =>
	apiClient.get<SimpleListResponse>('/roles?limit=0');

export const createUser = (payload: CreateUserPayload) =>
	apiClient.post<User>('/users', payload);

export const updateUser = (id: string, data: UpdateUserPayload) =>
	apiClient.put<User>(`/users/${id}`, data);

export const deleteUser = (id: string) =>
	apiClient.delete<null>(`/users/${id}`);

// Không truyền newPassword ⇒ server đặt về mật khẩu mặc định = tên đăng nhập,
// trả về trong temporary_password. Cả hai cách, người dùng đều phải đổi ở lần đăng nhập tới.
export const resetUserPassword = (id: string, newPassword?: string) =>
	apiClient.post<{ temporary_password: string } | null>(`/users/${id}/reset-password`, {
		...(newPassword ? { new_password: newPassword } : {}),
	});
