import {
	cloneElement,
	isValidElement,
	useId,
	type CSSProperties,
	type ReactElement,
	type ReactNode,
} from 'react';
import { cx } from '../../utils/cx';
import m from '../Modal/Modal.module.css';
import { isFieldControl, type FieldControlProps } from './fieldControl';

/** Thẻ gốc nhận nhãn được — các thẻ khác (div bọc, label checkbox…) để nguyên. */
const NATIVE_CONTROLS = new Set(['input', 'select', 'textarea']);

type ControlElement = ReactElement<FieldControlProps & { required?: boolean }>;

/** Con là đúng 1 ô nhập gắn được thuộc tính: thẻ input/select/textarea hoặc component đã `markFieldControl`. */
function asControl(children: ReactNode): ControlElement | null {
	if (!isValidElement(children)) return null;
	const { type } = children;
	if (typeof type === 'string' ? NATIVE_CONTROLS.has(type) : isFieldControl(type)) {
		return children as ControlElement;
	}
	return null;
}

/**
 * Nhóm "nhãn + ô nhập + lỗi" chuẩn trong form (style ở Modal.module.css).
 *
 * Tự gắn nhãn: khi con là MỘT ô nhập (`<input>`, `<select>`, `<textarea>`, hoặc
 * DatePicker / TimePicker / SearchableSelect / MultiSelect / PasswordInput), FormField
 * tự tạo `id` (nếu con chưa có), nối `<label htmlFor>` và gắn `aria-invalid`,
 * `aria-describedby` (trỏ tới dòng lỗi), `aria-required`. Nơi gọi không cần truyền gì thêm:
 *
 *   <FormField label='Họ tên' required error={errors.name}>
 *     <input className={m.formInput} value={name} onChange={…} />
 *   </FormField>
 *
 * Con là fragment / nhiều phần tử / div bọc thì giữ hành vi cũ — khi đó truyền `htmlFor`
 * và đặt `id` tương ứng cho ô nhập. `htmlFor` truyền vào luôn được ưu tiên.
 */
export function FormField({
	label,
	required,
	error,
	htmlFor,
	className,
	style,
	children,
}: {
	label: ReactNode;
	required?: boolean;
	error?: ReactNode;
	htmlFor?: string;
	className?: string;
	style?: CSSProperties;
	children: ReactNode;
}) {
	const autoId = useId();
	const errorId = `${autoId}-error`;
	const hasError = !!error;
	const control = asControl(children);

	let content = children;
	let labelFor = htmlFor;
	if (control) {
		const props = control.props;
		const controlId = props.id ?? (htmlFor ? undefined : autoId);
		labelFor = htmlFor ?? controlId;
		const describedBy = [props['aria-describedby'], hasError ? errorId : undefined]
			.filter(Boolean)
			.join(' ');
		const patch: FieldControlProps = {};
		if (controlId && !props.id) patch.id = controlId;
		if (describedBy) patch['aria-describedby'] = describedBy;
		if (hasError && props['aria-invalid'] === undefined) patch['aria-invalid'] = true;
		if (required && !props.required && props['aria-required'] === undefined) {
			patch['aria-required'] = true;
		}
		content = cloneElement(control, patch);
	}

	return (
		<div
			className={cx(m.formGroup, className)}
			style={style}
		>
			<label
				className={m.formLabel}
				htmlFor={labelFor}
			>
				{label}
				{required && <span className={m.required}> *</span>}
			</label>
			{content}
			{hasError && (
				<div
					id={errorId}
					className={m.fieldError}
					role='alert'
				>
					{error}
				</div>
			)}
		</div>
	);
}
