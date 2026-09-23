import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';
import { cx } from '@/shared/utils/cx';

interface EmptyStateProps {
	icon?: ReactNode;
	title: ReactNode;
	desc?: ReactNode;
	/** Nút hành động phụ (ví dụ "Cấp tài khoản"). */
	action?: ReactNode;
	className?: string;
}

/**
 * Khối "chưa có dữ liệu" / "không tìm thấy kết quả" dùng chung cho các trang danh sách.
 */
export function EmptyState({
	icon,
	title,
	desc,
	action,
	className,
}: EmptyStateProps) {
	return (
		<div className={cx(styles.root, className)}>
			{icon && <div className={styles.icon}>{icon}</div>}
			<div className={styles.title}>{title}</div>
			{desc && <div className={styles.desc}>{desc}</div>}
			{action && <div className={styles.action}>{action}</div>}
		</div>
	);
}

interface TableEmptyProps extends EmptyStateProps {
	/** Số cột của bảng để căn `colSpan`. */
	colSpan: number;
}

/** `EmptyState` bọc sẵn trong `<tr><td colSpan>` để nhét vào `<tbody>`. */
export function TableEmpty({ colSpan, ...rest }: TableEmptyProps) {
	return (
		<tr>
			<td colSpan={colSpan}>
				<EmptyState {...rest} />
			</td>
		</tr>
	);
}
