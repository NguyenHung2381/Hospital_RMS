import type {
	CatalogModule,
	CatalogPermission,
	CatalogResource,
	RoleGrant,
} from '../types/role.type';

// Tiện ích hiển thị quyền dựa trên danh mục (GET /permissions/catalog) — dùng
// chung cho so sánh vai trò và tra cứu quyền hiệu lực của người dùng.

export interface PermissionEntry {
	perm: CatalogPermission;
	resource: CatalogResource;
	module: CatalogModule;
}

// Nhãn phạm vi dữ liệu của một lượt cấp ("Trong khoa", "Toàn viện"...), '' nếu
// resource không có phạm vi.
export function scopeLabel(resource: CatalogResource, scope: string | null): string {
	if (!scope || !resource.scopes) return '';
	return resource.scopes.find((s) => s.key === scope)?.label ?? scope;
}

export function grantMap(grants: RoleGrant[]): Map<string, string | null> {
	return new Map(grants.map((g) => [g.permission_id, g.scope]));
}
