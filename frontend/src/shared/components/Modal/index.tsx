import { XSvg } from '@/assets/icons';
import React, { useEffect } from 'react';
import styles from './Modal.module.css';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
	open: boolean;
	onClose: () => void;
	title?: string;
	children: React.ReactNode;
	footer?: React.ReactNode;
	size?: ModalSize;
	closeOnBackdrop?: boolean;
}

export function Modal({
	open,
	onClose,
	title,
	children,
	footer,
	size = 'md',
	closeOnBackdrop = true,
}: ModalProps) {
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div
			className={styles.overlay}
			onClick={closeOnBackdrop ? onClose : undefined}
		>
			<div
				className={`${styles.dialog} ${styles[size]}`}
				onClick={(e) => e.stopPropagation()}
			>
				{title && (
					<div className={styles.header}>
						<h3 className={styles.title}>{title}</h3>
						<button
							className={styles.closeBtn}
							onClick={onClose}
							type='button'
						>
							<XSvg style={{ width: 16, height: 16 }} />
						</button>
					</div>
				)}
				<div className={styles.body}>{children}</div>
				{footer && <div className={styles.footer}>{footer}</div>}
			</div>
		</div>
	);
}
