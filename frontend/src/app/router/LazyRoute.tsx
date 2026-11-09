import React, { Suspense, useEffect } from 'react';
import PageLoading from '../../shared/components/Loading';

interface LazyRouteProps {
	children: React.ReactNode;
	title?: string;
}

export function LazyRoute({ children, title }: LazyRouteProps) {
	useEffect(() => {
		const appTitle = 'NCKH & Đào tạo – BV HNĐK Nghệ An';
		document.title = title ? `${title} | ${appTitle}` : appTitle;
	}, [title]);
	return <Suspense fallback={<PageLoading />}>{children}</Suspense>;
}
