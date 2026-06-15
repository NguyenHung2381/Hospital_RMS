import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
	defaultPath,
	getStoredUser,
	hasToken,
	isAdmin,
	isMember,
} from './authHelpers';

export function RequireAuth({ children }: { children: React.ReactNode }) {
	const location = useLocation();
	if (!hasToken()) {
		const from = location.pathname + location.search;
		return (
			<Navigate
				to={`/login?from=${encodeURIComponent(from)}`}
				replace
			/>
		);
	}
	return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
	if (!hasToken())
		return (
			<Navigate
				to='/login'
				replace
			/>
		);
	if (!isAdmin(getStoredUser()))
		return (
			<Navigate
				to='/user'
				replace
			/>
		);
	return <>{children}</>;
}

export function RequireNotMember({ children }: { children: React.ReactNode }) {
	if (!hasToken())
		return (
			<Navigate
				to='/login'
				replace
			/>
		);
	if (isMember(getStoredUser()))
		return (
			<Navigate
				to='/user'
				replace
			/>
		);
	return <>{children}</>;
}

export function RedirectIfLoggedIn({
	children,
}: {
	children: React.ReactNode;
}) {
	if (hasToken())
		return (
			<Navigate
				to={defaultPath()}
				replace
			/>
		);
	return <>{children}</>;
}

export function RootRedirect() {
	if (!hasToken())
		return (
			<Navigate
				to='/login'
				replace
			/>
		);
	return (
		<Navigate
			to={defaultPath()}
			replace
		/>
	);
}
