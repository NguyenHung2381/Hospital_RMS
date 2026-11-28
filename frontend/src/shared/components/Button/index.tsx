import React from 'react';
import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'warning' | 'danger';
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
	// Mặc định 'button': nút trong <form> không vô tình submit. Cần submit thì truyền type='submit'.
	type = 'button',
	...props
}: ButtonProps) {
	// Nút chỉ có icon: giữ tên (aria-label / title) thành chữ ẩn để nơi cần hiện nhãn
	// (thanh nút đầu trang trên điện thoại, global.css [data-page-actions]) bật lên.
	const iconOnlyLabel = !children && icon ? (props['aria-label'] ?? props.title) : undefined;
	return (
		<button
			type={type}
			className={[styles.btn, styles[variant], styles[size], className]
				.filter(Boolean)
				.join(' ')}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			{...props}
		>
			{loading ? (
				<span
					className={styles.spinner}
					aria-hidden='true'
				/>
			) : icon ? (
				<span className={styles.icon}>{icon}</span>
			) : null}
			{children}
			{iconOnlyLabel && (
				<span
					className={styles.iconOnlyLabel}
					aria-hidden='true'
				>
					{iconOnlyLabel}
				</span>
			)}
		</button>
	);
}
