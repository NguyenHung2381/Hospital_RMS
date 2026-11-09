import { useState, type InputHTMLAttributes } from 'react';
import { EyeOffSvg, EyeSvg } from '@/assets/icons';
import styles from '../pages/Login.module.css';

/** Ô mật khẩu kiểu trang đăng nhập (Login.module.css) kèm nút ẩn/hiện.
 * Đặt bên trong `.inputWrapper`. */
export function AuthPasswordInput({
	className,
	...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
	const [show, setShow] = useState(false);
	return (
		<>
			<input
				{...props}
				type={show ? 'text' : 'password'}
				className={[styles.inputField, styles.withToggle, className].filter(Boolean).join(' ')}
			/>
			<button
				type='button'
				className={styles.passwordToggle}
				onClick={() => setShow((v) => !v)}
				aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
				tabIndex={-1}
			>
				{show ? <EyeOffSvg width={18} height={18} /> : <EyeSvg width={18} height={18} />}
			</button>
		</>
	);
}
