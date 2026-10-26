import { useState } from 'react';
import { Button, Modal } from '../../../shared/components';
import { FormField } from '../../../shared/components/Input/FormField';
import { Toggle } from '../../../shared/components/Input/Toggle';
import m from '../../../shared/components/Modal/Modal.module.css';
import type { CustomFieldDef, CustomFieldType, FieldOption, FormDefinition } from '../../../shared/formConfig/types';
import { cx } from '../../../shared/utils/cx';
import { removeDiacritics } from '../../../shared/utils/helper';
import s from '../pages/FormConfigs.module.css';
import { cleanRules, hasRules, TYPE_LABEL } from '../utils/formConfigHelpers';
import { RulesEditor } from './RulesEditor';

const TYPES: CustomFieldType[] = [
	'text',
	'textarea',
	'number',
	'date',
	'select',
	'multiselect',
	'checkbox',
	'email',
	'phone',
];

const slug = (v: string) =>
	removeDiacritics(v)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 30);

// Mã trường cố định từ lúc tạo (giá trị đã nhập lưu theo mã này) — thêm đuôi
// ngẫu nhiên để 2 trường cùng tên không đụng nhau.
const newKey = (label: string, taken: Set<string>) => {
	let key: string;
	do key = `cf_${slug(label) || 'truong'}_${Math.random().toString(36).slice(2, 6)}`;
	while (taken.has(key));
	return key;
};

const newOptionValue = (label: string, taken: string[]) => {
	const base = slug(label) || 'lua_chon';
	let v = base;
	for (let i = 2; taken.includes(v); i++) v = `${base}_${i}`;
	return v;
};

export function CustomFieldModal({
	form,
	initial,
	takenKeys,
	onClose,
	onSave,
}: {
	form: FormDefinition;
	initial: CustomFieldDef | null;
	takenKeys: Set<string>;
	onClose: () => void;
	onSave: (f: CustomFieldDef) => void;
}) {
	const [f, setF] = useState<CustomFieldDef>(initial ?? { key: '', label: '', type: 'text', required: false });
	const [error, setError] = useState('');
	const set = (patch: Partial<CustomFieldDef>) => setF((x) => ({ ...x, ...patch }));
	const hasOptions = f.type === 'select' || f.type === 'multiselect';
	const options: FieldOption[] = f.options ?? [];
	const variants = f.variants?.length ? f.variants : form.variants.map((v) => v.key);

	const setOption = (i: number, label: string) =>
		set({ options: options.map((o, j) => (j === i ? { ...o, label } : o)) });
	const addOption = () =>
		set({
			options: [
				...options,
				{
					value: newOptionValue(
						`lua chon ${options.length + 1}`,
						options.map((o) => o.value),
					),
					label: '',
				},
			],
		});

	const submit = () => {
		const label = f.label.trim();
		if (!label) return setError('Vui lòng nhập tên trường');
		let opts: FieldOption[] | undefined;
		if (hasOptions) {
			const filled = options.filter((o) => o.label.trim());
			if (!filled.length) return setError('Cần ít nhất 1 lựa chọn');
			// Lựa chọn mới thêm: đặt giá trị theo tên (giá trị cũ giữ nguyên khi đổi tên)
			const used: string[] = [];
			opts = filled.map((o) => {
				const isNew = !initial?.options?.some((x) => x.value === o.value);
				const value = isNew ? newOptionValue(o.label, used) : o.value;
				used.push(value);
				return { value, label: o.label.trim() };
			});
		}
		const typeChanged = initial && initial.type !== f.type;
		onSave({
			key: initial?.key ?? newKey(label, takenKeys),
			label,
			type: f.type,
			...(f.required && { required: true }),
			...(f.variants?.length && f.variants.length < form.variants.length && { variants: f.variants }),
			...(f.placeholder?.trim() && { placeholder: f.placeholder.trim() }),
			...(f.hint?.trim() && { hint: f.hint.trim() }),
			...(opts && { options: opts }),
			...(!typeChanged && f.rules && cleanRules(f.rules) && { rules: cleanRules(f.rules) }),
		});
	};

	return (
		<Modal
			open
			onClose={onClose}
			title={initial ? 'Sửa trường tùy chỉnh' : 'Thêm trường tùy chỉnh'}
			subtitle={form.title}
			bodyClassName={m.stack}
			footer={
				<>
					{error && <span className={s.modalError}>{error}</span>}
					<Button
						variant='ghost'
						onClick={onClose}
					>
						Hủy
					</Button>
					<Button onClick={submit}>{initial ? 'Cập nhật' : 'Thêm trường'}</Button>
				</>
			}
		>
			<div className={m.formRow}>
				<FormField
					htmlFor='cf-label'
					label='Tên trường'
					required
				>
					<input
						id='cf-label'
						className={m.formInput}
						value={f.label}
						maxLength={200}
						placeholder='vd: Mã ORCID chủ nhiệm'
						onChange={(e) => set({ label: e.target.value })}
						autoFocus
					/>
				</FormField>
				<FormField
					htmlFor='cf-type'
					label='Loại dữ liệu'
				>
					<select
						id='cf-type'
						className={m.formInput}
						value={f.type}
						onChange={(e) => {
							const type = e.target.value as CustomFieldType;
							set({
								type,
								rules: undefined,
								options: type === 'select' || type === 'multiselect' ? (f.options?.length ? f.options : []) : undefined,
							});
						}}
					>
						{TYPES.map((t) => (
							<option
								key={t}
								value={t}
							>
								{TYPE_LABEL[t]}
							</option>
						))}
					</select>
				</FormField>
			</div>
			{initial && initial.type !== f.type && (
				<div className={m.formHint}>
					Đổi loại dữ liệu: giá trị đã nhập trước đây có thể không còn hợp lệ khi sửa bản ghi.
				</div>
			)}

			<FormField label='Hiện ở form'>
				<div className={s.variantChips}>
					{form.variants.map((v) => {
						const on = variants.includes(v.key);
						return (
							<button
								key={v.key}
								type='button'
								className={cx(s.variantChip, on && s.variantChipOn)}
								onClick={() => {
									const next = on ? variants.filter((x) => x !== v.key) : [...variants, v.key];
									if (next.length) set({ variants: next });
								}}
							>
								{v.label}
							</button>
						);
					})}
				</div>
			</FormField>

			<label className={s.reqBox}>
				<Toggle
					on={!!f.required}
					onChange={() => set({ required: !f.required })}
					title='Bắt buộc nhập'
				/>
				<span>{f.type === 'checkbox' ? 'Bắt buộc đánh dấu (vd: cam kết, đồng ý điều khoản)' : 'Bắt buộc nhập'}</span>
			</label>

			{hasOptions && (
				<FormField
					label='Danh sách lựa chọn'
					required
				>
					<div className={s.optList}>
						{options.map((o, i) => (
							<div
								key={o.value}
								className={s.optRow}
							>
								<input
									className={m.formInput}
									value={o.label}
									maxLength={200}
									placeholder={`Lựa chọn ${i + 1}`}
									onChange={(e) => setOption(i, e.target.value)}
								/>
								<button
									type='button'
									className={s.iconBtn}
									title='Xóa lựa chọn'
									onClick={() => set({ options: options.filter((_, j) => j !== i) })}
								>
									✕
								</button>
							</div>
						))}
						<Button
							variant='secondary'
							size='sm'
							onClick={addOption}
							disabled={options.length >= 100}
						>
							+ Thêm lựa chọn
						</Button>
					</div>
				</FormField>
			)}

			<div className={m.formRow}>
				{f.type !== 'date' && f.type !== 'multiselect' && (
					<FormField
						htmlFor='cf-ph'
						label={
							f.type === 'checkbox'
								? 'Nội dung cạnh ô đánh dấu'
								: f.type === 'select'
									? 'Dòng chưa chọn'
									: 'Gợi ý trong ô nhập'
						}
					>
						<input
							id='cf-ph'
							className={m.formInput}
							value={f.placeholder ?? ''}
							maxLength={200}
							placeholder={f.type === 'checkbox' ? 'vd: Tôi cam kết thông tin trên là đúng sự thật' : ''}
							onChange={(e) => set({ placeholder: e.target.value })}
						/>
					</FormField>
				)}
				<FormField
					htmlFor='cf-hint'
					label='Ghi chú dưới ô nhập'
				>
					<input
						id='cf-hint'
						className={m.formInput}
						value={f.hint ?? ''}
						maxLength={500}
						onChange={(e) => set({ hint: e.target.value })}
					/>
				</FormField>
			</div>

			{hasRules(f.type, hasOptions ? options : null) && f.type !== 'select' && (
				<FormField label='Ràng buộc giá trị'>
					<RulesEditor
						type={f.type}
						rules={f.rules ?? {}}
						onChange={(rules) => set({ rules })}
					/>
				</FormField>
			)}
		</Modal>
	);
}
