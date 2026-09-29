import styles from './HumanCheckbox.module.css';

export type HumanCheckState = 'idle' | 'verifying' | 'verified' | 'error';

// Ô "Tôi không phải người máy" kiểu reCAPTCHA / Turnstile cho chế độ
// proof-of-work tự host (hooks/useCaptcha.tsx lo phần giải & gửi mã).
export default function HumanCheckbox({
	state,
	errorText,
	onCheck,
	onRetry,
}: {
	state: HumanCheckState;
	/** Lý do thất bại hiển thị khi state = 'error' */
	errorText?: string;
	onCheck: () => void;
	onRetry: () => void;
}) {
	const label =
		state === 'verified'
			? 'Đã xác minh'
			: state === 'verifying'
				? 'Đang xác minh…'
				: state === 'error'
					? errorText || 'Xác minh thất bại'
					: 'Tôi không phải người máy';

	return (
		<div
			className={styles.box}
			data-state={state}
		>
			<button
				type='button'
				role='checkbox'
				aria-checked={state === 'verified'}
				aria-busy={state === 'verifying'}
				aria-label='Tôi không phải người máy'
				className={styles.check}
				disabled={state === 'verifying' || state === 'verified'}
				onClick={state === 'error' ? onRetry : onCheck}
			>
				{state === 'verifying' && <span className={styles.spinner} />}
				{state === 'verified' && (
					<svg
						viewBox='0 0 24 24'
						className={styles.tick}
						aria-hidden
					>
						<path d='M4 12.5l5 5L20 6.5' />
					</svg>
				)}
			</button>
			<div
				className={styles.text}
				aria-live='polite'
			>
				<span className={styles.label}>{label}</span>
				{state === 'error' && (
					<button
						type='button'
						className={styles.retry}
						onClick={onRetry}
					>
						Thử lại
					</button>
				)}
			</div>
			<div className={styles.brand}>
				<svg
					viewBox='0 0 24 24'
					className={styles.logo}
					aria-hidden
				>
					<path d='M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z' />
					<path
						d='M8.5 12l2.5 2.5 4.5-5'
						className={styles.logoTick}
					/>
				</svg>
				<span className={styles.brandName}>RMS Shield</span>
				<span className={styles.brandSub}>Chống bot · Bảo mật</span>
			</div>
		</div>
	);
}
