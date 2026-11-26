import { markFieldControl, type FieldControlProps } from './fieldControl';
import styles from './Toggle.module.css';

/**
 * Công tắc bật/tắt dạng gạt (`role="switch"` + `aria-checked`).
 *
 * Tên truy cập (bắt buộc có một trong các cách): `label` / `aria-label` (không hiện ra),
 * `aria-labelledby`, hoặc đặt trong <FormField label=…> (tự nối nhãn qua id).
 * `title` giữ để tương thích — vẫn làm tooltip và làm tên khi không có `label`.
 *
 *   <Toggle on={active} onChange={() => setActive(!active)} label='Kích hoạt tài khoản' />
 */
export function Toggle({
	on,
	onChange,
	disabled,
	title,
	label,
	id,
	'aria-label': ariaLabel,
	'aria-labelledby': ariaLabelledBy,
	'aria-describedby': ariaDescribedBy,
	'aria-invalid': ariaInvalid,
	'aria-required': ariaRequired,
}: FieldControlProps & {
	on: boolean;
	onChange: () => void;
	disabled?: boolean;
	/** Tooltip; cũng làm tên truy cập khi không có `label` / `aria-label`. */
	title?: string;
	/** Tên truy cập của công tắc (không hiện ra màn hình). */
	label?: string;
	'aria-labelledby'?: string;
}) {
	return (
		<button
			type='button'
			role='switch'
			id={id}
			className={on ? `${styles.track} ${styles.on}` : styles.track}
			onClick={onChange}
			disabled={disabled}
			aria-checked={on}
			title={title}
			aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? label ?? title)}
			aria-labelledby={ariaLabelledBy}
			aria-describedby={ariaDescribedBy}
			aria-invalid={ariaInvalid}
			aria-required={ariaRequired}
		>
			<span
				className={styles.thumb}
				aria-hidden='true'
			/>
		</button>
	);
}

markFieldControl(Toggle);
