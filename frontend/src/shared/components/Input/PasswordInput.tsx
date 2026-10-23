import { useState } from 'react';
import { EyeOffSvg, EyeSvg } from '@/assets/icons';
import { cx } from '../../utils/cx';
import { generateTempPassword } from '../../utils/password';
import m from '../Modal/Modal.module.css';
import styles from './PasswordInput.module.css';

/** Ô nhập mật khẩu có nút ẩn/hiện. `generate` thêm nút "Tạo ngẫu nhiên" bên phải
 * (điền mật khẩu tạm và tự hiện để người cấp đọc lại được). */
export function PasswordInput({
	id,
	value,
	onChange,
	placeholder,
	invalid,
	generate,
	autoComplete = 'new-password',
	className,
	disabled,
}: {
	id?: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	invalid?: boolean;
	generate?: boolean;
	autoComplete?: string;
	/** Thay class ô nhập mặc định (formInput của Modal). */
	className?: string;
	disabled?: boolean;
}) {
	const [show, setShow] = useState(false);
	const field = (
		<div className={styles.field}>
			<input
				id={id}
				type={show ? 'text' : 'password'}
				className={cx(className ?? m.formInput, invalid && m.inputError, styles.input)}
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				autoComplete={autoComplete}
				disabled={disabled}
			/>
			<button
				type='button'
				className={styles.toggle}
				onClick={() => setShow((v) => !v)}
				aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
				tabIndex={-1}
			>
				{show ? <EyeOffSvg /> : <EyeSvg />}
			</button>
		</div>
	);
	if (!generate) return field;
	return (
		<div className={styles.row}>
			{field}
			<button
				type='button'
				className={styles.generate}
				disabled={disabled}
				onClick={() => {
					onChange(generateTempPassword());
					setShow(true);
				}}
			>
				Tạo ngẫu nhiên
			</button>
		</div>
	);
}
