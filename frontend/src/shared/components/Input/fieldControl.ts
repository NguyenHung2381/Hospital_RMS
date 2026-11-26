import type { ComponentType } from 'react';

/**
 * Thuộc tính truy cập mà <FormField> tự gắn vào ô nhập con.
 * Component ô nhập tự viết nhận các prop này và chuyển xuống control thật
 * (thẻ <input> / <button> có thể focus), rồi đánh dấu bằng `markFieldControl`.
 */
export interface FieldControlProps {
	id?: string;
	'aria-label'?: string;
	'aria-describedby'?: string;
	'aria-invalid'?: boolean | 'true' | 'false';
	'aria-required'?: boolean | 'true' | 'false';
}

const FIELD_CONTROL = '__formFieldControl';

/** Đánh dấu component nhận và chuyển tiếp `id` / `aria-*` — FormField chỉ gắn vào component đã đánh dấu. */
export function markFieldControl<P>(component: ComponentType<P>) {
	(component as unknown as Record<string, boolean>)[FIELD_CONTROL] = true;
}

export function isFieldControl(type: unknown): boolean {
	return (
		typeof type === 'function' &&
		(type as unknown as Record<string, boolean | undefined>)[FIELD_CONTROL] === true
	);
}
