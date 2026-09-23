import React from 'react';

interface EmptyLayoutProps {
	children: React.ReactNode;
}

export default function EmptyLayout({ children }: EmptyLayoutProps) {
	return <div style={{ minHeight: '100vh' }}>{children}</div>;
}
