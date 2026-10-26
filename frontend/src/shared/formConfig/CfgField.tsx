import { cloneElement, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { FormField } from '../components/Input/FormField';
import m from '../components/Modal/Modal.module.css';
import { cx } from '../utils/cx';
import type { FormConfig } from './useFormConfig';

type NativeInputProps = {
	placeholder?: string;
	maxLength?: number;
	minLength?: number;
	min?: number | string;
	max?: number | string;
	className?: string;
	'aria-invalid'?: boolean;
};

/**
 * Class CSS của trang tự vẽ form (cổng công khai, cổng nhân viên...) — truyền vào
 * thì CfgField / CustomFields vẽ theo bộ class này thay cho FormField của modal.
 */
export interface FieldClasses {
	group?: string;
	label?: string;
	required?: string;
	hint?: string;
	error?: string;
	/** Thêm vào ô nhập khi có lỗi */
	inputError?: string;
	/** Kiểu <label>Nhãn<input/></label> (form cổng nhân viên) — `group` gắn lên chính label */
	labelWraps?: boolean;
}

/** Khung "nhãn + ô nhập + ghi chú + lỗi" — FormField chuẩn, hoặc theo `classes` của trang. */
export function FieldShell({
	classes,
	label,
	required,
	hint,
	error,
	htmlFor,
	className,
	style,
	children,
}: {
	classes?: FieldClasses;
	label: ReactNode;
	required?: boolean;
	hint?: ReactNode;
	error?: ReactNode;
	htmlFor?: string;
	className?: string;
	style?: CSSProperties;
	children: ReactNode;
}) {
	if (!classes)
		return (
			<FormField
				htmlFor={htmlFor}
				label={label}
				required={required}
				error={error}
				className={className}
				style={style}
			>
				{children}
				{hint && <div className={m.formHint}>{hint}</div>}
			</FormField>
		);
	// Nhãn bọc ô nhập ⇒ không cần htmlFor (id lạ còn làm mất liên kết với ô bên trong)
	if (classes.labelWraps)
		return (
			<label
				className={cx(classes.group, className)}
				style={style}
			>
				<span className={classes.label}>
					{label}
					{required && <span className={classes.required}> *</span>}
				</span>
				{children}
				{hint && <span className={classes.hint}>{hint}</span>}
				{error && <span className={classes.error}>{error}</span>}
			</label>
		);
	return (
		<div
			className={cx(classes.group, className)}
			style={style}
		>
			<label
				className={classes.label}
				htmlFor={htmlFor}
			>
				{label}
				{required && <span className={classes.required}> *</span>}
			</label>
			{children}
			{hint && <span className={classes.hint}>{hint}</span>}
			{error && <span className={classes.error}>{error}</span>}
		</div>
	);
}

/**
 * FormField theo Cấu hình form: ẩn nếu admin tắt, thay nhãn / bắt buộc, tiêm
 * placeholder + giới hạn độ dài / min-max vào ô nhập gốc (input, textarea).
 * Chưa tải xong cấu hình thì hiện đúng như props truyền vào (mặc định trong code).
 */
export function CfgField({
	cfg,
	name,
	label,
	required,
	forceRequired,
	hint,
	error,
	htmlFor,
	className,
	style,
	classes,
	children,
}: {
	cfg: FormConfig;
	name: string;
	label: ReactNode;
	required?: boolean;
	/** Bắt buộc theo nghiệp vụ lúc này (vd ngày sinh khi đã nhập CCCD) — luôn hiện dấu * */
	forceRequired?: boolean;
	/** Ghi chú mặc định — admin đặt ghi chú thì thay */
	hint?: ReactNode;
	error?: ReactNode;
	htmlFor?: string;
	className?: string;
	style?: CSSProperties;
	classes?: FieldClasses;
	children: ReactNode;
}) {
	const f = cfg.field(name);
	if (f && !f.visible) return null;

	let input = children;
	if (isValidElement(children) && typeof children.type === 'string') {
		const el = children as ReactElement<NativeInputProps>;
		const extra: NativeInputProps = {};
		if (error && classes?.inputError) {
			extra.className = cx(el.props.className, classes.inputError);
			extra['aria-invalid'] = true;
		}
		if (f) {
			if (f.placeholder) extra.placeholder = f.placeholder;
			const r = f.rules;
			if (r.maxLength) extra.maxLength = Math.min(r.maxLength, el.props.maxLength ?? Infinity);
			if (r.minLength) extra.minLength = r.minLength;
			if (f.type === 'number') {
				if (r.min !== undefined) extra.min = r.min;
				if (r.max !== undefined) extra.max = r.max;
			}
		}
		input = cloneElement(el, extra);
	}

	return (
		<FieldShell
			classes={classes}
			htmlFor={htmlFor ?? name}
			label={f?.labelSet ? f.label : label}
			required={(f ? f.required : required) || forceRequired}
			hint={f?.hint || hint}
			error={error}
			className={className}
			style={style}
		>
			{input}
		</FieldShell>
	);
}

/** Bọc khối không phải FormField (nhóm nút chọn, card...) — ẩn khi admin tắt trường. */
export function CfgVisible({ cfg, name, children }: { cfg: FormConfig; name: string; children: ReactNode }) {
	return cfg.visible(name) ? <>{children}</> : null;
}
