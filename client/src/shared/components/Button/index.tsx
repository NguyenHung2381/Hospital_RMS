import React from 'react';
import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	loading?: boolean;
	icon?: React.ReactNode;
}

export function Button({
	variant = 'primary',
	size = 'md',
	loading = false,
	icon,
	children,
	disabled,
	className,
	...props
}: ButtonProps) {
	return (
		<button
			className={[styles.btn, styles[variant], styles[size], className]
				.filter(Boolean)
				.join(' ')}
			disabled={disabled || loading}
			{...props}
		>
			{loading ? (
				<span className={styles.spinner} />
			) : icon ? (
				<span className={styles.icon}>{icon}</span>
			) : null}
			{children}
		</button>
	);
}
