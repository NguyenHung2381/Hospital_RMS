import { cx } from '../utils/cx';
import s from './CustomFieldsView.module.css';
import { formatCustomValue } from './format';
import type { CustomValues } from './types';
import type { FormConfig } from './useFormConfig';

/**
 * Giá trị trường tùy chỉnh ở trang chi tiết — vẽ thẳng vào lưới thông tin sẵn
 * có (truyền class của lưới đó). Chỉ hiện trường có giá trị.
 */
const hasValue = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);

export function CustomFieldsView({
	cfg,
	data,
	itemClassName,
	labelClassName,
	valueClassName,
}: {
	cfg: FormConfig;
	data?: CustomValues | null;
	itemClassName?: string;
	labelClassName?: string;
	valueClassName?: string;
}) {
	const labels = cfg.resolved?.labels ?? [];
	if (!data || !labels.length) return null;
	const rows = labels.filter((f) => hasValue(data[f.key]));
	return (
		<>
			{rows.map((f) => (
				<div
					key={f.key}
					className={itemClassName}
				>
					<div className={labelClassName}>{f.label}</div>
					<div className={valueClassName}>{formatCustomValue(f, data[f.key])}</div>
				</div>
			))}
		</>
	);
}

/** Giá trị trường tùy chỉnh trên 1 dòng danh sách (thành viên, CME, đơn xin phép...) — không có gì thì không vẽ. */
export function CustomValuesInline({
	cfg,
	data,
	className,
}: {
	cfg: FormConfig;
	data?: CustomValues | null;
	className?: string;
}) {
	if (!data) return null;
	const rows = (cfg.resolved?.labels ?? []).filter((f) => hasValue(data[f.key]));
	if (!rows.length) return null;
	return (
		<div className={cx(s.inline, className)}>
			{rows.map((f) => (
				<span key={f.key}>
					<b>{f.label}:</b> {formatCustomValue(f, data[f.key])}
				</span>
			))}
		</div>
	);
}
