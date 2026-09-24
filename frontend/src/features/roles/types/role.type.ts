export type ModalType =
	| 'add'
	| 'edit'
	| 'clone'
	| 'delete'
	| 'permissions'
	| 'users'
	| 'compare'
	| 'userPermissions'
	| null;

export interface Role {
	id: string;
	name: string;
	description: string | null;
	user_count?: number;
	permission_count?: number;
	/** Mã cố định (vd 'member', 'trainee') — code nghiệp vụ tham chiếu vai trò qua mã này */
	code?: string | null;
	/** Vai trò gốc của hệ thống — không xoá được */
	is_system?: boolean;
	/** Toàn quyền: bỏ qua mọi kiểm tra, không cần (và không thể) tick quyền */
	is_superuser?: boolean;
	created_at: string;
	updated_at?: string;
}

export interface RoleFormData {
	name: string;
	description: string;
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

// Danh mục quyền từ GET /permissions/catalog — nguồn: backend/src/permissions/catalog.js
export interface CatalogPermission {
	id: string;
	key: string;
	action: string;
	name: string;
	description: string | null;
	/** Quyền cho phép quản lý tài khoản / phân quyền — cảnh báo khi cấp */
	critical: boolean;
	/** id các quyền tự tick theo khi cấp quyền này (vd Sửa → Xem) */
	implies: string[];
}

export interface CatalogScope {
	key: string;
	label: string;
}

export interface CatalogResource {
	key: string;
	label: string;
	/** Phạm vi dữ liệu chọn được, hẹp → rộng; null = resource không có phạm vi */
	scopes: CatalogScope[] | null;
	permissions: CatalogPermission[];
}

/** Một lượt cấp quyền cho vai trò (GET/PUT /roles/:id/permissions) */
export interface RoleGrant {
	permission_id: string;
	scope: string | null;
}

export interface CatalogModule {
	key: string;
	label: string;
	resources: CatalogResource[];
}

export interface PermissionCatalog {
	actionLabels: Record<string, string>;
	modules: CatalogModule[];
}
