import { useMemo, useState } from 'react';
import { EyeOffSvg } from '../../../assets/icons';
import { Button, Drawer, DrawerSection } from '../../../shared/components';
import { CfgField } from '../../../shared/formConfig/CfgField';
import { resolveForm } from '../../../shared/formConfig/fieldRules';
import type { FieldOverride, FormDefinition, RegistryField } from '../../../shared/formConfig/types';
import { configFromResolved } from '../../../shared/formConfig/useFormConfig';
import { cx } from '../../../shared/utils/cx';
import s from '../pages/FormConfigs.module.css';
import { sampleInput } from '../utils/sampleInput';
import {
	canUseChoices,
	cleanOverride,
	fieldState,
	hasRules,
	isOverridden,
	shortVariant,
} from '../utils/formConfigHelpers';
import { FieldTags } from './BuiltinFieldRow';
import { ChoicesEditor } from './ChoicesEditor';
import { RequiredControl, VisibilityButton } from './FieldControls';
import { RulesEditor } from './RulesEditor';

/** Một ô sửa chữ có lời giải thích ngắn bên dưới. */
function TextSetting({
	label,
	help,
	value,
	placeholder,
	maxLength,
	onChange,
}: {
	label: string;
	help: string;
	value: string;
	placeholder?: string;
	maxLength: number;
	onChange: (v: string) => void;
}) {
	return (
		<label className={s.setting}>
			<span className={s.settingLabel}>{label}</span>
			<input
				className={s.ruleInput}
				value={value}
				placeholder={placeholder}
				maxLength={maxLength}
				onChange={(e) => onChange(e.target.value)}
			/>
			<span className={s.settingHelp}>{help}</span>
		</label>
	);
}

/**
 * Ngăn kéo chỉnh chi tiết 1 trường có sẵn: xem trước ngay ô đó, hiển thị theo
 * từng form, bắt buộc, chữ hiển thị và giới hạn giá trị. Sửa là vào bản nháp ngay.
 */
export function FieldDetailDrawer({
	form,
	field,
	override,
	onChange,
	onClose,
}: {
	form: FormDefinition;
	field: RegistryField;
	override?: FieldOverride;
	onChange: (next: FieldOverride | undefined) => void;
	onClose: () => void;
}) {
	const ov = override ?? {};
	const set = (patch: Partial<FieldOverride>) => onChange(cleanOverride({ ...ov, ...patch }));
	const st = fieldState(form, field, ov);
	const [variant, setVariant] = useState(st.variants[0]?.key ?? form.variants[0].key);
	const [sample, setSample] = useState('');
	const [check, setCheck] = useState<string | null | undefined>(); // undefined = chưa thử, null = hợp lệ

	const resolved = useMemo(
		() => resolveForm({ ...form, fields: [field] }, { fields: override ? { [field.key]: override } : {} }, variant),
		[form, field, override, variant],
	);
	const cfg = useMemo(() => configFromResolved(resolved), [resolved]);
	const rf = resolved.fields[field.key];
	const ruleable = hasRules(field.type, field.options, field.dynamic) && !ov.choices?.length;
	const toggleVariant = (key: string) =>
		set({
			hidden: st.hidden.includes(key) ? st.hidden.filter((h) => h !== key) : [...st.hidden, key],
		});

	return (
		<Drawer
			open
			onClose={onClose}
			size='md'
			title={ov.label || field.label}
			subtitle={`Trường có sẵn của “${form.title}”`}
			headerExtra={
				<div className={s.fieldTags}>
					<FieldTags
						form={form}
						field={field}
					/>
				</div>
			}
			footer={
				<>
					<span className={s.drawerNote}>Thay đổi vào bản nháp ngay — nhớ bấm “Lưu cấu hình”.</span>
					{isOverridden(override) && (
						<Button
							variant='ghost'
							onClick={() => onChange(undefined)}
						>
							Về mặc định
						</Button>
					)}
					<Button onClick={onClose}>Xong</Button>
				</>
			}
		>
			<DrawerSection title='Người dùng sẽ thấy'>
				{st.variants.length > 1 && (
					<div className={s.segment}>
						{st.variants.map((v) => (
							<button
								key={v.key}
								type='button'
								className={cx(s.segBtn, v.key === variant && s.segBtnOn)}
								onClick={() => {
									setVariant(v.key);
									setCheck(undefined);
								}}
							>
								{shortVariant(v.label)}
							</button>
						))}
					</div>
				)}
				<div className={s.fieldStage}>
					{rf && rf.visible ? (
						<>
							<CfgField
								cfg={cfg}
								name={field.key}
								label={field.label}
								error={check ?? undefined}
							>
								{sampleInput(rf, sample, (v) => {
									setSample(v);
									setCheck(undefined);
								})}
							</CfgField>
							<div className={s.stageFoot}>
								{check === null ? (
									<span className={s.previewOk}>✓ Giá trị hợp lệ</span>
								) : (
									<span>Gõ thử giá trị rồi bấm kiểm tra để xem thông báo lỗi.</span>
								)}
								<button
									type='button'
									className={s.linkBtn}
									onClick={() => setCheck(cfg.validate({ [field.key]: sample })[field.key] ?? null)}
								>
									Thử kiểm tra
								</button>
							</div>
						</>
					) : (
						<div className={s.stageHidden}>
							<EyeOffSvg /> Trường này đang ẩn ở form “
							{shortVariant(form.variants.find((v) => v.key === variant)?.label ?? '')}”
						</div>
					)}
				</div>
			</DrawerSection>

			<DrawerSection title='Hiện ở form nào'>
				<div className={s.variantList}>
					{st.variants.map((v) => (
						<div
							key={v.key}
							className={s.variantLine}
						>
							<span className={s.variantName}>{v.label}</span>
							<VisibilityButton
								on={st.shown(v.key)}
								locked={st.lockedVisible(v.key)}
								formLabel={v.label}
								onToggle={() => toggleVariant(v.key)}
							/>
						</div>
					))}
				</div>
			</DrawerSection>

			<DrawerSection title='Bắt buộc nhập'>
				<div className={s.variantLine}>
					<span className={s.settingHelp}>
						{st.allHidden
							? 'Trường đang ẩn ở mọi form — hiện lại ở mục trên thì mới đặt bắt buộc được.'
							: st.mixedDefault
								? `Mặc định chỉ bắt buộc ở: ${st.defaultRequiredIn.join(', ')}.`
								: 'Bật thì người dùng không gửi được form khi bỏ trống ô này.'}
					</span>
					<RequiredControl
						st={st}
						value={ov.required}
						onChange={(required) => set({ required })}
					/>
				</div>
			</DrawerSection>

			{canUseChoices(field) && (
				<DrawerSection title='Kiểu nhập'>
					<ChoicesEditor
						choices={ov.choices}
						maxLength={field.base?.maxLength ?? 500}
						onChange={(choices) => set({ choices, ...(choices && { rules: undefined }) })}
					/>
				</DrawerSection>
			)}

			<DrawerSection title='Chữ hiển thị'>
				<div className={s.settingList}>
					<TextSetting
						label='Nhãn'
						help={`Tên ô in đậm phía trên. Để trống = giữ “${field.label}”.`}
						value={ov.label ?? ''}
						placeholder={field.label}
						maxLength={200}
						onChange={(label) => set({ label })}
					/>
					{ov.choices?.length ? (
						<TextSetting
							label='Dòng chưa chọn'
							help='Chữ hiện ở dòng đầu khi người dùng chưa chọn gì.'
							value={ov.placeholder ?? ''}
							placeholder='— Chọn —'
							maxLength={200}
							onChange={(placeholder) => set({ placeholder })}
						/>
					) : null}
					{field.type !== 'select' && field.type !== 'date' && !ov.choices?.length && (
						<TextSetting
							label='Gợi ý trong ô nhập'
							help='Chữ mờ hiện trong ô khi còn trống, mất đi khi bắt đầu gõ.'
							value={ov.placeholder ?? ''}
							placeholder='vd: Nhập đầy đủ họ và tên'
							maxLength={200}
							onChange={(placeholder) => set({ placeholder })}
						/>
					)}
					<TextSetting
						label='Ghi chú dưới ô nhập'
						help='Dòng chữ nhỏ luôn hiện dưới ô — hướng dẫn cách điền.'
						value={ov.hint ?? ''}
						placeholder='vd: Ghi đúng như trong quyết định'
						maxLength={500}
						onChange={(hint) => set({ hint })}
					/>
				</div>
			</DrawerSection>

			{ruleable && (
				<DrawerSection title='Giới hạn giá trị được nhập'>
					<p className={s.settingHelp}>
						Để trống = không giới hạn thêm. Chỉ được siết chặt hơn giới hạn sẵn có của hệ thống (số mờ trong ô).
					</p>
					<RulesEditor
						type={field.type}
						rules={ov.rules ?? {}}
						base={field.base}
						allOptions={field.options}
						onChange={(rules) => set({ rules })}
					/>
				</DrawerSection>
			)}
		</Drawer>
	);
}
