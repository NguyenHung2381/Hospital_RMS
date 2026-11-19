import type { ReactNode } from 'react';
import { DatePicker } from '@/shared/components';
import { CfgField } from '@/shared/formConfig/CfgField';
import { allowedOptions } from '@/shared/formConfig/allowedOptions';
import { GENDER_OPTIONS } from '@/shared/utils/gender';
import { defOf, todayIso, type InfoKey, type InvoiceKey } from '../../utils/courseRegisterFields';
import { COURSE_FIELD, useRegister } from './registerContext';
import styles from '../../pages/PublicPortal.module.css';

type Key = InfoKey | InvoiceKey;

interface BaseProps {
	name: Key;
	/** Đổi nhãn mặc định (admin đặt nhãn thì vẫn ưu tiên của admin) */
	label?: string;
	hint?: ReactNode;
	/** Chiếm cả hàng */
	full?: boolean;
	/** Thông báo lỗi riêng (vd: kiểm CCCD trực tiếp) — lỗi sau khi bấm "Tiếp tục" vẫn ưu tiên */
	liveError?: string;
}

export function TextField({
	name,
	label,
	hint,
	full,
	liveError,
	inputMode,
	autoComplete = 'off',
	placeholder,
	type = 'text',
	onBlur,
}: BaseProps & {
	inputMode?: 'numeric' | 'tel' | 'email' | 'text';
	autoComplete?: string;
	placeholder?: string;
	type?: 'text' | 'email' | 'tel';
	onBlur?: () => void;
}) {
	const { cfg, form, errors, setField } = useRegister();
	const def = defOf(name);
	return (
		<CfgField
			cfg={cfg}
			name={name}
			htmlFor={`f-${name}`}
			label={label ?? def.label}
			required={name === 'full_name' ? true : def.required}
			hint={hint}
			error={errors[name] ?? liveError}
			className={full ? styles.full : undefined}
			classes={COURSE_FIELD}
		>
			<input
				id={`f-${name}`}
				type={type}
				className={styles.input}
				value={form[name]}
				onChange={(e) => setField(name, e.target.value)}
				onBlur={onBlur}
				inputMode={inputMode}
				autoComplete={autoComplete}
				placeholder={placeholder}
				maxLength={def.rules?.maxLength}
			/>
		</CfgField>
	);
}

export function DateField({ name, label, hint, full }: BaseProps) {
	const { cfg, form, errors, setField } = useRegister();
	const def = defOf(name);
	return (
		<CfgField
			cfg={cfg}
			name={name}
			htmlFor={`f-${name}`}
			label={label ?? def.label}
			required={def.required}
			hint={hint}
			error={errors[name]}
			className={full ? styles.full : undefined}
			classes={COURSE_FIELD}
		>
			<DatePicker
				id={`f-${name}`}
				value={form[name]}
				hasError={!!errors[name]}
				max={todayIso()}
				onChange={(v) => setField(name, v)}
			/>
		</CfgField>
	);
}

export function SelectField({ name, label, hint, full }: BaseProps) {
	const { cfg, form, errors, setField, traineeTypes } = useRegister();
	const def = defOf(name);
	const options =
		name === 'gender'
			? allowedOptions(cfg, 'gender', GENDER_OPTIONS).map((o) => ({ value: o.value, label: o.label }))
			: traineeTypes.map((t) => ({ value: t.id, label: t.name }));
	return (
		<CfgField
			cfg={cfg}
			name={name}
			htmlFor={`f-${name}`}
			label={label ?? def.label}
			required={def.required}
			hint={hint}
			error={errors[name]}
			className={full ? styles.full : undefined}
			classes={COURSE_FIELD}
		>
			<select
				id={`f-${name}`}
				className={styles.select}
				value={form[name]}
				onChange={(e) => setField(name, e.target.value)}
				aria-invalid={errors[name] ? true : undefined}
			>
				<option value=''>-- Chọn --</option>
				{options.map((o) => (
					<option
						key={o.value}
						value={o.value}
					>
						{o.label}
					</option>
				))}
			</select>
		</CfgField>
	);
}
