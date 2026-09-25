import { useCallback, useEffect, useState } from 'react';
import { getCaptcha, type Captcha } from '../api/publicApi';
import TurnstileWidget from '../components/TurnstileWidget';
import styles from '../pages/PublicPortal.module.css';

export type CaptchaPayload = { captcha_token: string; captcha_answer: string };

// Chống bot dùng chung cho các form công khai. Server quyết định chế độ (phép
// tính hoặc Cloudflare Turnstile). Mỗi mã chỉ dùng được 1 lần: gọi reload() sau
// mỗi lần gửi form (thành công hay lỗi).
export function useCaptcha() {
	const [captcha, setCaptcha] = useState<Captcha | null>(null);
	const [answer, setAnswer] = useState('');
	const [turnstileToken, setTurnstileToken] = useState('');
	const [widgetKey, setWidgetKey] = useState(0);
	const [loadError, setLoadError] = useState('');

	const fetchCaptcha = useCallback(
		() =>
			getCaptcha()
				.then(setCaptcha)
				.catch(() => setCaptcha(null)),
		[],
	);

	useEffect(() => {
		void fetchCaptcha();
	}, [fetchCaptcha]);

	const reload = useCallback(() => {
		setAnswer('');
		setTurnstileToken('');
		setLoadError('');
		setWidgetKey((k) => k + 1); // vẽ lại widget Turnstile → token mới
		void fetchCaptcha();
	}, [fetchCaptcha]);

	// null = chưa hoàn tất xác nhận
	const payload: CaptchaPayload | null =
		captcha?.provider === 'turnstile'
			? turnstileToken
				? { captcha_token: turnstileToken, captcha_answer: '' }
				: null
			: captcha && answer.trim()
				? { captcha_token: captcha.token, captcha_answer: answer.trim() }
				: null;

	const field =
		captcha?.provider === 'turnstile' ? (
			<div className={styles.formGroup}>
				<TurnstileWidget
					key={widgetKey}
					siteKey={captcha.site_key}
					onToken={setTurnstileToken}
					onError={setLoadError}
				/>
				{loadError && (
					<span style={{ color: '#dc2626', fontSize: 13 }}>
						{loadError} — kiểm tra kết nối mạng rồi tải lại trang.
					</span>
				)}
			</div>
		) : (
			<div className={styles.formGroup}>
				<label className={styles.label}>Nhập kết quả phép tính bên dưới</label>
				<div className={styles.captchaRow}>
					<span className={styles.captchaQuestion}>{captcha?.question ?? '...'}</span>
					<button
						type='button'
						className={styles.captchaRefresh}
						onClick={reload}
					>
						Đổi câu hỏi
					</button>
				</div>
				<input
					className={styles.input}
					value={answer}
					onChange={(e) => setAnswer(e.target.value)}
					placeholder='Nhập đáp án'
					inputMode='numeric'
					style={{ marginTop: 8, maxWidth: 200 }}
				/>
			</div>
		);

	return { payload, reload, field };
}
