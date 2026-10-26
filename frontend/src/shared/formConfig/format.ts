import { formatDateOr } from '../utils/formatDate';
import type { ResolvedField } from './types';

/** Hiển thị giá trị tùy chỉnh ở trang chi tiết / drawer. */
export function formatCustomValue(f: Pick<ResolvedField, 'type' | 'options'>, v: unknown): string {
	if (v === undefined || v === null || v === '') return '—';
	if (f.type === 'checkbox') return v === true ? 'Có' : 'Không';
	if (f.type === 'date') return formatDateOr(String(v));
	if (f.type === 'select') return f.options?.find((o) => o.value === v)?.label ?? String(v);
	if (f.type === 'multiselect' && Array.isArray(v))
		return v.map((x) => f.options?.find((o) => o.value === x)?.label ?? String(x)).join(', ') || '—';
	if (f.type === 'number') return Number(v).toLocaleString('vi-VN');
	return String(v);
}
