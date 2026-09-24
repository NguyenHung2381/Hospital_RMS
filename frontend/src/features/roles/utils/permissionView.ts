import type {
	CatalogModule,
	CatalogPermission,
	CatalogResource,
	PermissionCatalog,
	RoleGrant,
} from '../types/role.type';

// Tiện ích hiển thị quyền dựa trên danh mục (GET /permissions/catalog) — dùng
// chung cho so sánh vai trò và tra cứu quyền hiệu lực của người dùng.

export interface PermissionEntry {
	perm: CatalogPermission;
	resource: CatalogResource;
	module: CatalogModule;
}

export function indexCatalog(catalog: PermissionCatalog): Map<string, PermissionEntry> {
	const byId = new Map<string, PermissionEntry>();
	for (const module of catalog.modules) {
		for (const resource of module.resources) {
			for (const perm of resource.permissions) byId.set(perm.id, { perm, resource, module });
		}
	}
	return byId;
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
