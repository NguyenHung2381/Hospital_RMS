import { formatDateOr } from '../utils/formatDate';
import type { CustomValues, ResolvedField } from './types';
import type { FormConfig } from './useFormConfig';

/** Ô có giá trị để hiển thị (bỏ rỗng / danh sách trống) */
export const hasValue = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);

/** Có giá trị tùy chỉnh nào để hiện không (ẩn luôn khung / tiêu đề nhóm khi trống) */
export const hasCustomValues = (cfg: FormConfig, data?: CustomValues | null) =>
	!!data && (cfg.resolved?.labels ?? []).some((f) => hasValue(data[f.key]));

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
