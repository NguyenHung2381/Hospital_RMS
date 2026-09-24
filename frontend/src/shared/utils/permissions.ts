// Nguồn chân lý duy nhất cho việc kiểm tra quyền "resource:action" phía
// client — cùng quy tắc với backend (middlewares/auth.js): có ĐÚNG quyền mới
// được, superuser được hết, phạm vi dữ liệu đọc qua scopeOf().
// Đây CHỈ LÀ tiện ích giao diện (ẩn/hiện) — quyền thật luôn do backend kiểm
// tra ở mọi endpoint. Danh sách key hợp lệ: types/permissions.generated.ts.

import type { PermissionKey } from '../types/permissions.generated';

export interface PermissionUser {
	permissions?: string[] | null;
	/** "resource:action" → phạm vi dữ liệu (chỉ resource có phạm vi) — từ login / GET /users/me */
	permission_scopes?: Record<string, string> | null;
}

// Phạm vi dữ liệu — khớp backend/src/permissions/scopes.js (hẹp → rộng).
export type TopicScope = 'own' | 'department' | 'all';
export type UserScope = 'department' | 'all';
export type CourseScope = 'assigned' | 'all';
type ScopeByResource = { topics: TopicScope; users: UserScope; courses: CourseScope };
const SCOPE_ORDER: { [R in keyof ScopeByResource]: ScopeByResource[R][] } = {
	topics: ['own', 'department', 'all'],
	users: ['department', 'all'],
	courses: ['assigned', 'all'],
};

// Superuser: backend đưa key 'system:manage' vào danh sách quyền của vai trò có
// cờ roles.is_superuser (không phải quyền cấp được qua ma trận).
export function isSuperuser(user: PermissionUser | null | undefined): boolean {
	return !!user?.permissions?.includes('system:manage');
}

// Superuser được mọi quyền. Ngoài ra phải có ĐÚNG quyền — "manage" không còn
// là wildcard (khớp middlewares/auth.js ở backend).
export function hasPermission(
	user: PermissionUser | null | undefined,
	key?: PermissionKey | null,
): boolean {
	if (!key) return true;
	const perms = user?.permissions;
	if (!perms || !perms.length) return false;
	return isSuperuser(user) || perms.includes(key);
}

// Phạm vi dữ liệu của user trên resource (theo quyền `resource:read`, không
// có thì lấy phạm vi rộng nhất trong các quyền khác của resource) — cùng
// logic scopeOf ở backend. null = không có quyền nào trên resource.
export function scopeOf<R extends keyof ScopeByResource>(
	user: PermissionUser | null | undefined,
	resource: R,
): ScopeByResource[R] | null {
	if (isSuperuser(user)) return 'all';
	const order = SCOPE_ORDER[resource] as string[];
	const scopes = user?.permission_scopes ?? {};
	const direct = scopes[`${resource}:read`];
	if (direct && order.includes(direct)) return direct as ScopeByResource[R];
	let best = -1;
	for (const [key, scope] of Object.entries(scopes)) {
		if (key.startsWith(`${resource}:`)) best = Math.max(best, order.indexOf(scope));
	}
	return best >= 0 ? (order[best] as ScopeByResource[R]) : null;
}

export function hasAnyPermission(
	user: PermissionUser | null | undefined,
	keys: PermissionKey[],
): boolean {
	return keys.some((key) => hasPermission(user, key));
}

export function canAccessAdminPanel(user: PermissionUser | null | undefined): boolean {
	return hasPermission(user, 'admin_panel:access');
}
