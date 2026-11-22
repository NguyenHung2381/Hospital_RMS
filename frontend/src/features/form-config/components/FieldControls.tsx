import { EyeOffSvg, EyeSvg, LockSvg } from '../../../assets/icons';
import { Toggle } from '../../../shared/components/Input/Toggle';
import { cx } from '../../../shared/utils/cx';
import s from '../pages/FormConfigs.module.css';
import type { FieldState } from '../utils/formConfigHelpers';

/** Nút mắt "Hiện / Ẩn" ở 1 form — khóa hệ thống thì hiện "Luôn hiện". */
export function VisibilityButton({
	on,
	locked,
	formLabel,
	onToggle,
}: {
	on: boolean;
	locked?: boolean;
	formLabel: string;
	onToggle: () => void;
}) {
	if (locked)
		return (
			<span
				className={cx(s.pill, s.pillLock)}
				title={`Hệ thống cần trường này — luôn hiện ở “${formLabel}”`}
			>
				<LockSvg /> Luôn hiện
			</span>
		);
	return (
		<button
			type='button'
			className={cx(s.pill, s.pillBtn, on ? s.pillOn : s.pillOff)}
			aria-pressed={on}
			title={on ? `Đang hiện ở “${formLabel}” — bấm để ẩn` : `Đang ẩn ở “${formLabel}” — bấm để hiện`}
			onClick={onToggle}
		>
			{on ? <EyeSvg /> : <EyeOffSvg />}
			{on ? 'Hiện' : 'Ẩn'}
		</button>
	);
}

/** Ô "Bắt buộc nhập" — công tắc, hoặc 3 lựa chọn khi mặc định khác nhau giữa các form. */
export function RequiredControl({
	st,
	value,
	onChange,
}: {
	st: FieldState;
	/** override.required hiện tại */
	value: boolean | undefined;
	onChange: (next: boolean | undefined) => void;
}) {
	if (st.lockRequiredAll)
		return (
			<span
				className={cx(s.pill, s.pillLock)}
				title='Hệ thống cần trường này để tạo bản ghi'
			>
				<LockSvg /> Luôn bắt buộc
			</span>
		);
	if (st.allHidden)
		return (
			<span
				className={s.muted}
				title='Trường đang ẩn ở mọi form nên không cần nhập'
			>
				— (đang ẩn)
			</span>
		);
	if (st.mixedDefault)
		return (
			<select
				className={s.reqSelect}
				value={value === undefined ? '' : value ? '1' : '0'}
				onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === '1')}
				title={`Mặc định chỉ bắt buộc ở: ${st.defaultRequiredIn.join(', ')}`}
			>
				<option value=''>Như mặc định</option>
				<option value='1'>Bắt buộc ở mọi form</option>
				<option value='0'>Không bắt buộc</option>
			</select>
		);
	return (
		<label className={s.reqBox}>
			<Toggle
				on={st.required}
				onChange={() => onChange(st.required === st.defaultRequired ? !st.required : undefined)}
				title='Bắt buộc nhập'
			/>
			<span className={st.required ? s.reqOn : s.reqOff}>{st.required ? 'Bắt buộc' : 'Không'}</span>
		</label>
	);
}
