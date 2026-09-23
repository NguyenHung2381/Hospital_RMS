// Nguồn chân lý duy nhất cho việc kiểm tra quyền "resource:action" phía
// client. Trước đây logic này bị lặp lại 3 nơi (AdminLayout, UserLayout,
// app/router/authHelpers) và lệch nhau (UserLayout thiếu quy tắc
// "resource:manage" bao mọi action) — gom về đây để chỉ sửa một chỗ.
// Đây CHỈ LÀ tiện ích giao diện (ẩn/hiện) — quyền thật luôn do backend kiểm
// tra ở mọi endpoint.

export interface PermissionUser {
	permissions?: string[] | null;
	role?: string | null;
}

// Quy ước: 'system:manage' là superuser; 'resource:manage' bao mọi action của resource.
export function hasPermission(
	user: PermissionUser | null | undefined,
	key?: string | null,
): boolean {
	if (!key) return true;
	const perms = user?.permissions;
	if (!perms || !perms.length) return false;
	if (perms.includes('system:manage')) return true;
	if (perms.includes(key)) return true;
	const [resource] = key.split(':');
	return resource ? perms.includes(`${resource}:manage`) : false;
}

export function hasAnyPermission(
	user: PermissionUser | null | undefined,
	keys: string[],
): boolean {
	return keys.some((key) => hasPermission(user, key));
}

// Phiên đăng nhập được cấp TRƯỚC khi backend trả `permissions` (nâng cấp giữa chừng)
// -> chưa có mảng quyền. Dự phòng theo tên vai trò để admin không bị khoá khỏi /admin.
function isLegacyAdminSession(user: PermissionUser | null | undefined): boolean {
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

export function canAccessAdminPanel(user: PermissionUser | null | undefined): boolean {
	return hasPermission(user, 'admin_panel:access') || isLegacyAdminSession(user);
}
