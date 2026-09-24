import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
	canAccessAdminPanel,
	defaultPath,
	getStoredUser,
	hasPermission,
	hasToken,
} from './authHelpers';
import type { PermissionKey } from '../../shared/types/permissions.generated';

export function RequireAuth({ children }: { children: React.ReactNode }) {
	const location = useLocation();
	if (!hasToken()) {
		const from = location.pathname + location.search;
		return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
	}
	return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
	if (!hasToken()) return <Navigate to='/login' replace />;
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
	if (!hasPermission(getStoredUser(), perm))
		return <Navigate to={defaultPath()} replace />;
	return <>{children}</>;
}

export function RedirectIfLoggedIn({ children }: { children: React.ReactNode }) {
	if (hasToken()) return <Navigate to={defaultPath()} replace />;
	return <>{children}</>;
}

export function RootRedirect() {
	if (!hasToken()) return <Navigate to='/login' replace />;
	return <Navigate to={defaultPath()} replace />;
}
