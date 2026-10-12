import styles from './Toggle.module.css';

/** Công tắc bật/tắt dạng gạt. */
export function Toggle({
	on,
	onChange,
	disabled,
	title,
}: {
	on: boolean;
	onChange: () => void;
	disabled?: boolean;
	title?: string;
}) {
	return (
		<button
			type='button'
			className={on ? `${styles.track} ${styles.on}` : styles.track}
			onClick={onChange}
			disabled={disabled}
			aria-pressed={on}
			title={title}
			aria-label={title}
		>
			<span className={styles.thumb} />
		</button>
	);
}
