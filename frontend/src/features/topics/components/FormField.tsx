import React from 'react';
import styles from '../pages/Topic.module.css';
import { AlertSvg as IcAlert } from '@/assets/icons';

export function FormField({
	id,
	label,
	required,
	error,
	hint,
	children,
}: {
	id: string;
	label: string;
	required?: boolean;
	error?: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.formGroup}>
			<label
				htmlFor={id}
				className={styles.formLabel}
			>
				{label}
				{required && <span className={styles.formRequired}>*</span>}
			</label>
			{children}
			{error && (
				<span className={styles.formError}>
					<IcAlert />
					{error}
				</span>
			)}
			{!error && hint && <span className={styles.formHint}>{hint}</span>}
		</div>
	);
}
