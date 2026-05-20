import React from 'react';
import styles from '../../pages/Topic.module.css';

export function Badge({
	cls,
	dot,
	children,
}: {
	cls: string;
	dot?: boolean;
	children: React.ReactNode;
}) {
	return (
		<span className={`${styles.badge} ${styles[cls as keyof typeof styles]}`}>
			{dot && <span className={styles.badgeDot} />}
			{children}
		</span>
	);
}
