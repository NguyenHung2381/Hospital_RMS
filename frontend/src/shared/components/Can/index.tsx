import type { ReactNode } from 'react';
import { usePermission } from '../../hooks/usePermission';

export interface CanProps {
	/** Quyền đơn, vd "topic.approve" / "topics:create". */
	permission?: string;
	/** Hiện nếu user có ÍT NHẤT MỘT quyền trong danh sách. */
	anyOf?: string[];
	children: ReactNode;
	/** Hiện thay thế khi không đủ quyền (mặc định: không hiện gì). */
	fallback?: ReactNode;
}

// <Can permission="topic.approve">...</Can> — CHỈ LÀ tiện ích ẩn/hiện giao
// diện, quyền thật luôn do backend kiểm tra ở mọi endpoint (BR30).
export function Can({ permission, anyOf, children, fallback = null }: CanProps) {
	const { has, hasAny } = usePermission();
	const allowed = anyOf ? hasAny(anyOf) : has(permission);
	return allowed ? <>{children}</> : <>{fallback}</>;
}

export default Can;
