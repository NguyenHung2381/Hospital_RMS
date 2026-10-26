import type { FieldOption, FieldRules, FieldType, TextFormat } from '../../../shared/formConfig/types';
import { FORMATS } from '../../../shared/formConfig/fieldRules';
import { cx } from '../../../shared/utils/cx';
import s from '../pages/FormConfigs.module.css';

const numOrUndef = (v: string) => (v.trim() === '' ? undefined : Number(v));
const strOrUndef = (v: string) => (v.trim() === '' ? undefined : v);

function NumBox({
	label,
	value,
	onChange,
	placeholder,
	step,
}: {
	label: string;
	value: number | undefined;
	onChange: (v: number | undefined) => void;
	placeholder?: string;
	step?: string;
}) {
	return (
		<label className={s.ruleItem}>
			<span>{label}</span>
			<input
				type='number'
				className={s.ruleInput}
				value={value ?? ''}
				step={step}
				placeholder={placeholder}
				onChange={(e) => onChange(numOrUndef(e.target.value))}
			/>
		</label>
	);
}

function DateBox({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string | undefined;
	onChange: (v: string | undefined) => void;
}) {
	const isToday = value === 'today';
	return (
		<label className={s.ruleItem}>
			<span>{label}</span>
			<div className={s.ruleDate}>
				<select
					className={s.ruleInput}
					value={!value ? '' : isToday ? 'today' : 'fixed'}
					onChange={(e) =>
						onChange(
							e.target.value === 'today'
								? 'today'
								: e.target.value === 'fixed'
									? new Date().toISOString().slice(0, 10)
									: undefined,
						)
					}
				>
					<option value=''>Không giới hạn</option>
					<option value='today'>Ngày hiện tại</option>
					<option value='fixed'>Ngày cố định</option>
				</select>
				{value && !isToday && (
					<input
						type='date'
						className={s.ruleInput}
						value={value}
						onChange={(e) => onChange(strOrUndef(e.target.value))}
					/>
				)}
			</div>
		</label>
	);
}

/**
 * Ô sửa ràng buộc theo loại trường. `base` = giới hạn cứng của trường có sẵn
 * (hiện làm gợi ý — server từ chối nếu nới lỏng hơn). `allOptions` có = trường
 * select có sẵn, cho thu hẹp danh sách lựa chọn.
 */
export function RulesEditor({
	type,
	rules,
	base,
	allOptions,
	onChange,
}: {
	type: FieldType;
	rules: FieldRules;
	base?: FieldRules;
	allOptions?: FieldOption[] | null;
	onChange: (next: FieldRules) => void;
}) {
	const set = <K extends keyof FieldRules>(k: K, v: FieldRules[K]) => onChange({ ...rules, [k]: v });
	const isText = type === 'text' || type === 'textarea' || type === 'email' || type === 'phone';

	return (
		<div className={s.rules}>
			{isText && (
				<>
					{(type === 'text' || type === 'textarea') && (
						<NumBox
							label='Tối thiểu (ký tự)'
							value={rules.minLength}
							onChange={(v) => set('minLength', v)}
							step='1'
						/>
					)}
					<NumBox
						label='Tối đa (ký tự)'
						value={rules.maxLength}
						onChange={(v) => set('maxLength', v)}
						placeholder={base?.maxLength ? `≤ ${base.maxLength}` : undefined}
						step='1'
					/>
				</>
			)}
			{type === 'text' && (
				<label className={s.ruleItem}>
					<span>Định dạng</span>
					<select
						className={s.ruleInput}
						value={rules.format ?? ''}
						onChange={(e) => set('format', (e.target.value || undefined) as TextFormat | undefined)}
					>
						<option value=''>Tự do</option>
						{(Object.keys(FORMATS) as TextFormat[]).map((k) => (
							<option
								key={k}
								value={k}
							>
								{FORMATS[k].label}
							</option>
						))}
					</select>
				</label>
			)}
			{(type === 'text' || type === 'textarea') && (
				<>
					<label className={cx(s.ruleItem, s.ruleWide)}>
						<span>Mẫu kiểm tra (regex, khớp toàn bộ giá trị)</span>
						<input
							className={s.ruleInput}
							value={rules.pattern ?? ''}
							placeholder='vd: \d{4}-\d{4}-\d{4}-\d{3}[\dX]'
							onChange={(e) => set('pattern', strOrUndef(e.target.value))}
						/>
					</label>
					{rules.pattern && (
						<label className={cx(s.ruleItem, s.ruleWide)}>
							<span>Thông báo khi sai mẫu</span>
							<input
								className={s.ruleInput}
								value={rules.patternMessage ?? ''}
								placeholder='vd: Mã ORCID gồm 16 ký tự dạng 0000-0000-0000-0000'
								onChange={(e) => set('patternMessage', strOrUndef(e.target.value))}
							/>
						</label>
					)}
				</>
			)}
			{type === 'number' && (
				<>
					<NumBox
						label='Nhỏ nhất'
						value={rules.min}
						onChange={(v) => set('min', v)}
						placeholder={base?.min !== undefined ? `≥ ${base.min}` : undefined}
					/>
					<NumBox
						label='Lớn nhất'
						value={rules.max}
						onChange={(v) => set('max', v)}
						placeholder={base?.max !== undefined && base.max < 1e12 ? `≤ ${base.max}` : undefined}
					/>
					<label className={s.ruleCheck}>
						<input
							type='checkbox'
							checked={!!rules.integer}
							onChange={(e) => set('integer', e.target.checked || undefined)}
						/>
						Chỉ số nguyên
					</label>
				</>
			)}
			{type === 'date' && (
				<>
					<DateBox
						label='Không trước ngày'
						value={rules.minDate}
						onChange={(v) => set('minDate', v)}
					/>
					<DateBox
						label='Không sau ngày'
						value={rules.maxDate}
						onChange={(v) => set('maxDate', v)}
					/>
				</>
			)}
			{type === 'multiselect' && (
				<NumBox
					label='Chọn tối đa'
					value={rules.maxItems}
					onChange={(v) => set('maxItems', v)}
					step='1'
				/>
			)}
			{type === 'select' && allOptions && (
				<div className={cx(s.ruleItem, s.ruleWide)}>
					<span>Lựa chọn được phép</span>
					<div className={s.optChips}>
						{allOptions.map((o) => {
							const keep = rules.options ?? allOptions.map((x) => x.value);
							const on = keep.includes(o.value);
							return (
								<button
									key={o.value}
									type='button'
									className={cx(s.optChip, on && s.optChipOn)}
									title={on && keep.length === 1 ? 'Phải giữ ít nhất 1 lựa chọn' : undefined}
									onClick={() => {
										if (on && keep.length === 1) return;
										const next = on ? keep.filter((v) => v !== o.value) : [...keep, o.value];
										set('options', next.length === allOptions.length ? undefined : next);
									}}
								>
									{o.label}
								</button>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
