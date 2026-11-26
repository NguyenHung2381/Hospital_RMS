import { AlertSvg, RefreshSvg } from '@/assets/icons';
import { cx } from '@/shared/utils/cx';
import type { ReactNode } from 'react';
import { Button } from '../Button';
import styles from './ErrorState.module.css';

export interface ErrorStateProps {
	/** Mặc định "Không tải được dữ liệu". */
	title?: ReactNode;
	/** Giải thích ngắn / thông điệp lỗi từ máy chủ. */
	desc?: ReactNode;
	/** Có thì hiện nút "Thử lại". */
	onRetry?: () => void;
	retryLabel?: ReactNode;
	/** Đang thử lại — nút hiện spinner và khóa. */
	retrying?: boolean;
	icon?: ReactNode;
	className?: string;
}

/**
 * Khối "không tải được dữ liệu" kèm nút "Thử lại" — cùng phong cách EmptyState.
 *
 *   if (query.isError) return <ErrorState desc={msg} onRetry={() => query.refetch()} retrying={query.isFetching} />;
 */
export function ErrorState({
	title = 'Không tải được dữ liệu',
	desc,
	onRetry,
	retryLabel = 'Thử lại',
	retrying,
	icon,
	className,
}: ErrorStateProps) {
	return (
		<div
			className={cx(styles.root, className)}
			role='alert'
		>
			<div
				className={styles.icon}
				aria-hidden='true'
			>
				{icon ?? <AlertSvg />}
			</div>
			<div className={styles.title}>{title}</div>
			{desc && <div className={styles.desc}>{desc}</div>}
			{onRetry && (
				<div className={styles.action}>
					<Button
						type='button'
						variant='secondary'
						icon={<RefreshSvg />}
						loading={retrying}
						onClick={onRetry}
					>
						{retryLabel}
					</Button>
				</div>
			)}
		</div>
	);
}
