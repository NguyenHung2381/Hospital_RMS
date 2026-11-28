import { useQuery } from '@tanstack/react-query';
import { signingApi } from '../api/signingApi';

export const SIGNING_STATUS_KEY = ['signing', 'my-status'] as const;

/**
 * Người đang đăng nhập có chứng thư cá nhân / bệnh viện đã cấu hình chứng thư ký giấy chứng
 * nhận chưa. Chỉ gọi khi màn hình thực sự có lựa chọn ký số (`enabled`).
 */
export function useSigningStatus(enabled = true) {
	return useQuery({
		queryKey: SIGNING_STATUS_KEY,
		queryFn: signingApi.myStatus,
		enabled,
		staleTime: 60_000,
	});
}
