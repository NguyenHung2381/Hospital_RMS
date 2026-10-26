import { useState } from 'react';
import { Toggle } from '../../../shared/components/Input/Toggle';
import { fieldVariants, inVariant } from '../../../shared/formConfig/fieldRules';
import type { FieldOverride, FormDefinition, RegistryField } from '../../../shared/formConfig/types';
import { cx } from '../../../shared/utils/cx';
import s from '../pages/FormConfigs.module.css';
import { cleanRules, hasRules, isOverridden, TYPE_LABEL, whenLabel } from '../utils/formConfigHelpers';
import { RulesEditor } from './RulesEditor';

/** Bỏ khóa rỗng để không lưu override vô nghĩa. */
const clean = (ov: FieldOverride): FieldOverride | undefined => {
	const out: FieldOverride = {};
	if (ov.hidden?.length) out.hidden = ov.hidden;
	if (ov.required !== undefined) out.required = ov.required;
	if (ov.label?.trim()) out.label = ov.label;
	if (ov.placeholder?.trim()) out.placeholder = ov.placeholder;
	if (ov.hint?.trim()) out.hint = ov.hint;
	const rules = ov.rules && cleanRules(ov.rules);
	if (rules) out.rules = rules;
	return Object.keys(out).length ? out : undefined;
};

export function BuiltinFieldRow({
	form,
	field,
	override,
	onChange,
}: {
	form: FormDefinition;
	field: RegistryField;
	override?: FieldOverride;
	onChange: (next: FieldOverride | undefined) => void;
}) {
	const [open, setOpen] = useState(false);
	const ov = override ?? {};
	const set = (patch: Partial<FieldOverride>) => onChange(clean({ ...ov, ...patch }));

	const variants = form.variants.filter((v) => fieldVariants(form, field).includes(v.key));
	const lockRequiredAll = field.lock?.required === true;
	const lockRequiredSome = Array.isArray(field.lock?.required) ? field.lock.required : [];
	const defaultRequired = variants.every((v) => inVariant(field.required, v.key));
	// Mặc định bắt buộc ở form này nhưng không ở form kia (vd Khoa/phòng)
	const mixedDefault = !lockRequiredAll && !defaultRequired && variants.some((v) => inVariant(field.required, v.key));
	const required = ov.required ?? defaultRequired;
	const hidden = ov.hidden ?? [];
	const allHidden = variants.every((v) => hidden.includes(v.key));
	const ruleable = hasRules(field.type, field.options, field.dynamic);

	const toggleVariant = (key: string) =>
		set({ hidden: hidden.includes(key) ? hidden.filter((h) => h !== key) : [...hidden, key] });

	return (
		<div className={cx(s.fieldRow, isOverridden(override) && s.fieldRowDirty, allHidden && s.fieldRowHidden)}>
			<div className={s.fieldMain}>
				<div className={s.fieldName}>
					<span className={s.fieldLabel}>{ov.label || field.label}</span>
					{ov.label && <span className={s.fieldOrig}>({field.label})</span>}
					<span className={s.typeTag}>{TYPE_LABEL[field.type]}</span>
					{field.lock && (
						<span
							className={cx(s.typeTag, s.typeTagLock)}
							title='Hệ thống cần trường này — có giới hạn khi ẩn / bỏ bắt buộc'
						>
							Hệ thống
						</span>
					)}
					{field.dynamic && <span className={s.typeTag}>Danh mục</span>}
					{field.when && <span className={s.typeTag}>{whenLabel(field.when)}</span>}
					{field.editOnly && <span className={s.typeTag}>Chỉ khi sửa</span>}
				</div>
				<div className={s.variantChips}>
					{variants.map((v) => {
						const locked = inVariant(field.lock?.visible, v.key);
						const on = !hidden.includes(v.key);
						return (
							<button
								key={v.key}
								type='button'
								className={cx(s.variantChip, on && s.variantChipOn)}
								disabled={locked}
								title={
									locked
										? 'Trường bắt buộc của hệ thống — luôn hiển thị'
										: on
											? 'Bấm để ẩn ở form này'
											: 'Bấm để hiện ở form này'
								}
								onClick={() => toggleVariant(v.key)}
							>
								{v.label}
							</button>
						);
					})}
				</div>
			</div>
			<div className={s.fieldSide}>
				{mixedDefault ? (
					<select
						className={s.reqSelect}
						value={ov.required === undefined ? '' : ov.required ? '1' : '0'}
						disabled={allHidden}
						onChange={(e) => set({ required: e.target.value === '' ? undefined : e.target.value === '1' })}
						title='Bắt buộc nhập'
					>
						<option value=''>Bắt buộc: theo mặc định</option>
						<option value='1'>Bắt buộc ở mọi form</option>
						<option value='0'>Không bắt buộc</option>
					</select>
				) : (
					<label
						className={s.reqBox}
						title={lockRequiredAll ? 'Hệ thống cần trường này để tạo bản ghi' : undefined}
					>
						<Toggle
							on={lockRequiredAll || required}
							disabled={lockRequiredAll || allHidden}
							onChange={() => set({ required: required === defaultRequired ? !required : undefined })}
							title='Bắt buộc nhập'
						/>
						<span>Bắt buộc</span>
					</label>
				)}
				<button
					type='button'
					className={cx(s.expandBtn, open && s.expandBtnOn)}
					onClick={() => setOpen((o) => !o)}
				>
					{open ? 'Thu gọn' : 'Tùy chỉnh'}
				</button>
			</div>
			{mixedDefault && ov.required === undefined && (
				<div className={s.fieldNote}>
					Mặc định bắt buộc ở:{' '}
					{variants
						.filter((v) => inVariant(field.required, v.key))
						.map((v) => v.label)
						.join(', ')}
				</div>
			)}
			{lockRequiredSome.length > 0 && ov.required === false && (
				<div className={s.fieldNote}>
					Vẫn bắt buộc ở:{' '}
					{form.variants
						.filter((v) => lockRequiredSome.includes(v.key))
						.map((v) => v.label)
						.join(', ')}
				</div>
			)}
			{open && (
				<div className={s.fieldDetail}>
					<div className={s.textRow}>
						<label className={s.ruleItem}>
							<span>Nhãn hiển thị</span>
							<input
								className={s.ruleInput}
								value={ov.label ?? ''}
								placeholder={field.label}
								maxLength={200}
								onChange={(e) => set({ label: e.target.value })}
							/>
						</label>
						{field.type !== 'select' && field.type !== 'date' && (
							<label className={s.ruleItem}>
								<span>Gợi ý trong ô nhập</span>
								<input
									className={s.ruleInput}
									value={ov.placeholder ?? ''}
									placeholder='Để trống = giữ nguyên'
									maxLength={200}
									onChange={(e) => set({ placeholder: e.target.value })}
								/>
							</label>
						)}
						<label className={cx(s.ruleItem, s.ruleWide)}>
							<span>Ghi chú dưới ô nhập</span>
							<input
								className={s.ruleInput}
								value={ov.hint ?? ''}
								placeholder='vd: Ghi đúng như trong quyết định'
								maxLength={500}
								onChange={(e) => set({ hint: e.target.value })}
							/>
						</label>
					</div>
					{ruleable && (
						<RulesEditor
							type={field.type}
							rules={ov.rules ?? {}}
							base={field.base}
							allOptions={field.options}
							onChange={(rules) => set({ rules })}
						/>
					)}
				</div>
			)}
		</div>
	);
}
