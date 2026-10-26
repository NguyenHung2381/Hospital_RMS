import { useMemo, useState } from 'react';
import m from '../../../shared/components/Modal/Modal.module.css';
import { CfgField } from '../../../shared/formConfig/CfgField';
import { CustomFields } from '../../../shared/formConfig/CustomFields';
import { resolveForm } from '../../../shared/formConfig/fieldRules';
import type { CustomValues, FormDefinition, FormOverride, ResolvedField } from '../../../shared/formConfig/types';
import { configFromResolved } from '../../../shared/formConfig/useFormConfig';
import { cx } from '../../../shared/utils/cx';
import s from '../pages/FormConfigs.module.css';

// Ô mẫu cho trường có sẵn — chỉ để nhìn bố cục, nhãn, bắt buộc, gợi ý. Trả
// thẳng phần tử gốc (không bọc component) để CfgField tiêm được placeholder/maxLength.
function sampleInput(f: ResolvedField, value: string, onChange: (v: string) => void) {
	if (f.type === 'select')
		return (
			<select
				id={f.key}
				className={m.formInput}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			>
				<option value=''>{f.dynamic ? '— Danh sách lấy từ danh mục —' : '— Chọn —'}</option>
				{(f.options ?? []).map((o) => (
					<option
						key={o.value}
						value={o.value}
					>
						{o.label}
					</option>
				))}
			</select>
		);
	if (f.type === 'textarea')
		return (
			<textarea
				id={f.key}
				className={m.formInput}
				rows={2}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
		);
	return (
		<input
			id={f.key}
			className={m.formInput}
			type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
			value={value}
			onChange={(e) => onChange(e.target.value)}
		/>
	);
}

/** Xem trước form theo cấu hình đang sửa (chưa cần lưu) + thử bấm kiểm tra. */
export function FormPreview({ form, draft }: { form: FormDefinition; draft: FormOverride }) {
	const [variant, setVariant] = useState(form.variants[0].key);
	const [values, setValues] = useState<Record<string, string>>({});
	const [custom, setCustom] = useState<CustomValues>({});
	const [errors, setErrors] = useState<Record<string, string> | null>(null);
	const resolved = useMemo(() => resolveForm(form, draft, variant), [form, draft, variant]);
	const cfg = useMemo(() => configFromResolved(resolved), [resolved]);
	const fields = form.fields.map((f) => resolved.fields[f.key]).filter(Boolean);

	const check = () => {
		const all = Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? '']));
		setErrors(cfg.validate(all, custom));
	};

	return (
		<div className={s.preview}>
			<div className={s.previewBar}>
				{form.variants.map((v) => (
					<button
						key={v.key}
						type='button'
						className={cx(s.variantChip, v.key === variant && s.variantChipOn)}
						onClick={() => {
							setVariant(v.key);
							setErrors(null);
						}}
					>
						{v.label}
					</button>
				))}
			</div>
			<div className={s.previewBody}>
				{fields.map((f) => (
					<CfgField
						key={f.key}
						cfg={cfg}
						name={f.key}
						label={f.label}
						error={errors?.[f.key]}
					>
						{sampleInput(f, values[f.key] ?? '', (v) => setValues((x) => ({ ...x, [f.key]: v })))}
					</CfgField>
				))}
				<CustomFields
					cfg={cfg}
					value={custom}
					onChange={setCustom}
					errors={errors ?? undefined}
					sectionClassName={s.previewSection}
				/>
			</div>
			<div className={s.previewFoot}>
				{errors && (
					<span className={Object.keys(errors).length ? s.previewBad : s.previewOk}>
						{Object.keys(errors).length ? `${Object.keys(errors).length} lỗi` : 'Hợp lệ'}
					</span>
				)}
				<button
					type='button'
					className={s.expandBtn}
					onClick={check}
				>
					Thử kiểm tra
				</button>
			</div>
		</div>
	);
}
