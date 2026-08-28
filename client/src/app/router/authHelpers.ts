import {
	getStoredUser as getAuthUser,
	getToken,
	type StoredUser,
} from '../../shared/utils/storage';

export function getStoredUser(): StoredUser | null {
	return getAuthUser<StoredUser>();
}

export function hasToken(): boolean {
	return Boolean(getToken());
}

type WithPerms =
	| { permissions?: string[] | null; role?: string | null }
	| null
	| undefined;

// ─── Kiểm tra quyền theo tập permissions "resource:action" trả về khi đăng nhập ──
// Quy ước: 'system:manage' là superuser; 'resource:manage' bao mọi action của resource.
export function hasPermission(user: WithPerms, key: string): boolean {
	const perms = user?.permissions;
	if (!perms || !perms.length) return false;
	if (perms.includes('system:manage')) return true;
	if (perms.includes(key)) return true;
	const [resource] = key.split(':');
	return resource ? perms.includes(`${resource}:manage`) : false;
}

export function hasAnyPermission(user: WithPerms, keys: string[]): boolean {
	return keys.some((k) => hasPermission(user, k));
}

// Phiên đăng nhập được cấp TRƯỚC khi backend trả `permissions` (nâng cấp giữa chừng)
// -> chưa có mảng quyền. Dự phòng theo tên vai trò để admin không bị khoá khỏi /admin.
function isLegacyAdminSession(user: WithPerms): boolean {
	if (user?.permissions && user.permissions.length) return false;
	const roleName = (user?.role ?? '').toLowerCase();
	return (
		roleName === 'admin' ||
		roleName.includes('quản trị') ||
		roleName.includes('quan tri') ||
		roleName.includes('giám đốc') ||
		roleName.includes('giam_doc') ||
		roleName.includes('director')
	);
}

// Được vào khu vực /admin
export function canAccessAdminPanel(user: WithPerms): boolean {
	return (
		hasPermission(user, 'admin_panel:access') || isLegacyAdminSession(user)
	);
}

export function defaultPath(): string {
	return canAccessAdminPanel(getStoredUser()) ? '/admin' : '/user';
}
