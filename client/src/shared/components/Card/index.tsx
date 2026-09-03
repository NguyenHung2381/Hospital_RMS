import type { ElementType, ReactNode } from 'react';
import styles from './Card.module.css';
import { cx } from '@/shared/utils/cx';

interface CardProps {
	as?: ElementType;
	className?: string;
	children: ReactNode;
}

/** Khung card có viền dùng chung. Ghép với `Card.Header` / `Card.Body`. */
export function Card({ as: Tag = 'section', className, children }: CardProps) {
	return <Tag className={cx(styles.card, className)}>{children}</Tag>;
}

interface CardHeaderProps {
	icon?: ReactNode;
	title: ReactNode;
	sub?: ReactNode;
	actions?: ReactNode;
	className?: string;
}

function CardHeader({ icon, title, sub, actions, className }: CardHeaderProps) {
	return (
		<div className={cx(styles.header, className)}>
			{icon && <div className={styles.headerIcon}>{icon}</div>}
			<div className={styles.headerText}>
				<div className={styles.title}>{title}</div>
				{sub && <div className={styles.sub}>{sub}</div>}
			</div>
			{actions && <div className={styles.actions}>{actions}</div>}
		</div>
	);
}

interface CardBodyProps {
	className?: string;
	children: ReactNode;
}

function CardBody({ className, children }: CardBodyProps) {
	return <div className={cx(styles.body, className)}>{children}</div>;
}

Card.Header = CardHeader;
Card.Body = CardBody;
