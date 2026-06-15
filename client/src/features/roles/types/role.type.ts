export type ModalType = 'add' | 'edit' | 'delete' | 'permissions' | null;

export interface Role {
	id: string;
	name: string;
	description: string | null;
	user_count?: number;
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

export interface RoleListResponse {
	data: Role[];
	pagination: { page: number; limit: number; total: number };
}

export const EMPTY_FORM: RoleFormData = {
	name: '',
	description: '',
};

// Cấu trúc ma trận quyền hiển thị trên UI (không phụ thuộc vào API)
export interface PermissionMatrixRow {
	resource: string;
	resourceLabel: string;
	actions: { id: string; action: string; label: string }[];
}

export const PERMISSION_MATRIX: PermissionMatrixRow[] = [
	{
		resource: 'topics',
		resourceLabel: 'Đề tài nghiên cứu',
		actions: [
			{ id: 'PERM-TOP-READ', action: 'read', label: 'Xem' },
			{ id: 'PERM-TOP-CREATE', action: 'create', label: 'Tạo' },
			{ id: 'PERM-TOP-UPDATE', action: 'update', label: 'Sửa' },
			{ id: 'PERM-TOP-DELETE', action: 'delete', label: 'Xóa' },
			{ id: 'PERM-TOP-APPROVE', action: 'approve', label: 'Duyệt' },
		],
	},
	{
		resource: 'users',
		resourceLabel: 'Người dùng',
		actions: [
			{ id: 'PERM-USR-READ', action: 'read', label: 'Xem' },
			{ id: 'PERM-USR-CREATE', action: 'create', label: 'Tạo' },
			{ id: 'PERM-USR-UPDATE', action: 'update', label: 'Sửa' },
			{ id: 'PERM-USR-DELETE', action: 'delete', label: 'Xóa' },
		],
	},
	{
		resource: 'departments',
		resourceLabel: 'Khoa phòng',
		actions: [
			{ id: 'PERM-DEPT-READ', action: 'read', label: 'Xem' },
			{ id: 'PERM-DEPT-CREATE', action: 'create', label: 'Tạo' },
			{ id: 'PERM-DEPT-UPDATE', action: 'update', label: 'Sửa' },
			{ id: 'PERM-DEPT-DELETE', action: 'delete', label: 'Xóa' },
			{ id: 'PERM-DEPT-MANAGE', action: 'manage', label: 'Quản lý' },
		],
	},
	{
		resource: 'roles',
		resourceLabel: 'Vai trò & Quyền',
		actions: [
			{ id: 'PERM-ROLE-READ', action: 'read', label: 'Xem' },
			{ id: 'PERM-ROLE-CREATE', action: 'create', label: 'Tạo' },
			{ id: 'PERM-ROLE-UPDATE', action: 'update', label: 'Sửa' },
			{ id: 'PERM-ROLE-DELETE', action: 'delete', label: 'Xóa' },
			{ id: 'PERM-ROLE-MANAGE', action: 'manage', label: 'Quản lý' },
		],
	},
	{
		resource: 'rounds',
		resourceLabel: 'Đợt nghiên cứu',
		actions: [
			{ id: 'PERM-RND-READ', action: 'read', label: 'Xem' },
			{ id: 'PERM-RND-CREATE', action: 'create', label: 'Tạo' },
			{ id: 'PERM-RND-UPDATE', action: 'update', label: 'Sửa' },
			{ id: 'PERM-RND-DELETE', action: 'delete', label: 'Xóa' },
			{ id: 'PERM-RND-MANAGE', action: 'manage', label: 'Quản lý' },
		],
	},
	{
		resource: 'files',
		resourceLabel: 'Tài liệu',
		actions: [
			{ id: 'PERM-FILE-READ', action: 'read', label: 'Xem / Tải' },
			{ id: 'PERM-FILE-CREATE', action: 'create', label: 'Tải lên' },
			{ id: 'PERM-FILE-UPDATE', action: 'update', label: 'Sửa' },
			{ id: 'PERM-FILE-DELETE', action: 'delete', label: 'Xóa' },
		],
	},
	{
		resource: 'reports',
		resourceLabel: 'Báo cáo & Thống kê',
		actions: [
			{ id: 'PERM-RPT-READ', action: 'read', label: 'Xem' },
			{ id: 'PERM-RPT-CREATE', action: 'create', label: 'Tạo' },
			{ id: 'PERM-RPT-UPDATE', action: 'update', label: 'Sửa' },
			{ id: 'PERM-RPT-DELETE', action: 'delete', label: 'Xóa' },
		],
	},
];

// Tất cả cột hành động có thể xuất hiện trong ma trận
export const MATRIX_ACTIONS = [
	'read',
	'create',
	'update',
	'delete',
	'approve',
	'manage',
] as const;
export const MATRIX_ACTION_LABELS: Record<string, string> = {
	read: 'Xem',
	create: 'Tạo',
	update: 'Sửa',
	delete: 'Xóa',
	approve: 'Duyệt',
	manage: 'Quản lý',
};
