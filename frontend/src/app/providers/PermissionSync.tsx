import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiClient } from '../../shared/api/axios';
import { getToken, updateStoredUser, type StoredUser } from '../../shared/utils/storage';
import { useRealtimeUpdate } from '../../layouts/hooks/useRealtime';

type MeResponse = Pick<
	StoredUser,
	'permissions' | 'permission_scopes' | 'role_id' | 'department_id' | 'twofa_state' | 'twofa_deadline'
>;

// Quyền (và trạng thái 2FA bắt buộc) lưu trong storage chỉ được ghi lúc đăng nhập — admin đổi vai trò /
// quyền của một người đang đăng nhập, hoặc nâng cấp mô hình phân quyền, thì
// menu/nút của họ vẫn theo quyền cũ tới lần đăng nhập sau (tối đa hạn refresh
// token). Component này làm mới từ GET /users/me khi mở ứng dụng và mỗi khi
// server báo vai trò / tài khoản thay đổi (SSE), rồi dựng lại cây giao diện
// nếu quyền thực sự khác. Backend vẫn luôn tự kiểm tra quyền ở mọi API.
export function PermissionSync({ children }: { children: ReactNode }) {
	const [version, setVersion] = useState(0);

	const refresh = useCallback(() => {
		if (!getToken()) return;
		apiClient
			.get<MeResponse>('/users/me')
			.then((me) => {
				const changed = updateStoredUser({
					permissions: me.permissions ?? [],
					permission_scopes: me.permission_scopes ?? {},
					role_id: me.role_id ?? null,
					department_id: me.department_id ?? null,
					twofa_state: me.twofa_state ?? null,
					twofa_deadline: me.twofa_deadline ?? null,
				});
				if (changed) setVersion((v) => v + 1);
			})
			.catch(() => {
				// Hết phiên / mất mạng: interceptor của apiClient tự xử lý 401.
			});
	}, []);

	useEffect(refresh, [refresh]);
	// system_setting: bật/tắt "Bắt buộc 2FA cho quản trị" đổi twofa_state
	useRealtimeUpdate(['role', 'user', 'system_setting'], refresh);

	return <Fragment key={version}>{children}</Fragment>;
}
