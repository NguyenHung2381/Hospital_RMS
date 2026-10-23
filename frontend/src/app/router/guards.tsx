import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
	blockingSetupPath,
	canSetupTwoFactor,
	defaultPath,
	FORCE_PASSWORD_PATH,
	getStoredUser,
	hasToken,
	isTraineeAccount,
	mustChangePassword,
	traineePathFor,
} from './authHelpers';
import { canAccessAdminPanel, hasPermission } from '../../shared/utils/permissions';
import type { PermissionKey } from '../../shared/types/permissions.generated';

export function RequireAuth({ children }: { children: React.ReactNode }) {
	const location = useLocation();
	if (!hasToken()) {
		const from = location.pathname + location.search;
		return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
	}
	const blocking = blockingSetupPath();
	if (blocking) return <Navigate to={blocking} replace />;
	// Tài khoản học viên không dùng cổng /user — chuyển sang trang tương ứng ở /hoc-vien.
	if (isTraineeAccount() && location.pathname.startsWith('/user'))
		return <Navigate to={traineePathFor(location.pathname) + location.search} replace />;
	return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
	if (!hasToken()) return <Navigate to='/login' replace />;
	const blocking = blockingSetupPath();
	if (blocking) return <Navigate to={blocking} replace />;
	if (!canAccessAdminPanel(getStoredUser()))
		return <Navigate to='/user' replace />;
	return <>{children}</>;
}

// Chặn route theo một quyền cụ thể (resource:action). Không đủ quyền -> về trang mặc định.
export function RequirePermission({
	perm,
	children,
}: {
	perm: PermissionKey;
	children: React.ReactNode;
}) {
	if (!hasToken()) return <Navigate to='/login' replace />;
	const blocking = blockingSetupPath();
	if (blocking) return <Navigate to={blocking} replace />;
	if (!hasPermission(getStoredUser(), perm))
		return <Navigate to={defaultPath()} replace />;
	return <>{children}</>;
}

// Chỉ cho vào màn đổi mật khẩu bắt buộc khi đang đăng nhập VÀ đang bị bắt đổi.
export function RequirePasswordChange({ children }: { children: React.ReactNode }) {
	if (!hasToken()) return <Navigate to='/login' replace />;
	if (!mustChangePassword()) return <Navigate to={defaultPath()} replace />;
	return <>{children}</>;
}

// Màn bật 2FA bắt buộc: cho vào khi tài khoản thuộc diện (đang nhắc hoặc đã quá
// hạn); phải đổi mật khẩu tạm trước nếu còn.
export function RequireTwoFactorSetup({ children }: { children: React.ReactNode }) {
	if (!hasToken()) return <Navigate to='/login' replace />;
	if (mustChangePassword()) return <Navigate to={FORCE_PASSWORD_PATH} replace />;
	if (!canSetupTwoFactor()) return <Navigate to={defaultPath()} replace />;
	return <>{children}</>;
}

export function RedirectIfLoggedIn({ children }: { children: React.ReactNode }) {
	if (hasToken()) return <Navigate to={blockingSetupPath() ?? defaultPath()} replace />;
	return <>{children}</>;
}

export function RootRedirect() {
	if (!hasToken()) return <Navigate to='/login' replace />;
	return <Navigate to={blockingSetupPath() ?? defaultPath()} replace />;
}
