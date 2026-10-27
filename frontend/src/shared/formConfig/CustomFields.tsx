import { useState } from 'react';
import { DatePicker } from '../components/Input/DatePicker';
import { MultiSelect } from '../components/Input/MultiSelect';
import m from '../components/Modal/Modal.module.css';
import { cx } from '../utils/cx';
import { FieldShell, type FieldClasses } from './CfgField';
import type { CustomValues, ResolvedField } from './types';
import type { FormConfig } from './useFormConfig';

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

function CustomInput({
	f,
	value,
	onChange,
	hasError,
	inputClassName,
	inputErrorClassName,
}: {
	f: ResolvedField;
	value: unknown;
	onChange: (v: unknown) => void;
	hasError: boolean;
	inputClassName?: string;
	inputErrorClassName?: string;
}) {
	const id = `cf-${f.key}`;
	const cls = cx(inputClassName ?? m.formInput, hasError && (inputErrorClassName ?? m.inputError));
	const placeholder = f.placeholder ?? undefined;
	switch (f.type) {
		case 'textarea':
			return (
				<textarea
					id={id}
					className={cls}
					rows={3}
					value={str(value)}
					placeholder={placeholder}
					maxLength={f.rules.maxLength}
					onChange={(e) => onChange(e.target.value)}
				/>
			);
		case 'number':
			return (
				<input
					id={id}
					type="number"
					className={cls}
					value={str(value)}
					placeholder={placeholder}
					min={f.rules.min}
					max={f.rules.max}
					step={f.rules.integer ? 1 : 'any'}
					onChange={(e) => onChange(e.target.value)}
				/>
			);
		case 'date':
			return (
				<DatePicker
					id={id}
					value={str(value)}
					onChange={onChange}
					placeholder={placeholder}
					hasError={hasError}
				/>
			);
		case 'select':
			return (
				<select
					id={id}
					className={cls}
					value={str(value)}
					onChange={(e) => onChange(e.target.value)}
				>
					<option value="">{placeholder ?? '— Chọn —'}</option>
					{(f.options ?? []).map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
			);
		case 'multiselect':
			return (
				<MultiSelect
					options={(f.options ?? []).map((o) => ({
						id: o.value,
						label: o.label,
					}))}
					selected={new Set(Array.isArray(value) ? (value as string[]) : [])}
					onChange={(next) => onChange([...next])}
					placeholder={placeholder ?? '— Chọn —'}
				/>
			);
		case 'checkbox':
			return (
				<label
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						fontSize: 'var(--font-size-sm)',
						cursor: 'pointer',
					}}
				>
					<input
						id={id}
						type="checkbox"
						checked={value === true}
						onChange={(e) => onChange(e.target.checked)}
					/>
					{placeholder ?? 'Đồng ý'}
				</label>
			);
		default:
			return (
				<input
					id={id}
					type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'}
					className={cls}
					value={str(value)}
					placeholder={placeholder}
					maxLength={f.rules.maxLength}
					onChange={(e) => onChange(e.target.value)}
				/>
			);
	}
}

/**
 * Trường tùy chỉnh admin thêm ở Cấu hình form — đặt cuối form, gửi `custom`
 * cùng payload. Không có trường nào thì không vẽ gì.
 */
export function CustomFields({
	cfg,
	value,
	onChange,
	errors,
	title = 'Thông tin bổ sung',
	sectionClassName,
	inputClassName,
	classes,
}: {
	cfg: FormConfig;
	value: CustomValues;
	onChange: (next: CustomValues) => void;
	errors?: Record<string, string | undefined>;
	/** null = không vẽ tiêu đề nhóm */
	title?: string | null;
	sectionClassName?: string;
	inputClassName?: string;
	/** Class của trang tự vẽ form (xem FieldClasses) */
	classes?: FieldClasses;
}) {
	// Ô đã sửa sau lần kiểm gần nhất thì ẩn lỗi của ô đó (như ô có sẵn). Dựa vào số lần
	// gọi cfg.validate chứ không vào `errors`: form xóa lỗi ô khác cũng tạo object mới
	const [edited, setEdited] = useState({
		at: cfg.validated,
		keys: [] as string[],
	});
	const editedKeys = edited.at === cfg.validated ? edited.keys : [];
	const errorOf = (key: string) => (editedKeys.includes(key) ? undefined : errors?.[key]);
	if (!cfg.custom.length) return null;
	return (
		<>
			{title && <div className={sectionClassName}>{title}</div>}
			{cfg.custom.map((f) => (
				<FieldShell
					key={f.key}
					classes={classes}
					htmlFor={`cf-${f.key}`}
					label={f.label}
					required={f.required}
					hint={f.hint}
					error={errorOf(f.key)}
				>
					<CustomInput
						f={f}
						value={value[f.key]}
						onChange={(v) => {
							if (errors?.[f.key] && !editedKeys.includes(f.key))
								setEdited({ at: cfg.validated, keys: [...editedKeys, f.key] });
							onChange({ ...value, [f.key]: v });
						}}
						hasError={!!errorOf(f.key)}
						inputClassName={inputClassName}
						inputErrorClassName={classes?.inputError}
					/>
				</FieldShell>
			))}
		</>
	);
}
