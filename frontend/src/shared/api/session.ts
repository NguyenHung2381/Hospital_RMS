import { clearAuth, getStoredUser, getToken } from '../utils/storage';
import { refreshQueued } from './interceptors';

// Access token chỉ nằm trong bộ nhớ (shared/utils/storage.ts) nên mất khi tải
// lại trang / mở tab mới. Còn thông tin user (đã đăng nhập ở trình duyệt này)
// thì xin access token mới từ refresh token trong cookie TRƯỚC khi dựng router —
// guard (app/router/guards.tsx) đọc getToken() đồng bộ.
export function needsSessionRestore(): boolean {
	return !getToken() && Boolean(getStoredUser());
}

export async function restoreSession(): Promise<void> {
	if (!needsSessionRestore()) return;
	try {
		// null = cookie hết hạn / bị thu hồi / thuộc tài khoản khác ⇒ về màn đăng nhập
		if (!(await refreshQueued())) clearAuth();
	} catch {
		// Mất mạng / máy chủ chưa chạy: giữ thông tin user để lần tải sau thử lại;
		// chưa có token nên guard đưa về màn đăng nhập.
	}
}
