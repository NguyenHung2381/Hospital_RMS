import React, { Suspense, useEffect } from 'react';
import PageLoading from '../../shared/components/Loading';

interface LazyRouteProps {
	children: React.ReactNode;
	title?: string;
}

export function LazyRoute({ children, title }: LazyRouteProps) {
	useEffect(() => {
		document.title = title ? `${title} | NCKH – Đào tạo – CME` : 'NCKH – Đào tạo – CME';
	}, [title]);
	return <Suspense fallback={<PageLoading />}>{children}</Suspense>;
}
