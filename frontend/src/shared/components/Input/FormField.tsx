import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../../utils/cx';
import m from '../Modal/Modal.module.css';

/** Nhóm "nhãn + ô nhập + lỗi" chuẩn trong form (style ở Modal.module.css). */
export function FormField({
	label,
	required,
	error,
	hint,
	htmlFor,
	className,
	style,
	children,
}: {
	label: ReactNode;
	required?: boolean;
	error?: ReactNode;
	/** Ghi chú nhỏ dưới ô nhập (ẩn khi đang báo lỗi). */
	hint?: ReactNode;
	htmlFor?: string;
	className?: string;
	style?: CSSProperties;
	children: ReactNode;
}) {
	return (
		<div
			className={cx(m.formGroup, className)}
			style={style}
		>
			<label
				className={m.formLabel}
				htmlFor={htmlFor}
			>
				{label}
				{required && <span className={m.required}> *</span>}
			</label>
			{children}
			{error && <div className={m.fieldError}>{error}</div>}
			{!error && hint && <div className={m.formHint}>{hint}</div>}
		</div>
	);
}
