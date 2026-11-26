import type { ReactNode } from 'react';
import styles from './PortalHomeHeader.module.css';

type Props = {
	label: string;
	title: string;
	detail?: ReactNode;
	children?: ReactNode;
};

export default function PortalHomeHeader({ label, title, detail, children }: Props) {
	return (
		<header className={styles.header}>
			<div>
				<p className={styles.label}>{label}</p>
				<h1 className={styles.title}>{title}</h1>
				{detail && <p className={styles.detail}>{detail}</p>}
			</div>
			{children && <div className={styles.side}>{children}</div>}
		</header>
	);
}
