import {
	getStoredUser as getAuthUser,
	getToken,
	type StoredUser,
} from '../../shared/utils/storage';
import {
	hasPermission,
	hasAnyPermission,
	canAccessAdminPanel,
} from '../../shared/utils/permissions';

export function getStoredUser(): StoredUser | null {
	return getAuthUser<StoredUser>();
}

export function hasToken(): boolean {
	return Boolean(getToken());
}

// Kiểm tra quyền theo tập permissions "resource:action" trả về khi đăng nhập.
// Logic thật nằm ở shared/utils/permissions.ts (dùng chung với usePermission/Can
// và các layout) — re-export ở đây để không phá vỡ các chỗ đang import từ authHelpers.
export { hasPermission, hasAnyPermission, canAccessAdminPanel };

export function defaultPath(): string {
	return canAccessAdminPanel(getStoredUser()) ? '/admin' : '/user';
}
