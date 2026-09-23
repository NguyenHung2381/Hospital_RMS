import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';

// Cache mặc định cho mọi query — feature có thể ghi đè per-query qua options.
// staleTime 30s tránh refetch thừa khi chuyển tab/back nhanh; retry 1 vì phần
// lớn API lỗi là lỗi nghiệp vụ (400/403/404), không phải lỗi mạng thoáng qua.
function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 30_000,
				retry: 1,
				refetchOnWindowFocus: false,
			},
			mutations: {
				retry: 0,
			},
		},
	});
}

export function QueryProvider({ children }: { children: ReactNode }) {
	const [client] = useState(createQueryClient);
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
