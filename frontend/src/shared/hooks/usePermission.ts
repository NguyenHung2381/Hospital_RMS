import { getStoredUser, type StoredUser } from '../utils/storage';
import { hasPermission, hasAnyPermission, canAccessAdminPanel } from '../utils/permissions';

export interface UsePermissionResult {
	user: StoredUser | null;
	/** true nếu user có quyền `key` (vd "topics:create"), hoặc `key` rỗng/undefined. */
	has: (key?: string | null) => boolean;
	/** true nếu user có ít nhất một trong các quyền truyền vào. */
	hasAny: (keys: string[]) => boolean;
	canAccessAdminPanel: boolean;
}

// Đọc quyền của user hiện tại từ storage (đồng bộ — không có global store nên
// đọc lại mỗi lần gọi, giống cách các layout đang làm). Đây CHỈ LÀ tiện ích
// giao diện để ẩn/hiện; quyền thật luôn do backend kiểm tra ở mọi endpoint.
export function usePermission(): UsePermissionResult {
	const user = getStoredUser<StoredUser>();

	return {
		user,
		has: (key) => hasPermission(user, key),
		hasAny: (keys) => hasAnyPermission(user, keys),
		canAccessAdminPanel: canAccessAdminPanel(user),
	};
}
