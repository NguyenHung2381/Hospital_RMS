import type { CSSProperties, ReactNode } from 'react';
import styles from './Badge.module.css';
import { cx } from '@/shared/utils/cx';
import type { BadgeTone } from './badgeTone';

export type { BadgeTone };

interface BadgeProps {
	/** Màu nền/chữ theo bảng tông dùng chung. Mặc định 'gray'. */
	tone?: BadgeTone;
	/** Hiện chấm tròn màu currentColor phía trước nội dung. */
	dot?: boolean;
	/** Ghép thêm class riêng của feature (ví dụ khi cần padding/viền khác). */
	className?: string;
	/** Tinh chỉnh cục bộ (ví dụ margin) — dùng tiết chế. */
	style?: CSSProperties;
	children: ReactNode;
	title?: string;
}

/**
 * Nhãn trạng thái dùng chung. Thay cho ~7 bản `Badge`/`StatusBadge` copy-paste
 * trong các feature. Bảng màu là nguồn chân lý ở `Badge.module.css`.
 */
export function Badge({
	tone = 'gray',
	dot,
	className,
	style,
	children,
	title,
}: BadgeProps) {
	return (
		<span
			className={cx(styles.badge, styles[tone], className)}
			style={style}
			title={title}
		>
			{dot && <span className={styles.dot} />}
			{children}
		</span>
	);
}
