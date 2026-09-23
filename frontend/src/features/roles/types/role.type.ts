export type ModalType = 'add' | 'edit' | 'delete' | 'permissions' | null;

export interface Role {
	id: string;
	name: string;
	description: string | null;
	user_count?: number;
	permission_count?: number;
	created_at: string;
	updated_at?: string;
}

export interface RoleFormData {
	name: string;
	description: string;
}

export interface Permission {
	id: string;
	name: string;
	resource: string;
	action: string;
	description: string | null;
}

export interface RoleStats {
	total: number;
	withUsers: number;
	totalUsers: number;
}

export interface RoleListResponse {
	data: Role[];
	pagination: { page: number; limit: number; total: number };
	stats: RoleStats;
}

export const EMPTY_FORM: RoleFormData = {
	name: '',
	description: '',
};

// Cấu trúc ma trận quyền hiển thị trên UI — dựng động từ getAllPermissions()
export interface PermissionMatrixRow {
	resource: string;
	resourceLabel: string;
	actions: { id: string; action: string; label: string }[];
}

// Tất cả cột hành động có thể xuất hiện trong ma trận
export const MATRIX_ACTIONS = [
	'read',
	'read_department',
	'read_all',
	'read_sensitive',
	'create',
	'update',
	'delete',
	'approve',
	'import',
	'export',
	'cme_manage',
	'access',
	'manage',
] as const;
export const MATRIX_ACTION_LABELS: Record<string, string> = {
	read: 'Xem',
	read_department: 'Xem (khoa)',
	read_all: 'Xem (toàn bộ)',
	read_sensitive: 'Xem dữ liệu nhạy cảm',
	create: 'Tạo',
	update: 'Sửa',
	delete: 'Xóa',
	approve: 'Duyệt',
	import: 'Nhập Excel',
	export: 'Xuất Excel',
	cme_manage: 'Cấp CME',
	access: 'Truy cập',
	manage: 'Quản lý',
};
