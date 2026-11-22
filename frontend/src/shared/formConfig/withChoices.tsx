import { isValidElement, type ChangeEventHandler, type ReactElement, type ReactNode, type Ref } from 'react';
import type { ResolvedField } from './types';

type NativeProps = {
	id?: string;
	name?: string;
	className?: string;
	style?: React.CSSProperties;
	value?: unknown;
	placeholder?: string;
	disabled?: boolean;
	onChange?: ChangeEventHandler<HTMLSelectElement>;
	onBlur?: React.FocusEventHandler<HTMLSelectElement>;
	ref?: Ref<HTMLSelectElement>;
	'aria-invalid'?: boolean;
	'aria-label'?: string;
};

/**
 * Admin đổi ô chữ thành danh sách chọn (Cấu hình form → choices): thay `<input>` /
 * `<textarea>` gốc bằng `<select>` giữ nguyên id, value, onChange, class — form không
 * phải sửa gì. Dòng đầu lấy chữ gợi ý của ô (placeholder). Giá trị cũ không có trong
 * danh sách vẫn hiện để người dùng thấy và chọn lại.
 * Trường không có choices / phần tử không phải ô nhập gốc ⇒ trả nguyên.
 */
export function withChoices(f: ResolvedField | undefined, el: ReactNode): ReactNode {
	if (!f?.choices || !isValidElement(el) || (el.type !== 'input' && el.type !== 'textarea')) return el;
	const p = (el as ReactElement<NativeProps>).props;
	const value = p.value === undefined || p.value === null ? '' : String(p.value);
	const options = f.options ?? [];
	const legacy = value !== '' && !options.some((o) => o.value === value);
	return (
		<select
			id={p.id}
			name={p.name}
			className={p.className}
			style={p.style}
			value={value}
			disabled={p.disabled}
			onChange={p.onChange}
			onBlur={p.onBlur}
			ref={p.ref}
			aria-invalid={p['aria-invalid']}
			aria-label={p['aria-label']}
		>
			<option value=''>{p.placeholder || '— Chọn —'}</option>
			{legacy && <option value={value}>{value} (giá trị cũ — vui lòng chọn lại)</option>}
			{options.map((o) => (
				<option
					key={o.value}
					value={o.value}
				>
					{o.label}
				</option>
			))}
		</select>
	);
}
